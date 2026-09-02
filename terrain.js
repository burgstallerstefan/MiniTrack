(() => {
  let terrainOn = false;
  const TERRAIN_ID = 'terrain-dem';
  const HILLSHADE_ID = 'terrain-hillshade';
  const BUILDINGS_3D_ID = 'outabout-3d-buildings';
  window.outaboutTerrain3D = false;
  window.miniTrackTerrain3D = false; // Legacy-Kompatibilität

  function remove3DBuildings() {
    try { if (map.getLayer(BUILDINGS_3D_ID)) map.removeLayer(BUILDINGS_3D_ID); } catch {}
    try { if (map.getLayer('minitrack-3d-buildings')) map.removeLayer('minitrack-3d-buildings'); } catch {}
  }

  function findBuildingLayer() {
    const layers = map.getStyle()?.layers || [];
    return layers.find(l =>
      l.id !== BUILDINGS_3D_ID && l.id !== 'minitrack-3d-buildings' &&
      l.source && l['source-layer'] &&
      /building/i.test(String(l['source-layer']))
    ) || layers.find(l =>
      l.id !== BUILDINGS_3D_ID && l.id !== 'minitrack-3d-buildings' &&
      l.source &&
      /building/i.test(String(l.id))
    );
  }

  function add3DBuildings() {
    if (map.getLayer(BUILDINGS_3D_ID)) return;
    const base = findBuildingLayer();
    if (!base?.source) return;

    const layer = {
      id: BUILDINGS_3D_ID,
      type: 'fill-extrusion',
      source: base.source,
      minzoom: 14,
      paint: {
        'fill-extrusion-color': '#d8d3ca',
        'fill-extrusion-height': [
          'coalesce',
          ['to-number', ['get', 'render_height']],
          ['to-number', ['get', 'height']],
          ['*', ['to-number', ['get', 'building:levels']], 3],
          8
        ],
        'fill-extrusion-base': [
          'coalesce',
          ['to-number', ['get', 'render_min_height']],
          ['to-number', ['get', 'min_height']],
          0
        ],
        'fill-extrusion-opacity': 0.86
      }
    };
    if (base['source-layer']) layer['source-layer'] = base['source-layer'];
    if (base.filter) layer.filter = base.filter;

    const firstSymbol = map.getStyle().layers.find(l => l.type === 'symbol')?.id;
    try { map.addLayer(layer, firstSymbol); } catch {}
  }

  function removeTerrainCompletely() {
    try { map.setTerrain(null); } catch {}
    try { if (map.getLayer(HILLSHADE_ID)) map.removeLayer(HILLSHADE_ID); } catch {}
    try { if (map.getSource(TERRAIN_ID)) map.removeSource(TERRAIN_ID); } catch {}
  }

  function addTerrainSource() {
    if (map.getSource(TERRAIN_ID)) return;
    map.addSource(TERRAIN_ID, {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 15,
      encoding: 'terrarium',
      attribution: 'Elevation: Mapzen / AWS Terrain Tiles'
    });
  }

  function addHillshade() {
    if (map.getLayer(HILLSHADE_ID)) return;
    const firstSymbol = map.getStyle().layers.find(l => l.type === 'symbol')?.id;
    map.addLayer({
      id: HILLSHADE_ID,
      type: 'hillshade',
      source: TERRAIN_ID,
      paint: {
        'hillshade-exaggeration': 0.5,
        'hillshade-shadow-color': '#333333',
        'hillshade-highlight-color': '#ffffff'
      }
    }, firstSymbol);
  }

  function syncButtons() {
    window.outaboutTerrain3D = terrainOn;
    window.miniTrackTerrain3D = terrainOn; // Legacy-Kompatibilität
    const panelBtn = document.getElementById('terrainToggle');
    panelBtn?.classList.toggle('active', terrainOn);
    if (panelBtn) panelBtn.textContent = terrainOn ? '✓ 3D Gelände' : '3D Gelände';

    const quickBtn = document.getElementById('quickTerrainBtn');
    quickBtn?.classList.toggle('active', terrainOn);
    if (quickBtn) {
      quickBtn.textContent = terrainOn ? '2D' : '3D';
      quickBtn.title = terrainOn ? 'Auf schnelle 2D-Karte wechseln' : '3D-Gelände einschalten';
      quickBtn.setAttribute('aria-label', quickBtn.title);
    }
  }

  function applyTerrain() {
    if (terrainOn) {
      addTerrainSource();
      addHillshade();
      add3DBuildings();
      map.setTerrain({ source: TERRAIN_ID, exaggeration: 1.65 });
      if (typeof map.setMaxPitch === 'function') map.setMaxPitch(85);
    } else {
      remove3DBuildings();
      removeTerrainCompletely();
      try { map.jumpTo({ pitch: 0 }); } catch {}
    }
    syncButtons();
  }

  function toggleTerrain(e) {
    e?.stopPropagation?.();
    terrainOn = !terrainOn;
    applyTerrain();
  }

  function init() {
    remove3DBuildings();
    removeTerrainCompletely();
    applyTerrain();
    document.getElementById('terrainToggle')?.addEventListener('click', toggleTerrain);
    document.getElementById('quickTerrainBtn')?.addEventListener('click', toggleTerrain);
    map.on('styledata', () => {
      if (!terrainOn) {
        remove3DBuildings();
        removeTerrainCompletely();
        syncButtons();
        return;
      }
      try {
        if (!map.getSource(TERRAIN_ID)) addTerrainSource();
        if (!map.getLayer(HILLSHADE_ID)) addHillshade();
        if (!map.getLayer(BUILDINGS_3D_ID)) add3DBuildings();
        map.setTerrain({ source: TERRAIN_ID, exaggeration: 1.65 });
      } catch {}
      syncButtons();
    });
  }

  if (map.loaded()) init();
  else map.once('load', init);
})();