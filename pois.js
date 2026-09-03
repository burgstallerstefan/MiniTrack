(() => {
  "use strict";

  const app = window.Outabout;
  const map = app.map;
  const known = new Map();
  const visible = {
    alms: true,
    huts: true,
    food: true,
    localities: true,
    peaks: false,
  };
  let vectorSource = null;
  let harvestTimer = null;
  let searchTimer = null;
  let searchController = null;
  let searchMarker = null;

  function property(properties, key) {
    return String(properties?.[key] ?? "")
      .trim()
      .toLowerCase();
  }

  function classify(properties = {}, sourceLayer = "") {
    const name =
      properties.name || properties.name_de || properties["name:de"] || "";
    if (!name) return null;
    const values = new Set(
      [
        "class",
        "subclass",
        "place",
        "tourism",
        "amenity",
        "natural",
        "landuse",
        "feature",
      ]
        .map((key) => property(properties, key))
        .filter(Boolean),
    );

    if (sourceLayer === "mountain_peak" || values.has("peak"))
      return { cat: "peaks", type: "Gipfel" };
    if (
      ["alm", "alpe", "alp", "alpine_pasture", "mountain_pasture"].some(
        (value) => values.has(value),
      )
    ) {
      return { cat: "alms", type: "Alm / Alpe" };
    }
    if (values.has("alpine_hut")) return { cat: "huts", type: "Alpenhütte" };
    if (values.has("wilderness_hut"))
      return { cat: "huts", type: "Schutzhütte" };
    if (sourceLayer === "place") {
      if (values.has("locality"))
        return { cat: "localities", type: "Lokalität" };
      if (values.has("hamlet")) return { cat: "localities", type: "Weiler" };
      if (values.has("isolated_dwelling"))
        return { cat: "localities", type: "Einzellage" };
    }
    if (sourceLayer !== "poi") return null;

    const food = {
      restaurant: "Restaurant",
      cafe: "Café",
      fast_food: "Imbiss",
      bar: "Bar",
      pub: "Pub",
      biergarten: "Biergarten",
      food_court: "Gastronomie",
    };
    for (const [tag, type] of Object.entries(food))
      if (values.has(tag)) return { cat: "food", type };

    const lodging = {
      hotel: "Hotel",
      motel: "Motel",
      hostel: "Hostel",
      guest_house: "Pension / Gasthaus",
      guesthouse: "Pension / Gasthaus",
      inn: "Pension / Gasthaus",
      bed_and_breakfast: "Pension / Gasthaus",
      chalet: "Chalet",
      apartment: "Ferienwohnung",
      apartments: "Ferienwohnung",
      holiday_apartment: "Ferienwohnung",
      camp_site: "Camping",
      caravan_site: "Camping",
    };
    for (const [tag, type] of Object.entries(lodging))
      if (values.has(tag)) return { cat: "food", type };
    return null;
  }

  function featureCoord(feature) {
    if (feature?.geometry?.type === "Point")
      return feature.geometry.coordinates;
    if (feature?.geometry?.type === "MultiPoint")
      return feature.geometry.coordinates?.[0];
    return null;
  }

  function render() {
    const features = [...known.values()]
      .filter((poi) => visible[poi.cat])
      .map((poi) => ({
        type: "Feature",
        id: poi.id,
        properties: {
          id: poi.id,
          cat: poi.cat,
          name: poi.name,
          poiType: poi.type,
        },
        geometry: { type: "Point", coordinates: poi.coord },
      }));
    try {
      map
        .getSource("outabout-pois")
        ?.setData({ type: "FeatureCollection", features });
    } catch (error) {
      app.log("pois:render", error);
    }
  }

  function harvest() {
    if (!vectorSource) return;
    for (const sourceLayer of ["poi", "place", "mountain_peak"]) {
      let features;
      try {
        features = map.querySourceFeatures(vectorSource, { sourceLayer }) || [];
      } catch (error) {
        app.log("pois:query", error, { sourceLayer });
        continue;
      }
      for (const feature of features) {
        const category = classify(feature.properties, sourceLayer);
        const coord = featureCoord(feature);
        const name =
          feature.properties?.name ||
          feature.properties?.name_de ||
          feature.properties?.["name:de"];
        if (!category || !name || !app.util.validCoord(coord)) continue;
        const id = `poi-${category.cat}-${Number(coord[0]).toFixed(5)}-${Number(coord[1]).toFixed(5)}-${name}`;
        if (!known.has(id))
          known.set(id, {
            id,
            coord: app.util.coord(coord),
            name,
            ...category,
          });
      }
    }
    while (known.size > 5000) known.delete(known.keys().next().value);
    render();
  }

  function installLayers() {
    const styleSources = map.getStyle()?.sources || {};
    vectorSource =
      Object.keys(styleSources).find(
        (key) => styleSources[key]?.type === "vector",
      ) || null;
    if (!map.getSource("outabout-pois")) {
      map.addSource("outabout-pois", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    const colors = {
      alms: "#c44",
      huts: "#6b8e23",
      food: "#b36b00",
      localities: "#4d78a8",
      peaks: "#333",
    };
    for (const [cat, color] of Object.entries(colors)) {
      const id = `poi-${cat}`;
      if (map.getLayer(id)) continue;
      map.addLayer({
        id,
        type: "circle",
        source: "outabout-pois",
        filter: ["==", ["get", "cat"], cat],
        paint: {
          "circle-radius": cat === "localities" ? 5 : 8,
          "circle-color": color,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });
      map.on("click", id, (event) => {
        const properties = event.features?.[0]?.properties;
        const poi = known.get(properties?.id);
        if (poi) openPointPopup(poi);
      });
      map.on(
        "mouseenter",
        id,
        () => (map.getCanvas().style.cursor = "pointer"),
      );
      map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
    }
    harvest();
  }

  function googleUrl(point) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${point.name || "Punkt"} ${point.coord[1]},${point.coord[0]}`)}`;
  }

  function openPointPopup(point) {
    document
      .querySelectorAll(".maplibregl-popup")
      .forEach((element) => element.remove());
    const body = document.createElement("div");
    body.className = "point-popup";
    const title = document.createElement("b");
    title.textContent = point.name || "Punkt";
    const subtitle = document.createElement("div");
    subtitle.className = "popup-subtitle";
    subtitle.textContent = point.type || "Kartenpunkt";
    body.append(title, subtitle);

    const planner = app.planner;
    if (!planner?.hasStart()) {
      const start = document.createElement("button");
      start.type = "button";
      start.className = "popbtn secondary";
      start.textContent = "Start";
      start.addEventListener("click", () => {
        const added = planner?.setStartPoi(point.coord, {
          name: point.name,
          type: point.type,
          cat: point.cat || "map",
        });
        if (added) popup.remove();
      });
      body.appendChild(start);
    }

    const add = document.createElement("button");
    add.type = "button";
    add.className = "popbtn good";
    add.textContent = "＋ Hinzufügen";
    add.addEventListener("click", async () => {
      add.disabled = true;
      const added = await planner?.addPoi(point.coord, {
        name: point.name,
        type: point.type,
        cat: point.cat || "map",
      });
      if (added) popup.remove();
      else add.disabled = false;
    });
    body.appendChild(add);

    const google = document.createElement("a");
    google.className = "popup-link";
    google.textContent = "In Google Maps öffnen";
    google.href = googleUrl(point);
    google.target = "_blank";
    google.rel = "noopener noreferrer";
    body.appendChild(google);

    app.media?.appendPointMedia?.(body, {
      id: point.id || app.util.pointRefId(point),
      coord: point.coord,
      name: point.name,
      cat: point.cat || "map",
    });

    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      offset: 14,
    })
      .setLngLat(point.coord)
      .setDOMContent(body)
      .addTo(map);
  }

  function showSearchResult(result) {
    const coord = [Number(result.lon), Number(result.lat)];
    if (!app.util.validCoord(coord)) return;
    const name =
      result.name || String(result.display_name || "Suchtreffer").split(",")[0];
    searchMarker?.remove();
    const element = document.createElement("button");
    element.type = "button";
    element.className = "search-marker";
    element.setAttribute("aria-label", name);
    searchMarker = new maplibregl.Marker({ element })
      .setLngLat(coord)
      .addTo(map);
    element.addEventListener("click", () =>
      openPointPopup({
        id: `search-${coord[0].toFixed(5)}-${coord[1].toFixed(5)}`,
        coord,
        name,
        type: result.type || "Suchtreffer",
        cat: "search",
      }),
    );
    map.flyTo({ center: coord, zoom: 15 });
    openPointPopup({
      id: `search-${coord[0]}-${coord[1]}`,
      coord,
      name,
      type: result.type || "Suchtreffer",
      cat: "search",
    });
  }

  async function search(text, limit = 6) {
    searchController?.abort();
    searchController = new AbortController();
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=${limit}&addressdetails=1&accept-language=de&q=${encodeURIComponent(text)}`,
      { signal: searchController.signal },
    );
    if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
    return response.json();
  }

  async function updateSuggestions() {
    const input = app.el("q");
    const suggestions = app.el("suggestions");
    const text = input.value.trim();
    if (text.length < 2) {
      suggestions.hidden = true;
      return;
    }
    try {
      const results = await search(text, 6);
      suggestions.replaceChildren();
      for (const result of results) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "suggestion";
        const strong = document.createElement("strong");
        strong.textContent =
          result.name || String(result.display_name).split(",")[0];
        const small = document.createElement("small");
        small.textContent = result.display_name;
        button.append(strong, small);
        button.addEventListener("click", () => {
          input.value = strong.textContent;
          suggestions.hidden = true;
          showSearchResult(result);
        });
        suggestions.appendChild(button);
      }
      suggestions.hidden = !results.length;
    } catch (error) {
      if (error?.name !== "AbortError") app.log("search:suggestions", error);
      suggestions.hidden = true;
    }
  }

  async function submitSearch() {
    const text = app.el("q")?.value.trim();
    if (!text) return;
    try {
      const [result] = await search(text, 1);
      if (result) showSearchResult(result);
      else app.setStatus("Nichts gefunden.", "warning");
    } catch (error) {
      if (error?.name !== "AbortError") {
        app.log("search", error);
        app.setStatus("Suche ist gerade nicht erreichbar.", "error");
      }
    }
  }

  app.pois = { classify, openPointPopup, refresh: harvest };
  app.ui.openPointPopup = openPointPopup;

  for (const [cat, id] of [
    ["alms", "almsChk"],
    ["huts", "hutsChk"],
    ["food", "foodChk"],
    ["localities", "localitiesChk"],
    ["peaks", "peaksChk"],
  ]) {
    const input = app.el(id);
    visible[cat] = input?.checked !== false;
    input?.addEventListener("change", () => {
      visible[cat] = input.checked;
      render();
    });
  }

  app.el("q")?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(updateSuggestions, 280);
  });
  app.el("q")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitSearch();
  });
  app.el("searchBtn")?.addEventListener("click", submitSearch);

  map.on("idle", () => {
    clearTimeout(harvestTimer);
    harvestTimer = setTimeout(harvest, 140);
  });
  map.on("dblclick", (event) => {
    if (app.state.tracking.active) return;
    const target = event.originalEvent?.target;
    if (
      target?.closest?.(
        ".maplibregl-marker,.maplibregl-popup,button,input,label,a",
      )
    )
      return;
    event.preventDefault?.();
    openPointPopup({
      coord: [event.lngLat.lng, event.lngLat.lat],
      name: "Punkt",
      type: "Kartenpunkt",
      cat: "map",
    });
  });

  app.whenMapReady(installLayers);
})();
