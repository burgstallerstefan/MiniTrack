(() => {
  let activeController = null;
  let calculationId = 0;
  const routeCache = new Map();
  const CACHE_MS = 2 * 60 * 1000;

  function cacheKey(points, idx) {
    return idx + ':' + points.map(p => `${(+p[0]).toFixed(6)},${(+p[1]).toFixed(6)}`).join('|');
  }

  function getCached(key) {
    const x = routeCache.get(key);
    if (!x) return null;
    if (Date.now() - x.time > CACHE_MS) {
      routeCache.delete(key);
      return null;
    }
    return x.value;
  }

  function putCached(key, value) {
    routeCache.set(key, { time: Date.now(), value });
    if (routeCache.size > 40) {
      const first = routeCache.keys().next().value;
      if (first) routeCache.delete(first);
    }
  }

  async function fetchFastRoute(points, idx, signal) {
    const key = cacheKey(points, idx);
    const cached = getCached(key);
    if (cached) return cached;

    const lonlats = points.map(p => `${p[0]},${p[1]}`).join('|');
    const url = 'https://brouter.de/brouter?lonlats=' + encodeURIComponent(lonlats) +
      `&profile=trekking&alternativeidx=${idx}&format=geojson`;

    const r = await fetch(url, { signal, cache: 'no-store' });
    if (!r.ok) throw new Error('routing HTTP ' + r.status);
    const d = await r.json();
    const f = d.type === 'FeatureCollection' ? d.features?.[0] : d;
    if (!f?.geometry?.coordinates?.length) throw new Error('empty route');
    const s = routeStats(f);
    const value = { ...s, brouterIndex: idx, fingerprint: routeFingerprint(s.coords) };
    putCached(key, value);
    return value;
  }

  calculateRoutes = async function(points, baseName) {
    if (!Array.isArray(points) || points.length < 2) throw new Error('too few points');

    const id = ++calculationId;
    if (activeController) activeController.abort();
    activeController = new AbortController();
    const signal = activeController.signal;
    const timeout = setTimeout(() => activeController?.abort(), 14000);

    $('status').textContent = 'Berechne Wanderroute …';

    try {
      // Hauptstrecke zuerst: die Route erscheint schnell, Alternativen kommen danach.
      const main = await fetchFastRoute(points, 0, signal);
      if (id !== calculationId || signal.aborted) throw new DOMException('stale', 'AbortError');

      routeOptions = [main];
      routeBaseName = baseName;
      selectedRouteIndex = 0;
      selectRouteOption(0, false);
      $('routeInfo').style.display = 'block';
      $('status').textContent = 'Route berechnet · suche Alternativen …';

      // Alternativen parallel nachladen, ohne die Hauptroute zu blockieren.
      const settled = await Promise.allSettled([
        fetchFastRoute(points, 1, signal),
        fetchFastRoute(points, 2, signal)
      ]);
      if (id !== calculationId || signal.aborted) return;

      const seen = new Set([main.fingerprint]);
      for (const r of settled) {
        if (r.status !== 'fulfilled') continue;
        const o = r.value;
        if (!o?.fingerprint || seen.has(o.fingerprint)) continue;
        seen.add(o.fingerprint);
        routeOptions.push(o);
      }

      // Nur neu zeichnen, wenn diese Berechnung noch aktuell ist.
      if (id !== calculationId) return;
      routeCoords = routeOptions[selectedRouteIndex]?.coords || main.coords;
      renderRouteOptions();
      showRoute(false);
      const current = routeOptions[selectedRouteIndex] || main;
      updateRouteInfo(current);
      $('status').textContent = routeOptions.length > 1
        ? `${routeOptions.length} Routen gefunden · graue Alternative antippen.`
        : 'Route berechnet.';
    } catch (e) {
      if (e?.name === 'AbortError') return;
      if (id === calculationId) $('status').textContent = 'Route konnte gerade nicht berechnet werden.';
      throw e;
    } finally {
      clearTimeout(timeout);
      if (id === calculationId) activeController = null;
    }
  };

  // Beim Löschen/Starten keine alten Netzwerkanfragen weiterlaufen lassen.
  $('clearRoute')?.addEventListener('click', () => {
    calculationId++;
    activeController?.abort();
    activeController = null;
  }, true);
  $('startRoute')?.addEventListener('click', () => {
    calculationId++;
    activeController?.abort();
    activeController = null;
  }, true);
})();