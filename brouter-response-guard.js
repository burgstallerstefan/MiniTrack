(() => {
  if (window.__miniTrackBrouterGuard) return;
  window.__miniTrackBrouterGuard = true;

  const nativeFetch = window.fetch.bind(window);
  const MAX_SNAP_KM = 0.08;

  function km(a,b) {
    const r = 6371;
    const dLat = (b[1]-a[1]) * Math.PI / 180;
    const dLon = (b[0]-a[0]) * Math.PI / 180;
    const la1 = a[1] * Math.PI / 180;
    const la2 = b[1] * Math.PI / 180;
    const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
    return 2*r*Math.asin(Math.min(1,Math.sqrt(h)));
  }

  function geometryKm(coords) {
    let d = 0;
    for (let i=1;i<coords.length;i++) d += km(coords[i-1],coords[i]);
    return d;
  }

  function requestedPair(rawUrl) {
    try {
      const u = new URL(rawUrl, location.href);
      if (u.hostname !== 'brouter.de' || !u.pathname.includes('/brouter')) return null;
      const raw = u.searchParams.get('lonlats');
      if (!raw) return null;
      const p = raw.split('|').map(x => x.split(',').map(Number));
      if (p.length !== 2 || p.some(x => x.length < 2 || !Number.isFinite(x[0]) || !Number.isFinite(x[1]))) return null;
      return [p[0].slice(0,2),p[1].slice(0,2)];
    } catch { return null; }
  }

  function invalidRoute(data,pair) {
    const f = data?.type === 'FeatureCollection' ? data.features?.[0] : data;
    const c = f?.geometry?.coordinates;
    if (!Array.isArray(c) || c.length < 2) return false;

    const startSnap = km(pair[0],c[0]);
    const endSnap = km(pair[1],c[c.length-1]);
    if (startSnap > MAX_SNAP_KM || endSnap > MAX_SNAP_KM) return true;

    const direct = km(pair[0],pair[1]);
    const routed = geometryKm(c);
    if (direct < 0.05) return routed > 0.30;
    return routed > Math.max(direct * 3, direct + 1.0);
  }

  window.fetch = async function(input,init) {
    const rawUrl = typeof input === 'string' ? input : input?.url;
    const pair = requestedPair(rawUrl);
    const response = await nativeFetch(input,init);
    if (!pair || !response.ok) return response;

    try {
      const clone = response.clone();
      const data = await clone.json();
      if (!invalidRoute(data,pair)) return response;

      console.info('[MiniTrack] BRouter-Segment verworfen: Endpunkt zu weit gesnappt oder Umweg unplausibel.', {pair});
      return new Response(JSON.stringify({type:'FeatureCollection',features:[]}), {
        status:200,
        headers:{'Content-Type':'application/geo+json'}
      });
    } catch {
      return response;
    }
  };
})();
