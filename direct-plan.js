(() => {
  let directPoints = [];
  let directMarkers = [];
  let calcToken = 0;
  let insertAfter = null;
  let activePopup = null;
  let rebuildTimer = null;
  let activeRouteController = null;
  let routeCalculationId = 0;
  const routeCache = new Map();
  const ROUTE_CACHE_MS = 2 * 60 * 1000;

  if (!document.querySelector('script[data-elevation-ui]')) {
    const s = document.createElement('script');
    s.src = 'elevation-ui.js?v=20260830-3';
    s.dataset.elevationUi = '1';
    document.body.appendChild(s);
  }

  function routeCacheKey(points, idx) {
    return idx + ':' + points.map(p => `${(+p[0]).toFixed(6)},${(+p[1]).toFixed(6)}`).join('|');
  }

  function cachedRoute(key) {
    const x = routeCache.get(key);
    if (!x) return null;
    if (Date.now() - x.time > ROUTE_CACHE_MS) {
      routeCache.delete(key);
      return null;
    }
    return x.value;
  }

  function saveRouteCache(key, value) {
    routeCache.set(key, {time:Date.now(), value});
    while (routeCache.size > 30) routeCache.delete(routeCache.keys().next().value);
  }

  function abortRouting() {
    routeCalculationId++;
    if (activeRouteController) activeRouteController.abort();
    activeRouteController = null;
  }

  async function fetchOptimizedRoute(points, idx, signal) {
    const key = routeCacheKey(points, idx);
    const cached = cachedRoute(key);
    if (cached) return cached;
    const lonlats = points.map(p => `${p[0]},${p[1]}`).join('|');
    const url = 'https://brouter.de/brouter?lonlats=' + encodeURIComponent(lonlats) + `&profile=trekking&alternativeidx=${idx}&format=geojson`;
    const r = await fetch(url, {signal, cache:'no-store'});
    if (!r.ok) throw new Error('routing HTTP ' + r.status);
    const d = await r.json();
    const f = d.type === 'FeatureCollection' ? d.features?.[0] : d;
    if (!f?.geometry?.coordinates?.length) throw new Error('empty route');
    const s = routeStats(f);
    const value = {...s, brouterIndex:idx, fingerprint:routeFingerprint(s.coords)};
    saveRouteCache(key, value);
    return value;
  }

  calculateRoutes = async function(points, baseName) {
    if (!Array.isArray(points) || points.length < 2) throw new Error('too few points');
    abortRouting();
    const id = routeCalculationId;
    const controller = new AbortController();
    activeRouteController = controller;
    const signal = controller.signal;
    const timeout = setTimeout(() => controller.abort(), 14000);
    $('status').textContent = 'Berechne Wanderroute …';

    try {
      const main = await fetchOptimizedRoute(points, 0, signal);
      if (id !== routeCalculationId || signal.aborted) throw new DOMException('stale','AbortError');

      routeOptions = [main];
      routeBaseName = baseName;
      selectedRouteIndex = 0;
      selectRouteOption(0, false);
      $('routeInfo').style.display = 'block';
      $('status').textContent = 'Route berechnet · suche Alternativen …';

      const settled = await Promise.allSettled([
        fetchOptimizedRoute(points, 1, signal),
        fetchOptimizedRoute(points, 2, signal)
      ]);
      if (id !== routeCalculationId || signal.aborted) return;

      const seen = new Set([main.fingerprint]);
      for (const r of settled) {
        if (r.status !== 'fulfilled') continue;
        const o = r.value;
        if (!o?.fingerprint || seen.has(o.fingerprint)) continue;
        seen.add(o.fingerprint);
        routeOptions.push(o);
      }
      if (id !== routeCalculationId) return;

      routeCoords = routeOptions[selectedRouteIndex]?.coords || main.coords;
      renderRouteOptions();
      showRoute(false);
      updateRouteInfo(routeOptions[selectedRouteIndex] || main);
      $('status').textContent = routeOptions.length > 1 ? `${routeOptions.length} Routen gefunden · graue Alternative antippen.` : 'Route berechnet.';
    } catch (e) {
      if (e?.name === 'AbortError') return;
      if (id === routeCalculationId) $('status').textContent = 'Route konnte gerade nicht berechnet werden.';
      throw e;
    } finally {
      clearTimeout(timeout);
      if (id === routeCalculationId) activeRouteController = null;
    }
  };

  function closePointPopup() {
    if (activePopup) activePopup.remove();
    activePopup = null;
  }

  function cancelScheduledRoute() {
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = null;
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
    cancelScheduledRoute();
    if (directPoints.length < 2) return;
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
    abortRouting();
    cancelScheduledRoute();
    renderDirectMarkers();
    if (directPoints.length >= 2) scheduleRebuild(80);
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
    activePopup = new maplibregl.Popup({offset:20, closeButton:true, closeOnClick:false}).setLngLat(marker.getLngLat()).setDOMContent(wrap).addTo(map);
    activePopup.on('close', () => { activePopup = null; });
  }

  function addDirectMarker(c, i) {
    const el = document.createElement('div');
    el.style.cssText = 'width:30px;height:30px;border-radius:50%;background:white;border:3px solid #1769d2;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;box-shadow:0 2px 8px #555;touch-action:none;cursor:pointer';
    el.textContent = pointLabel(i);
    const marker = new maplibregl.Marker({element:el, draggable:true}).setLngLat(c).addTo(map);
    marker.on('dragstart', () => {
      closePointPopup();
      cancelScheduledRoute();
      abortRouting();
    });
    marker.on('dragend', () => {
      const p = marker.getLngLat();
      directPoints[i] = [p.lng, p.lat];
      insertAfter = null;
      renderDirectMarkers();
      scheduleRebuild(100);
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
    } else directPoints.push(c);
    renderDirectMarkers();
    if (directPoints.length === 1) {
      $('status').textContent = 'Start gesetzt. Nächsten Punkt auf der Karte antippen.';
      return;
    }
    abortRouting();
    scheduleRebuild(100);
  });

  $('clearRoute')?.addEventListener('click', () => {
    directPoints = [];
    insertAfter = null;
    calcToken++;
    abortRouting();
    cancelScheduledRoute();
    clearDirectMarkers();
    $('status').textContent = 'Route gelöscht. Ersten Punkt als Start antippen.';
  });

  $('startRoute')?.addEventListener('click', () => {
    if (!routeCoords?.length) return;
    calcToken++;
    abortRouting();
    cancelScheduledRoute();
    closePointPopup();
    insertAfter = null;
    clearDirectMarkers();
    const pos = gps || routeCoords[0];
    const b = routeCoords.length > 1 ? bearing(routeCoords[0], routeCoords[Math.min(8, routeCoords.length - 1)]) : 0;
    map.easeTo({center:pos, zoom:Math.max(map.getZoom(),16), pitch:55, bearing:b, duration:700});
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

  map.on('load', () => {
    if (!tracking) $('status').textContent = 'Tippe auf die Karte: erster Punkt = Start.';
  });
})();