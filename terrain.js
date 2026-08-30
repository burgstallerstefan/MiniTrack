(() => {
  let terrainOn = true;

  function applyTerrain() {
    if (!map.getSource('terrain-dem')) {
      map.addSource('terrain-dem', {
        type: 'raster-dem',
        url: 'https://demotiles.maplibre.org/terrain-tiles/tiles.json',
        tileSize: 256
      });
    }
    if (!map.getLayer('terrain-hillshade')) {
      const firstSymbol = map.getStyle().layers.find(l => l.type === 'symbol')?.id;
      map.addLayer({
        id: 'terrain-hillshade',
        type: 'hillshade',
        source: 'terrain-dem',
        paint: {
          'hillshade-exaggeration': 0.28
        }
      }, firstSymbol);
    }
    map.setTerrain(terrainOn ? { source: 'terrain-dem', exaggeration: 1.2 } : null);
    if (map.getLayer('terrain-hillshade')) {
      map.setLayoutProperty('terrain-hillshade', 'visibility', terrainOn ? 'visible' : 'none');
    }
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
  }

  if (map.loaded()) init();
  else map.once('load', init);
})();