(() => {
  let directPoints = [];
  let directMarkers = [];
  let calcToken = 0;

  function clearDirectMarkers() {
    directMarkers.forEach(m => m.remove());
    directMarkers = [];
  }

  function addDirectMarker(c, label) {
    const el = document.createElement('div');
    el.style.cssText = 'width:28px;height:28px;border-radius:50%;background:white;border:3px solid #1769d2;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;box-shadow:0 1px 6px #555';
    el.textContent = label;
    directMarkers.push(new maplibregl.Marker({element:el}).setLngLat(c).addTo(map));
  }

  function renderDirectMarkers() {
    clearDirectMarkers();
    directPoints.forEach((c, i) => addDirectMarker(c, i === 0 ? 'S' : String(i)));
  }

  async function rebuildDirectRoute() {
    if (directPoints.length < 2) return;
    const token = ++calcToken;
    try {
      await calculateRoutes(directPoints, 'Geplante Wanderung');
      if (token !== calcToken) return;
      const o = routeOptions[selectedRouteIndex];
      if (o) {
        $('routeTitle').textContent = `${directPoints.length} Punkte · ${o.dist.toFixed(1)} km`;
        $('status').textContent = `${o.dist.toFixed(1)} km · weiteren Punkt antippen oder Start drücken.`;
      }
    } catch {
      if (token === calcToken) $('status').textContent = 'Route konnte gerade nicht berechnet werden.';
    }
  }

  map.on('click', e => {
    if (tracking || planning) return;
    if (map.getLayer('alternative-hit')) {
      const f = map.queryRenderedFeatures(e.point, {layers:['alternative-hit']});
      if (f.length) return;
    }
    const target = e.originalEvent?.target;
    if (target?.closest?.('.maplibregl-marker, .maplibregl-popup, button, input, label')) return;

    const c = [e.lngLat.lng, e.lngLat.lat];
    directPoints.push(c);
    renderDirectMarkers();

    if (directPoints.length === 1) {
      $('status').textContent = 'Start gesetzt. Nächsten Punkt auf der Karte antippen.';
      return;
    }
    rebuildDirectRoute();
  });

  $('clearRoute')?.addEventListener('click', () => {
    directPoints = [];
    calcToken++;
    clearDirectMarkers();
    $('status').textContent = 'Route gelöscht. Ersten Punkt als Start antippen.';
  });

  $('startRoute')?.addEventListener('click', () => {
    if (!routeCoords?.length) return;
    const pos = gps || routeCoords[0];
    const b = routeCoords.length > 1 ? bearing(routeCoords[0], routeCoords[Math.min(8, routeCoords.length - 1)]) : 0;
    map.easeTo({
      center: pos,
      zoom: Math.max(map.getZoom(), 16),
      pitch: 55,
      bearing: b,
      duration: 700
    });
    $('directionCard').style.display = 'block';
    $('directionText').textContent = 'Route folgen';
  });

  // Offener GPX-Export für Uhren und Navigations-Apps.
  const routeActions = $('routeActions');
  if (routeActions && !$('exportRouteGpx')) {
    const btn = document.createElement('button');
    btn.id = 'exportRouteGpx';
    btn.className = 'secondary';
    btn.textContent = '⌚ GPX für Uhr';
    routeActions.insertBefore(btn, $('clearRoute'));
  }
  if ($('saveTrack')) $('saveTrack').textContent = '⌚ GPX speichern';
  if (!document.querySelector('script[data-gpx-export]')) {
    const s = document.createElement('script');
    s.src = 'gpx-export.js?v=20260830-1';
    s.dataset.gpxExport = '1';
    document.body.appendChild(s);
  }

  map.on('load', () => {
    if (!tracking) $('status').textContent = 'Tippe auf die Karte: erster Punkt = Start.';
  });
})();