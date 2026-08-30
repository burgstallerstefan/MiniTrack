(() => {
  let terrainOn = true;
  const TERRAIN_ID = 'terrain-dem';
  const HILLSHADE_ID = 'terrain-hillshade';

  function removeOldTerrain() {
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

  function applyTerrain() {
    addTerrainSource();
    addHillshade();
    map.setTerrain(terrainOn ? { source: TERRAIN_ID, exaggeration: 1.65 } : null);
    if (map.getLayer(HILLSHADE_ID)) {
      map.setLayoutProperty(HILLSHADE_ID, 'visibility', terrainOn ? 'visible' : 'none');
    }
    if (typeof map.setMaxPitch === 'function') map.setMaxPitch(85);
    const btn = document.getElementById('terrainToggle');
    btn?.classList.toggle('active', terrainOn);
    if (btn) btn.textContent = terrainOn ? '✓ 3D Gelände' : '3D Gelände';
  }

  function init() {
    removeOldTerrain();
    applyTerrain();

    document.getElementById('terrainToggle')?.addEventListener('click', e => {
      e.stopPropagation();
      terrainOn = !terrainOn;
      applyTerrain();
    });

    map.on('styledata', () => {
      if (!terrainOn) return;
      try {
        if (!map.getSource(TERRAIN_ID)) addTerrainSource();
        if (!map.getLayer(HILLSHADE_ID)) addHillshade();
        map.setTerrain({ source: TERRAIN_ID, exaggeration: 1.65 });
      } catch {}
    });
  }

  if (map.loaded()) init();
  else map.once('load', init);
})();