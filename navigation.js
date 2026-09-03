(() => {
  "use strict";

  const app = window.Outabout;
  const map = app.map;
  const tracking = app.state.tracking;
  let watchId = null;
  let elapsedBeforePause = 0;
  let startedAt = 0;
  let timer = null;
  let liveMarker = null;
  let lastHeading = null;
  let northUp = false;

  function makeLocationElement(arrow = false) {
    const element = document.createElement("div");
    element.className = arrow
      ? "live-location-marker"
      : "static-location-marker";
    if (arrow) {
      const shape = document.createElement("div");
      shape.className = "live-location-arrow";
      element.appendChild(shape);
    }
    return element;
  }

  function setStaticLocation(coord, { pan = false, accuracy = null } = {}) {
    if (!app.util.validCoord(coord)) return;
    app.state.gps.coord = app.util.coord(coord);
    app.state.gps.accuracy = Number.isFinite(accuracy)
      ? accuracy
      : app.state.gps.accuracy;
    app.state.gps.marker?.remove();
    app.state.gps.marker = new maplibregl.Marker({
      element: makeLocationElement(false),
    })
      .setLngLat(coord)
      .addTo(map);
    if (pan) map.flyTo({ center: coord, zoom: Math.max(map.getZoom(), 15) });
    app.emit("gps:update", {
      coord: app.state.gps.coord,
      accuracy: app.state.gps.accuracy,
    });
  }

  function geolocationError(error, silent = false) {
    const message =
      error?.code === 1
        ? "Standortzugriff wurde nicht erlaubt."
        : error?.code === 3
          ? "Standortbestimmung hat zu lange gedauert."
          : "Standort konnte nicht bestimmt werden.";
    if (!silent || error?.code !== 1) app.setStatus(message, "warning");
  }

  function requestLocation({ pan = true, silent = false } = {}) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation || !window.isSecureContext) {
        const error = new Error(
          "Standort benötigt einen Browser mit HTTPS-Geolocation.",
        );
        if (!silent) app.setStatus(error.message, "error");
        reject(error);
        return;
      }
      if (!silent) app.setStatus("Standort wird ermittelt …");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coord = [position.coords.longitude, position.coords.latitude];
          setStaticLocation(coord, { pan, accuracy: position.coords.accuracy });
          if (!silent)
            app.setStatus(
              `Standort aktiv · ± ${Math.round(position.coords.accuracy || 0)} m`,
            );
          resolve(coord);
        },
        (error) => {
          geolocationError(error, silent);
          reject(error);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
      );
    });
  }

  function installTrackLayer() {
    if (!map.getSource("outabout-track")) {
      map.addSource("outabout-track", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    if (!map.getLayer("outabout-track-line")) {
      map.addLayer({
        id: "outabout-track-line",
        type: "line",
        source: "outabout-track",
        paint: { "line-width": 5, "line-color": "#176b36", "line-opacity": 1 },
      });
    }
  }

  function drawTrack() {
    const data =
      tracking.points.length >= 2
        ? {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: tracking.points },
          }
        : { type: "FeatureCollection", features: [] };
    try {
      map.getSource("outabout-track")?.setData(data);
    } catch (error) {
      app.log("tracking:draw", error);
    }
  }

  function routeHeading(coord) {
    const route = app.state.route;
    if (!route.coords?.length) return null;
    const index = app.planner.nearestRouteIndex(coord);
    let next = Math.min(index + 1, route.coords.length - 1);
    while (
      next < route.coords.length - 1 &&
      app.util.km(coord, route.coords[next]) < 0.05
    )
      next += 1;
    return app.util.bearing(coord, route.coords[next]);
  }

  function headingFor(position, coord) {
    const sensor = Number(position.coords.heading);
    const speed = Number(position.coords.speed);
    if (
      Number.isFinite(sensor) &&
      sensor >= 0 &&
      (!Number.isFinite(speed) || speed > 0.4)
    ) {
      lastHeading = sensor;
      return sensor;
    }
    const route = routeHeading(coord);
    if (Number.isFinite(route)) lastHeading = route;
    return Number.isFinite(route) ? route : lastHeading;
  }

  function updateLiveMarker(coord, heading) {
    if (!liveMarker) {
      liveMarker = new maplibregl.Marker({ element: makeLocationElement(true) })
        .setLngLat(coord)
        .addTo(map);
    } else liveMarker.setLngLat(coord);
    const arrow = liveMarker.getElement().querySelector(".live-location-arrow");
    if (arrow)
      arrow.style.transform = `rotate(${(heading || 0) - map.getBearing()}deg)`;
  }

  function followCamera(coord, heading, immediate = false) {
    if (!tracking.follow) return;
    map.easeTo({
      center: coord,
      zoom: Math.max(map.getZoom(), 16.3),
      pitch: 60,
      bearing: northUp
        ? 0
        : Number.isFinite(heading)
          ? heading
          : map.getBearing(),
      offset: [0, 115],
      duration: immediate ? 220 : 400,
      essential: true,
    });
  }

  function updateRemaining(coord) {
    const remaining = app.planner.remainingAt(coord);
    if (!remaining) return;
    app.el("trackRemain").textContent = `${remaining.dist.toFixed(1)} km`;
    app.el("trackUp").textContent = `${Math.round(remaining.up)} hm`;
    const fallback =
      app.state.route.edgeStatuses?.[remaining.index] === "fallback";
    const arrow = app.el("directionArrow");
    const text = app.el("directionText");
    arrow.hidden = fallback;
    if (fallback) text.textContent = "Direkte, nicht routbare Verbindung";
    else {
      arrow.hidden = false;
      const heading = routeHeading(coord);
      if (Number.isFinite(heading))
        arrow.style.transform = `rotate(${heading - map.getBearing()}deg)`;
      text.textContent =
        remaining.dist < 0.05
          ? "Ziel erreicht"
          : `noch ${remaining.dist.toFixed(1)} km`;
    }
    app.planner.setNavigationArrows(coord);
  }

  function renderElapsed() {
    const elapsed =
      elapsedBeforePause +
      (tracking.active && !tracking.paused ? Date.now() - startedAt : 0);
    const seconds = Math.floor(elapsed / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    app.el("trackTime").textContent = hours
      ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }

  function setNavigationUi(active) {
    document.body.classList.toggle("navigation-active", active);
    app.el("navControls").hidden = !active;
    app.el("directionCard").hidden = !active;
    if (active) {
      app.el("routeInfo").hidden = true;
      app.el("trackPanel").hidden = false;
    }
  }

  function positionUpdate(position) {
    const coord = [position.coords.longitude, position.coords.latitude];
    app.state.gps.coord = coord;
    app.state.gps.accuracy = position.coords.accuracy;
    const heading = headingFor(position, coord);
    updateLiveMarker(coord, heading);
    updateRemaining(coord);
    followCamera(coord, heading);
    if (tracking.paused) return;
    const previous = tracking.points.at(-1);
    if (previous) {
      const distance = app.util.km(previous, coord);
      if (distance < 0.2) tracking.km += distance;
    }
    tracking.points.push(coord);
    app.el("trackDist").textContent = `${tracking.km.toFixed(2)} km`;
    drawTrack();
  }

  function start() {
    if (tracking.active) return;
    if (app.state.route.coords.length < 2) {
      app.setStatus("Bitte zuerst eine Route berechnen.", "warning");
      return;
    }
    if (!navigator.geolocation || !window.isSecureContext) {
      app.setStatus("Navigation benötigt Standortzugriff über HTTPS.", "error");
      return;
    }
    tracking.active = true;
    tracking.paused = false;
    tracking.follow = true;
    tracking.points = [];
    tracking.km = 0;
    elapsedBeforePause = 0;
    startedAt = Date.now();
    northUp = false;
    lastHeading = null;
    app.state.gps.marker?.remove();
    app.state.gps.marker = null;
    app.el("trackTitle").textContent = app.state.route.name || "Aktive Route";
    app.el("trackDist").textContent = "0.00 km";
    app.el("trackTime").textContent = "00:00";
    app.el("pauseTrack").textContent = "Pause";
    app.el("pauseTrack").hidden = false;
    app.el("stopTrack").hidden = false;
    app.el("saveTrack").hidden = true;
    app.el("restartTrack").hidden = true;
    app.el("backToRoute").hidden = true;
    app.el("trackRemain").textContent =
      `${app.state.route.stats?.dist.toFixed(1) || "—"} km`;
    app.el("trackUp").textContent =
      `${Math.round(app.state.route.stats?.up || 0)} hm`;
    app.el("followMe").classList.add("active");
    app.el("northUp").classList.remove("active");
    setNavigationUi(true);
    drawTrack();
    app.emit("tracking:start", {});

    watchId = navigator.geolocation.watchPosition(
      positionUpdate,
      geolocationError,
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      },
    );
    timer = setInterval(renderElapsed, 1000);
    const initial = app.state.gps.coord || app.state.route.coords[0];
    const heading = routeHeading(initial);
    updateLiveMarker(initial, heading);
    followCamera(initial, heading, true);
    app.setStatus("Live-Navigation läuft.", "success");
  }

  function pause() {
    if (!tracking.active) return;
    if (!tracking.paused) {
      elapsedBeforePause += Date.now() - startedAt;
      tracking.paused = true;
      app.el("pauseTrack").textContent = "Weiter";
      app.setStatus("Tracking pausiert.");
    } else {
      tracking.paused = false;
      startedAt = Date.now();
      app.el("pauseTrack").textContent = "Pause";
      app.setStatus("Tracking läuft weiter.");
    }
  }

  function stop() {
    if (!tracking.active) return;
    if (!tracking.paused) elapsedBeforePause += Date.now() - startedAt;
    tracking.active = false;
    tracking.paused = false;
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    clearInterval(timer);
    timer = null;
    renderElapsed();
    liveMarker?.remove();
    liveMarker = null;
    if (app.state.gps.coord) setStaticLocation(app.state.gps.coord);
    setNavigationUi(false);
    app.el("trackPanel").hidden = false;
    app.el("pauseTrack").hidden = true;
    app.el("stopTrack").hidden = true;
    app.el("saveTrack").hidden = tracking.points.length < 2;
    app.el("restartTrack").hidden = false;
    app.el("backToRoute").hidden = false;
    app.emit("tracking:stop", {});
    app.setStatus(
      "Tour beendet. Route kann erneut gestartet oder als GPX gespeichert werden.",
      "success",
    );
  }

  function backToRoute() {
    app.el("trackPanel").hidden = true;
    app.planner.render();
    app.el("routeInfo").hidden = app.state.route.points.length === 0;
    app.planner.fit();
  }

  function xml(value) {
    return String(value ?? "").replace(
      /[<>&'\"]/g,
      (char) =>
        ({
          "<": "&lt;",
          ">": "&gt;",
          "&": "&amp;",
          "'": "&apos;",
          '"': "&quot;",
        })[char],
    );
  }

  function saveTrack() {
    if (tracking.points.length < 2) return;
    const name =
      `${app.state.route.name || "Outabout Tour"} – gelaufen`.replace(
        /[\\/:*?"<>|]+/g,
        "-",
      );
    const points = tracking.points
      .map((coord) => `<trkpt lat="${coord[1]}" lon="${coord[0]}"></trkpt>`)
      .join("");
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Outabout" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${xml(name)}</name></metadata><trk><name>${xml(name)}</name><trkseg>${points}</trkseg></trk></gpx>`;
    app.util.download(
      new Blob([gpx], { type: "application/gpx+xml" }),
      `${name}.gpx`,
    );
    app.setStatus("Aufgezeichnete Tour als GPX gespeichert.", "success");
  }

  function toggleFollow() {
    tracking.follow = !tracking.follow;
    app.el("followMe").classList.toggle("active", tracking.follow);
    if (tracking.follow && app.state.gps.coord)
      followCamera(app.state.gps.coord, lastHeading, true);
  }

  function toggleNorthUp() {
    northUp = !northUp;
    app.el("northUp").classList.toggle("active", northUp);
    map.easeTo({
      bearing: northUp ? 0 : lastHeading || map.getBearing(),
      duration: 300,
    });
  }

  app.navigation = { start, stop, pause, requestLocation, setStaticLocation };

  app
    .el("gpsBtn")
    ?.addEventListener("click", () =>
      requestLocation({ pan: true }).catch(() => {}),
    );
  app.el("pauseTrack")?.addEventListener("click", pause);
  app.el("stopTrack")?.addEventListener("click", stop);
  app.el("restartTrack")?.addEventListener("click", start);
  app.el("backToRoute")?.addEventListener("click", backToRoute);
  app.el("saveTrack")?.addEventListener("click", saveTrack);
  app.el("followMe")?.addEventListener("click", toggleFollow);
  app.el("northUp")?.addEventListener("click", toggleNorthUp);
  map.on("dragstart", () => {
    if (!tracking.active) return;
    tracking.follow = false;
    app.el("followMe").classList.remove("active");
  });

  app.whenMapReady(() => {
    installTrackLayer();
    requestLocation({ pan: false, silent: true }).catch(() => {});
  });
})();
