(() => {
  let directPoints = [];
  let directMarkers = [];
  let calcToken = 0;
  let pendingAdd = false;
  let rebuildTimer = null;
  let activeRouteController = null;
  let routeCalculationId = 0;
  const routeCache = new Map();
  const ROUTE_CACHE_MS = 5 * 60 * 1000;

  if (!document.querySelector('script[data-elevation-ui]')) {
    const s = document.createElement('script');
    s.src = 'elevation-ui.js?v=20260830-3';
    s.dataset.elevationUi = '1';
    document.body.appendChild(s);
  }

  const routeInfo = $('routeInfo');
  const routeActions = $('routeActions');
  const startBtn = $('startRoute');
  const clearBtn = $('clearRoute');
  if (clearBtn) clearBtn.style.display = 'none';

  const addBtn = document.createElement('button');
  addBtn.id = 'addRoutePoint';
  addBtn.className = 'secondary';
  addBtn.textContent = '＋ Hinzufügen';
  if (routeActions) routeActions.insertBefore(addBtn, startBtn || routeActions.firstChild);

  const pointList = document.createElement('div');
  pointList.id = 'routePointList';
  pointList.style.cssText = 'display:none;margin:10px 0 8px;border:1px solid #ddd;border-radius:12px;overflow:hidden;background:#fff';
  routeActions?.parentNode?.insertBefore(pointList, routeActions);

  function routeCacheKey(points) {
    return points.map(p => `${(+p[0]).toFixed(5)},${(+p[1]).toFixed(5)}`).join('|');
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
    while (routeCache.size > 20) routeCache.delete(routeCache.keys().next().value);
  }

  function abortRouting() {
    routeCalculationId++;
    activeRouteController?.abort();
    activeRouteController = null;
  }

  async function fetchMainRoute(points, signal) {
    const key = routeCacheKey(points);
    const cached = cachedRoute(key);
    if (cached) return cached;
    const lonlats = points.map(p => `${p[0]},${p[1]}`).join('|');
    const url = 'https://brouter.de/brouter?lonlats=' + encodeURIComponent(lonlats) + '&profile=trekking&alternativeidx=0&format=geojson';
    const r = await fetch(url, {signal, cache:'no-store'});
    if (!r.ok) throw new Error('routing HTTP ' + r.status);
    const d = await r.json();
    const f = d.type === 'FeatureCollection' ? d.features?.[0] : d;
    if (!f?.geometry?.coordinates?.length) throw new Error('empty route');
    const s = routeStats(f);
    const value = {...s, brouterIndex:0, fingerprint:routeFingerprint(s.coords)};
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
    const timeout = setTimeout(() => controller.abort(), 12000);
    $('status').textContent = 'Berechne Wanderroute …';
    try {
      const main = await fetchMainRoute(points, signal);
      if (id !== routeCalculationId || signal.aborted) throw new DOMException('stale','AbortError');
      routeOptions = [main];
      routeBaseName = baseName;
      selectedRouteIndex = 0;
      routeCoords = main.coords;
      routeName = baseName;
      if (map.getSource('alternatives')) map.getSource('alternatives').setData({type:'FeatureCollection',features:[]});
      showRoute(false);
      updateRouteInfo(main);
      routeInfo.style.display = 'block';
      if (startBtn) startBtn.disabled = false;
      return main;
    } finally {
      clearTimeout(timeout);
      if (id === routeCalculationId) activeRouteController = null;
    }
  };

  function cancelScheduledRoute() {
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = null;
  }

  function scheduleRebuild(delay = 160) {
    cancelScheduledRoute();
    if (directPoints.length < 2) return;
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null;
      rebuildDirectRoute();
    }, delay);
  }

  function clearDirectMarkers() {
    directMarkers.forEach(m => m.remove());
    directMarkers = [];
  }

  function pointLabel(i) {
    if (i === 0) return 'S';
    if (i === directPoints.length - 1) return 'Z';
    return String(i);
  }

  function pointName(i) {
    if (i === 0) return 'Start';
    if (i === directPoints.length - 1) return 'Ziel';
    return `Wegpunkt ${i}`;
  }

  function removePoint(i) {
    if (i < 0 || i >= directPoints.length) return;
    directPoints.splice(i, 1);
    pendingAdd = false;
    calcToken++;
    abortRouting();
    cancelScheduledRoute();
    renderDirectMarkers();
    renderPointList();
    if (directPoints.length >= 2) scheduleRebuild(80);
    else {
      if (map.getSource('route')) map.getSource('route').setData({type:'FeatureCollection',features:[]});
      routeCoords = null;
      if (startBtn) startBtn.disabled = true;
      $('routeRemain').textContent = '—';
      $('routeTitle').textContent = 'Route planen';
    }
  }

  function beginHandleDrag(ev, fromIndex) {
    ev.preventDefault();
    ev.stopPropagation();
    const pointerId = ev.pointerId;
    let targetIndex = fromIndex;
    const rows = () => [...pointList.querySelectorAll('.route-order-row')];

    const clearTargets = () => rows().forEach(r => r.style.background = '#fff');
    const move = e => {
      if (e.pointerId !== pointerId) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.route-order-row');
      if (!el || !pointList.contains(el)) return;
      const idx = Number(el.dataset.index);
      if (!Number.isInteger(idx)) return;
      targetIndex = idx;
      clearTargets();
      el.style.background = '#eaf2ff';
    };
    const up = e => {
      if (e.pointerId !== pointerId) return;
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
      clearTargets();
      if (targetIndex !== fromIndex) {
        const [p] = directPoints.splice(fromIndex, 1);
        directPoints.splice(targetIndex, 0, p);
        calcToken++;
        abortRouting();
        renderDirectMarkers();
        renderPointList();
        scheduleRebuild(80);
      }
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
  }

  function renderPointList() {
    pointList.innerHTML = '';
    pointList.style.display = directPoints.length ? 'block' : 'none';
    directPoints.forEach((_, i) => {
      const row = document.createElement('div');
      row.className = 'route-order-row';
      row.dataset.index = String(i);
      row.style.cssText = 'display:grid;grid-template-columns:44px 34px 1fr 38px;align-items:center;min-height:48px;border-bottom:1px solid #eee;touch-action:none';

      const handle = document.createElement('button');
      handle.type = 'button';
      handle.textContent = '☰';
      handle.title = 'Punkt verschieben';
      handle.style.cssText = 'height:46px;border:0;background:transparent;font-size:24px;color:#666;touch-action:none;padding:0';
      handle.addEventListener('pointerdown', e => beginHandleDrag(e, i));

      const badge = document.createElement('div');
      badge.textContent = pointLabel(i);
      badge.style.cssText = 'width:26px;height:26px;border-radius:50%;border:2px solid #1769d2;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11px';

      const name = document.createElement('div');
      name.textContent = pointName(i);
      name.style.cssText = 'font-weight:750;font-size:14px;padding-left:6px';

      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.title = 'Punkt entfernen';
      del.style.cssText = 'border:0;background:transparent;font-size:24px;color:#777;height:46px';
      del.addEventListener('click', e => { e.stopPropagation(); removePoint(i); });

      row.append(handle, badge, name, del);
      pointList.appendChild(row);
    });
  }

  function addDirectMarker(c, i) {
    const el = document.createElement('div');
    el.style.cssText = 'width:30px;height:30px;border-radius:50%;background:white;border:3px solid #1769d2;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;box-shadow:0 2px 8px #555;touch-action:none';
    el.textContent = pointLabel(i);
    const marker = new maplibregl.Marker({element:el, draggable:true}).setLngLat(c).addTo(map);
    marker.on('dragstart', () => { cancelScheduledRoute(); abortRouting(); });
    marker.on('dragend', () => {
      const p = marker.getLngLat();
      directPoints[i] = [p.lng, p.lat];
      renderPointList();
      scheduleRebuild(100);
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
      const o = await calculateRoutes(snapshot, 'Geplante Wanderung');
      if (!o || token !== calcToken) return;
      $('routeTitle').textContent = `${directPoints.length} Punkte · ${o.dist.toFixed(1)} km`;
      $('status').textContent = `${o.dist.toFixed(1)} km · Punkte verschieben oder Start drücken.`;
    } catch (e) {
      if (e?.name === 'AbortError') return;
      if (token === calcToken) $('status').textContent = 'Route konnte gerade nicht berechnet werden.';
    }
  }

  function setGpsAsStartAndWaitForPoint() {
    const ready = () => {
      if (!gps) return;
      if (!directPoints.length) {
        directPoints = [[gps[0], gps[1]]];
        renderDirectMarkers();
        renderPointList();
        routeInfo.style.display = 'block';
        $('routeTitle').textContent = 'Route planen';
        if (startBtn) startBtn.disabled = true;
      }
      pendingAdd = true;
      $('status').textContent = directPoints.length === 1
        ? 'Start = aktueller Standort. Ziel auf der Karte antippen.'
        : 'Neuen Wegpunkt auf der Karte antippen.';
    };
    if (gps) ready();
    else requestLocation(ready);
  }

  addBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    setGpsAsStartAndWaitForPoint();
  });

  map.on('click', e => {
    if (tracking || planning || !pendingAdd) return;
    const target = e.originalEvent?.target;
    if (target?.closest?.('.maplibregl-marker, .maplibregl-popup, button, input, label')) return;
    pendingAdd = false;
    const c = [e.lngLat.lng, e.lngLat.lat];
    if (directPoints.length < 2) directPoints.push(c);
    else directPoints.splice(directPoints.length - 1, 0, c);
    renderDirectMarkers();
    renderPointList();
    abortRouting();
    scheduleRebuild(60);
  });

  clearBtn?.addEventListener('click', () => {
    directPoints = [];
    pendingAdd = false;
    calcToken++;
    abortRouting();
    cancelScheduledRoute();
    clearDirectMarkers();
    renderPointList();
  });

  startBtn?.addEventListener('click', () => {
    if (!routeCoords?.length) return;
    calcToken++;
    abortRouting();
    cancelScheduledRoute();
    pendingAdd = false;
    clearDirectMarkers();
    pointList.style.display = 'none';
    const pos = gps || routeCoords[0];
    const b = routeCoords.length > 1 ? bearing(routeCoords[0], routeCoords[Math.min(8, routeCoords.length - 1)]) : 0;
    const use3D = window.miniTrackTerrain3D === true;
    map.easeTo({center:pos, zoom:Math.max(map.getZoom(),16), pitch:use3D ? 55 : 0, bearing:b, duration:450});
    $('directionCard').style.display = 'block';
    $('directionText').textContent = 'Route folgen';
  });

  if (startBtn) startBtn.disabled = true;
  if ($('saveTrack')) $('saveTrack').textContent = '⬇ GPX';

  map.on('load', () => {
    // Beim Öffnen sofort Standort anfragen und dorthin springen.
    if (!gps && !tracking) requestLocation();
    if (!tracking) $('status').textContent = 'Standort wird geladen …';
  });
})();