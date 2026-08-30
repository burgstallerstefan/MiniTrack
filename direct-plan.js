(() => {
  let directPoints = [];
  let directMarkers = [];
  let calcToken = 0;
  let insertAfter = null;
  let activePopup = null;
  let rebuildTimer = null;

  if (!document.querySelector('script[data-elevation-ui]')) {
    const s = document.createElement('script');
    s.src = 'elevation-ui.js?v=20260830-2';
    s.dataset.elevationUi = '1';
    document.body.appendChild(s);
  }

  function closePointPopup() {
    if (activePopup) activePopup.remove();
    activePopup = null;
  }

  function clearDirectMarkers() {
    closePointPopup();
    directMarkers.forEach(m => m.remove());
    directMarkers = [];
  }

  function pointLabel(i) {
    if (i === 0) return 'S';
    if (i === directPoints.length - 1) return 'Z';
    return String(i);
  }

  function scheduleRebuild(delay = 120) {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null;
      rebuildDirectRoute();
    }, delay);
  }

  function removePoint(i) {
    if (i < 0 || i >= directPoints.length) return;
    directPoints.splice(i, 1);
    insertAfter = null;
    calcToken++;
    renderDirectMarkers();
    if (directPoints.length >= 2) scheduleRebuild(30);
    else {
      try { clearRoute(); } catch {}
      $('routeInfo').style.display = 'none';
      $('status').textContent = directPoints.length ? 'Start gesetzt. Nächsten Punkt antippen.' : 'Ersten Punkt als Start antippen.';
    }
  }

  function openPointPopup(i, marker) {
    closePointPopup();
    const wrap = document.createElement('div');
    wrap.style.cssText = 'min-width:190px;font:14px system-ui,sans-serif';

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:800;margin-bottom:8px';
    title.textContent = i === 0 ? 'Start' : (i === directPoints.length - 1 ? 'Ziel' : `Zwischenpunkt ${i}`);

    const add = document.createElement('button');
    add.textContent = '+ Route hinzufügen';
    add.style.cssText = 'width:100%;min-height:40px;margin-bottom:6px;border:0;border-radius:9px;background:#1769d2;color:#fff;font-weight:750';
    add.addEventListener('click', ev => {
      ev.stopPropagation();
      insertAfter = i;
      closePointPopup();
      $('status').textContent = 'Nächsten Punkt auf der Karte antippen – wird hier eingefügt.';
    });

    const del = document.createElement('button');
    del.textContent = 'Punkt entfernen';
    del.style.cssText = 'width:100%;min-height:40px;border:1px solid #ccc;border-radius:9px;background:#fff;color:#222;font-weight:700';
    del.addEventListener('click', ev => {
      ev.stopPropagation();
      closePointPopup();
      removePoint(i);
    });

    wrap.append(title, add, del);
    activePopup = new maplibregl.Popup({offset:20, closeButton:true, closeOnClick:false})
      .setLngLat(marker.getLngLat())
      .setDOMContent(wrap)
      .addTo(map);
    activePopup.on('close', () => { activePopup = null; });
  }

  function addDirectMarker(c, i) {
    const el = document.createElement('div');
    el.style.cssText = 'width:30px;height:30px;border-radius:50%;background:white;border:3px solid #1769d2;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;box-shadow:0 2px 8px #555;touch-action:none;cursor:pointer';
    el.textContent = pointLabel(i);

    const marker = new maplibregl.Marker({element:el, draggable:true}).setLngLat(c).addTo(map);
    marker.on('dragstart', () => {
      closePointPopup();
      clearTimeout(rebuildTimer);
      rebuildTimer = null;
    });
    marker.on('dragend', () => {
      const p = marker.getLngLat();
      directPoints[i] = [p.lng, p.lat];
      insertAfter = null;
      if (directPoints.length >= 2) scheduleRebuild(80);
    });
    el.addEventListener('click', ev => {
      ev.stopPropagation();
      openPointPopup(i, marker);
    });
    directMarkers.push(marker);
  }

  function renderDirectMarkers() {
    clearDirectMarkers();
    directPoints.forEach((c, i) => addDirectMarker(c, i));
  }

  async function rebuildDirectRoute() {
    if (directPoints.length < 2) return;
    const token = ++calcToken;
    const snapshot = directPoints.map(p => [p[0], p[1]]);
    try {
      await calculateRoutes(snapshot, 'Geplante Wanderung');
      if (token !== calcToken) return;
      const o = routeOptions[selectedRouteIndex];
      if (o) {
        $('routeTitle').textContent = `${directPoints.length} Punkte · ${o.dist.toFixed(1)} km`;
        $('status').textContent = `${o.dist.toFixed(1)} km · Punkte ziehen oder weiteren Punkt antippen.`;
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
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

    closePointPopup();
    const c = [e.lngLat.lng, e.lngLat.lat];
    if (insertAfter !== null && insertAfter >= 0 && insertAfter < directPoints.length) {
      directPoints.splice(insertAfter + 1, 0, c);
      insertAfter = null;
    } else {
      directPoints.push(c);
    }
    renderDirectMarkers();

    if (directPoints.length === 1) {
      $('status').textContent = 'Start gesetzt. Nächsten Punkt auf der Karte antippen.';
      return;
    }
    scheduleRebuild(60);
  });

  $('clearRoute')?.addEventListener('click', () => {
    directPoints = [];
    insertAfter = null;
    calcToken++;
    clearTimeout(rebuildTimer);
    rebuildTimer = null;
    clearDirectMarkers();
    $('status').textContent = 'Route gelöscht. Ersten Punkt als Start antippen.';
  });

  $('startRoute')?.addEventListener('click', () => {
    if (!routeCoords?.length) return;
    closePointPopup();
    insertAfter = null;
    clearTimeout(rebuildTimer);
    rebuildTimer = null;
    clearDirectMarkers();
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

  const routeActions = $('routeActions');
  if (routeActions && !$('exportRouteGpx')) {
    const btn = document.createElement('button');
    btn.id = 'exportRouteGpx';
    btn.className = 'secondary';
    btn.textContent = '⬇ GPX';
    routeActions.insertBefore(btn, $('clearRoute'));
  }
  if ($('saveTrack')) $('saveTrack').textContent = '⬇ GPX';

  // Performance-Schicht erst laden, nachdem alle Planer-Funktionen definiert sind.
  if (!document.querySelector('script[data-route-performance]')) {
    const s = document.createElement('script');
    s.src = 'route-performance.js?v=20260830-1';
    s.dataset.routePerformance = '1';
    document.body.appendChild(s);
  }

  map.on('load', () => {
    if (!tracking) $('status').textContent = 'Tippe auf die Karte: erster Punkt = Start.';
  });
})();