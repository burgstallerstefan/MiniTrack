(() => {
  let terrainOn = true;

  function addTerrainSource() {
    if (map.getSource('terrain-dem')) return;
    map.addSource('terrain-dem', {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 15,
      encoding: 'terrarium'
    });
  }

  function addHillshade() {
    if (map.getLayer('terrain-hillshade')) return;
    const firstSymbol = map.getStyle().layers.find(l => l.type === 'symbol')?.id;
    map.addLayer({
      id: 'terrain-hillshade',
      type: 'hillshade',
      source: 'terrain-dem',
      paint: {
        'hillshade-exaggeration': 0.38,
        'hillshade-shadow-color': '#3d3d3d',
        'hillshade-highlight-color': '#ffffff'
      }
    }, firstSymbol);
  }

  function applyTerrain() {
    addTerrainSource();
    addHillshade();
    map.setTerrain(terrainOn ? { source: 'terrain-dem', exaggeration: 1.3 } : null);
    if (map.getLayer('terrain-hillshade')) {
      map.setLayoutProperty('terrain-hillshade', 'visibility', terrainOn ? 'visible' : 'none');
    }
    if (typeof map.setMaxPitch === 'function') map.setMaxPitch(85);
    const btn = document.getElementById('terrainToggle');
    btn?.classList.toggle('active', terrainOn);
    if (btn) btn.textContent = terrainOn ? '✓ 3D Gelände' : '3D Gelände';
  }

  function init() {
    applyTerrain();
    document.getElementById('terrainToggle')?.addEventListener('click', e => {
      e.stopPropagation();
      terrainOn = !terrainOn;
      applyTerrain();
    });

    // 3D bleibt auch nach Kartenwechseln und Style-Aktualisierungen aktiv.
    map.on('styledata', () => {
      if (!terrainOn) return;
      try {
        if (!map.getSource('terrain-dem')) addTerrainSource();
        if (!map.getLayer('terrain-hillshade')) addHillshade();
        map.setTerrain({ source: 'terrain-dem', exaggeration: 1.3 });
      } catch {}
    });
  }

  if (map.loaded()) init();
  else map.once('load', init);
})();