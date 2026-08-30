(() => {
  let currentBase = 'map';

  function setVisibility(id, visible) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  }

  function setBase(mode) {
    currentBase = ['map', 'topo', 'satellite'].includes(mode) ? mode : 'map';
    setVisibility('base-topo', currentBase === 'topo');
    setVisibility('base-satellite', currentBase === 'satellite');
    document.querySelectorAll('.baseChoice').forEach(button => {
      button.classList.toggle('active', button.dataset.base === currentBase);
    });
    const panel = document.getElementById('layerPanel');
    if (panel) panel.style.display = 'none';
  }

  function togglePanel(event) {
    event?.stopPropagation();
    const panel = document.getElementById('layerPanel');
    if (!panel) return;
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
  }

  function installLayers() {
    if (map.getSource('base-topo') || map.getSource('base-satellite')) return;

    const firstSymbol = map.getStyle().layers?.find(layer => layer.type === 'symbol')?.id;

    map.addSource('base-topo', {
      type: 'raster',
      tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 17,
      attribution: 'Kartendaten © OpenStreetMap-Mitwirkende · Darstellung © OpenTopoMap'
    });
    map.addLayer({
      id: 'base-topo',
      type: 'raster',
      source: 'base-topo',
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': 1 }
    }, firstSymbol);

    map.addSource('base-satellite', {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Satelliten-/Luftbilder © Esri und Datenanbieter'
    });
    map.addLayer({
      id: 'base-satellite',
      type: 'raster',
      source: 'base-satellite',
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': 1 }
    }, firstSymbol);

    setBase(currentBase);
  }

  document.querySelectorAll('.layerToggle').forEach(button => {
    button.addEventListener('click', togglePanel);
  });
  document.querySelectorAll('.baseChoice').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      setBase(button.dataset.base);
    });
  });
  document.getElementById('layerPanel')?.addEventListener('click', event => event.stopPropagation());
  document.addEventListener('click', () => {
    const panel = document.getElementById('layerPanel');
    if (panel) panel.style.display = 'none';
  });

  if (map.loaded()) installLayers();
  else map.on('load', installLayers);
})();