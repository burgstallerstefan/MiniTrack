(() => {
  let terrainOn = true;
  const TERRAIN_ID = 'terrain-dem';
  const HILLSHADE_ID = 'terrain-hillshade';

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
      map.setTerrain({ source: TERRAIN_ID, exaggeration: 1.65 });
      if (typeof map.setMaxPitch === 'function') map.setMaxPitch(85);
    } else {
      // In 2D werden DEM und Hillshade komplett entfernt, damit das Handy sie nicht weiter rendert/lädt.
      removeTerrainCompletely();
      try { map.easeTo({ pitch: 0, duration: 250 }); } catch {}
    }
    syncButtons();
  }

  function toggleTerrain(e) {
    e?.stopPropagation?.();
    terrainOn = !terrainOn;
    applyTerrain();
  }

  function init() {
    removeTerrainCompletely();
    applyTerrain();

    document.getElementById('terrainToggle')?.addEventListener('click', toggleTerrain);
    document.getElementById('quickTerrainBtn')?.addEventListener('click', toggleTerrain);

    map.on('styledata', () => {
      if (!terrainOn) {
        syncButtons();
        return;
      }
      try {
        if (!map.getSource(TERRAIN_ID)) addTerrainSource();
        if (!map.getLayer(HILLSHADE_ID)) addHillshade();
        map.setTerrain({ source: TERRAIN_ID, exaggeration: 1.65 });
      } catch {}
      syncButtons();
    });
  }

  if (map.loaded()) init();
  else map.once('load', init);
})();