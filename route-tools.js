(() => {
  const FS = '\x1f', RS = '\x1e';
  const modeCode = {wandern:'w',alpin:'a',rennrad:'r',gravel:'g',mtb:'m',spazieren:'s'};
  const catCode = {gps:'g',alms:'a',huts:'h',food:'f',localities:'l',peaks:'p',map:'m',shared:'s',poi:'s'};

  function b64DecodeJson(value) {
    let s = value.replace(/-/g,'+').replace(/_/g,'/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function b64EncodeText(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function esc(s) {
    return String(s || '').replace(/\\/g,'\\\\').replaceAll(RS,'\\r').replaceAll(FS,'\\f');
  }
  function compactUrl() {
    const legacy = window.MiniTrackPlanner?.getShareUrl?.();
    if (!legacy) return null;
    try {
      const u = new URL(legacy);
      const m = u.hash.match(/^#route=([^&]+)/);
      if (!m) return legacy;
      const data = b64DecodeJson(m[1]);
      const head = `2${FS}${modeCode[data.m] || 'w'}`;
      const rows = (data.p || []).map(x => {
        const lon = Number(x[0]).toFixed(5);
        const lat = Number(x[1]).toFixed(5);
        const cat = catCode[x[4]] || 's';
        return `${lon}${FS}${lat}${FS}${cat}${FS}${esc(x[2])}`;
      });
      u.hash = 'r=' + b64EncodeText([head,...rows].join(RS));
      return u.toString();
    } catch { return legacy; }
  }

  const oldShare = document.getElementById('shareRoute');
  if (oldShare) {
    const btn = oldShare.cloneNode(false);
    btn.id = 'shareRoute';
    btn.className = 'secondary';
    btn.title = 'Route teilen';
    btn.setAttribute('aria-label','Route teilen');
    btn.style.cssText = oldShare.style.cssText;
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true" style="display:block;margin:auto"><path d="M12 3v11m0-11 4 4m-4-4-4 4M5 11v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    oldShare.replaceWith(btn);
    btn.addEventListener('click', async e => {
      e.preventDefault(); e.stopPropagation();
      const url = compactUrl();
      if (!url) return;
      const title = `MiniTrack · ${window.MiniTrackActivity?.config?.label || 'Route'}`;
      const text = 'Route in MiniTrack öffnen';
      if (navigator.share) {
        try { await navigator.share({title,text,url}); return; }
        catch (err) { if (err?.name === 'AbortError') return; }
      }
      try { await navigator.clipboard.writeText(url); document.getElementById('status').textContent = 'MiniTrack-Link kopiert.'; }
      catch { document.getElementById('status').textContent = 'Teilen auf diesem Gerät nicht möglich.'; }
    });
  }

  const centerBtn = document.createElement('button');
  centerBtn.id = 'routeCenterBtn';
  centerBtn.type = 'button';
  centerBtn.title = 'Zur Route';
  centerBtn.setAttribute('aria-label','Zur Route');
  centerBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 2v3m0 14v3M2 12h3m14 0h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  centerBtn.style.cssText = 'display:none;position:absolute;z-index:22;right:10px;top:122px;width:48px;height:48px;padding:0;border-radius:14px;background:rgba(255,255,255,.97);color:#222;border:1px solid #ccc;box-shadow:0 2px 10px rgba(0,0,0,.22)';
  document.body.appendChild(centerBtn);

  function hasRoute() {
    try { return !tracking && Array.isArray(routeCoords) && routeCoords.length > 1; }
    catch { return false; }
  }
  function routeVisible() {
    if (!hasRoute()) return true;
    try {
      const view = map.getBounds();
      let inside = 0;
      const step = Math.max(1, Math.floor(routeCoords.length / 80));
      for (let i = 0; i < routeCoords.length; i += step) {
        const c = routeCoords[i];
        if (view.contains([c[0],c[1]])) inside++;
      }
      return inside > 0;
    } catch { return true; }
  }
  function syncCenter() {
    centerBtn.style.display = hasRoute() && !routeVisible() ? 'block' : 'none';
  }
  function fitRoute() {
    if (!hasRoute()) return;
    try {
      const b = new maplibregl.LngLatBounds();
      routeCoords.forEach(c => b.extend([c[0],c[1]]));
      map.fitBounds(b,{padding:{top:125,bottom:190,left:35,right:35},duration:450});
    } catch {}
  }
  centerBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); fitRoute(); });
  map.on('moveend', syncCenter);
  map.on('zoomend', syncCenter);
  setInterval(syncCenter, 800);
  syncCenter();
})();