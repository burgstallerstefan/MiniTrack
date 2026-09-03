(() => {
  "use strict";

  const app = window.Outabout;
  const map = app.map;
  let baseMode = "map";
  let terrainEnabled = false;
  const TERRAIN_SOURCE = "terrain-dem";
  const HILLSHADE_LAYER = "terrain-hillshade";
  const BUILDINGS_LAYER = "outabout-3d-buildings";

  function firstSymbolLayer() {
    return map.getStyle()?.layers?.find((layer) => layer.type === "symbol")?.id;
  }

  function installBaseLayers() {
    if (!map.getSource("base-topo")) {
      map.addSource("base-topo", {
        type: "raster",
        tiles: ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 17,
        attribution:
          "Kartendaten © OpenStreetMap-Mitwirkende · Darstellung © OpenTopoMap",
      });
      map.addLayer(
        {
          id: "base-topo",
          type: "raster",
          source: "base-topo",
          layout: { visibility: "none" },
          paint: { "raster-opacity": 1 },
        },
        firstSymbolLayer(),
      );
    }
    if (!map.getSource("base-satellite")) {
      map.addSource("base-satellite", {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: "Satelliten-/Luftbilder © Esri und Datenanbieter",
      });
      map.addLayer(
        {
          id: "base-satellite",
          type: "raster",
          source: "base-satellite",
          layout: { visibility: "none" },
          paint: { "raster-opacity": 1 },
        },
        firstSymbolLayer(),
      );
    }
  }

  function setBase(mode) {
    baseMode = ["map", "topo", "satellite"].includes(mode) ? mode : "map";
    for (const id of ["topo", "satellite"]) {
      if (map.getLayer(`base-${id}`)) {
        map.setLayoutProperty(
          `base-${id}`,
          "visibility",
          baseMode === id ? "visible" : "none",
        );
      }
    }
    document.querySelectorAll(".baseChoice").forEach((button) => {
      button.classList.toggle("active", button.dataset.base === baseMode);
    });
    app.el("layerPanel").hidden = true;
  }

  function overlayUrl() {
    return `https://tile.waymarkedtrails.org/${app.activity.config.overlay}/{z}/{x}/{y}.png`;
  }

  function installRouteOverlay() {
    const visibility =
      app.el("routesChk")?.checked === false ? "none" : "visible";
    if (!map.getSource("activity-routes")) {
      map.addSource("activity-routes", {
        type: "raster",
        tiles: [overlayUrl()],
        tileSize: 256,
      });
      map.addLayer({
        id: "activity-routes",
        type: "raster",
        source: "activity-routes",
        layout: { visibility },
        paint: { "raster-opacity": 0.78 },
      });
      return;
    }
    const source = map.getSource("activity-routes");
    if (source?.setTiles) source.setTiles([overlayUrl()]);
  }

  function setRouteOverlayVisible(visible) {
    if (map.getLayer("activity-routes")) {
      map.setLayoutProperty(
        "activity-routes",
        "visibility",
        visible ? "visible" : "none",
      );
    }
  }

  function findBuildingLayer() {
    return (map.getStyle()?.layers || []).find(
      (layer) =>
        layer.id !== BUILDINGS_LAYER &&
        layer.source &&
        (String(layer["source-layer"] || "").match(/building/i) ||
          String(layer.id).match(/building/i)),
    );
  }

  function addBuildings() {
    if (map.getLayer(BUILDINGS_LAYER)) return;
    const sourceLayer = findBuildingLayer();
    if (!sourceLayer?.source) return;
    const layer = {
      id: BUILDINGS_LAYER,
      type: "fill-extrusion",
      source: sourceLayer.source,
      minzoom: 14,
      paint: {
        "fill-extrusion-color": "#d8d3ca",
        "fill-extrusion-height": [
          "coalesce",
          ["to-number", ["get", "render_height"]],
          ["to-number", ["get", "height"]],
          ["*", ["to-number", ["get", "building:levels"]], 3],
          8,
        ],
        "fill-extrusion-base": [
          "coalesce",
          ["to-number", ["get", "render_min_height"]],
          ["to-number", ["get", "min_height"]],
          0,
        ],
        "fill-extrusion-opacity": 0.86,
      },
    };
    if (sourceLayer["source-layer"])
      layer["source-layer"] = sourceLayer["source-layer"];
    if (sourceLayer.filter) layer.filter = sourceLayer.filter;
    map.addLayer(layer, firstSymbolLayer());
  }

  function removeTerrain() {
    if (map.getLayer(BUILDINGS_LAYER)) map.removeLayer(BUILDINGS_LAYER);
    map.setTerrain(null);
    if (map.getLayer(HILLSHADE_LAYER)) map.removeLayer(HILLSHADE_LAYER);
    if (map.getSource(TERRAIN_SOURCE)) map.removeSource(TERRAIN_SOURCE);
    map.easeTo({ pitch: 0, duration: 250 });
  }

  function addTerrain() {
    if (!map.getSource(TERRAIN_SOURCE)) {
      map.addSource(TERRAIN_SOURCE, {
        type: "raster-dem",
        tiles: [
          "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 15,
        encoding: "terrarium",
        attribution: "Elevation: Mapzen / AWS Terrain Tiles",
      });
    }
    if (!map.getLayer(HILLSHADE_LAYER)) {
      map.addLayer(
        {
          id: HILLSHADE_LAYER,
          type: "hillshade",
          source: TERRAIN_SOURCE,
          paint: {
            "hillshade-exaggeration": 0.5,
            "hillshade-shadow-color": "#333",
            "hillshade-highlight-color": "#fff",
          },
        },
        firstSymbolLayer(),
      );
    }
    addBuildings();
    map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: 1.65 });
    map.setMaxPitch?.(85);
  }

  function syncTerrainButton() {
    const button = app.el("quickTerrainBtn");
    if (!button) return;
    button.classList.toggle("active", terrainEnabled);
    button.textContent = terrainEnabled ? "2D" : "3D";
    button.title = terrainEnabled
      ? "Auf 2D-Karte wechseln"
      : "3D-Gelände einschalten";
    button.setAttribute("aria-label", button.title);
  }

  function toggleTerrain() {
    terrainEnabled = !terrainEnabled;
    try {
      if (terrainEnabled) addTerrain();
      else removeTerrain();
    } catch (error) {
      terrainEnabled = false;
      app.log("terrain", error);
      try {
        removeTerrain();
      } catch {}
      app.setStatus("3D-Gelände konnte nicht geladen werden.", "error");
    }
    syncTerrainButton();
  }

  function setupMenus() {
    const filterToggle = app.el("filterToggle");
    const filterMenu = app.el("filterMenu");
    const modeToggle = app.el("routeModeToggle");
    const modeMenu = app.el("routeModeMenu");
    const layerToggle = app.el("layersBtn");
    const layerPanel = app.el("layerPanel");

    filterToggle?.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = !filterMenu.classList.contains("open");
      modeMenu?.classList.remove("open");
      modeToggle?.setAttribute("aria-expanded", "false");
      filterMenu.classList.toggle("open", open);
      filterToggle.setAttribute("aria-expanded", String(open));
    });
    filterMenu?.addEventListener("click", (event) => event.stopPropagation());
    layerToggle?.addEventListener("click", (event) => {
      event.stopPropagation();
      layerPanel.hidden = !layerPanel.hidden;
    });
    layerPanel?.addEventListener("click", (event) => event.stopPropagation());
    document.addEventListener("pointerdown", (event) => {
      if (
        !filterToggle?.contains(event.target) &&
        !filterMenu?.contains(event.target)
      ) {
        filterMenu?.classList.remove("open");
        filterToggle?.setAttribute("aria-expanded", "false");
      }
      if (
        !modeToggle?.contains(event.target) &&
        !modeMenu?.contains(event.target)
      ) {
        modeMenu?.classList.remove("open");
        modeToggle?.setAttribute("aria-expanded", "false");
      }
      if (
        !layerToggle?.contains(event.target) &&
        !layerPanel?.contains(event.target)
      )
        layerPanel.hidden = true;
    });
  }

  document.querySelectorAll(".baseChoice").forEach((button) => {
    button.addEventListener("click", () => setBase(button.dataset.base));
  });
  app.el("quickTerrainBtn")?.addEventListener("click", toggleTerrain);
  app
    .el("routesChk")
    ?.addEventListener("change", (event) =>
      setRouteOverlayVisible(event.target.checked),
    );
  app.on("activity:change", () => {
    try {
      installRouteOverlay();
    } catch (error) {
      app.log("activity-overlay", error);
    }
  });
  setupMenus();
  app.whenMapReady(() => {
    installBaseLayers();
    installRouteOverlay();
    setBase("map");
    syncTerrainButton();
  });
})();
