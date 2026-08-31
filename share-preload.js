(() => {
  const m = location.hash.match(/^#r=([^&]+)/);
  if (!m) return;

  const FS = '\x1f', RS = '\x1e';
  const modeMap = {w:'wandern',a:'alpin',r:'rennrad',g:'gravel',m:'mtb',s:'spazieren'};
  const catMap = {g:'gps',a:'alms',h:'huts',f:'food',l:'localities',p:'peaks',m:'map',s:'shared'};
  const typeMap = {gps:'Aktueller Standort',alms:'Alm / Alpe',huts:'Hütte',food:'Gasthaus / Unterkunft',localities:'Ort / Lokalität',peaks:'Gipfel',map:'',shared:''};

  function b64Decode(s) {
    s = s.replace(/-/g,'+').replace(/_/g,'/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }
  function b64Encode(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function unesc(s) {
    return String(s || '').replace(/\\r/g,RS).replace(/\\f/g,FS).replace(/\\\\/g,'\\');
  }

  try {
    const raw = b64Decode(m[1]);
    const rows = raw.split(RS);
    const head = rows.shift().split(FS);
    if (head[0] !== '2') return;
    const mode = modeMap[head[1]] || 'wandern';
    const p = rows.map(row => {
      const x = row.split(FS);
      const lon = Number(x[0]), lat = Number(x[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw new Error('bad coord');
      const cat = catMap[x[2]] || 'shared';
      const name = unesc(x.slice(3).join(FS));
      return [lon,lat,name,typeMap[cat] || '',cat];
    }).filter(Boolean);
    if (p.length < 2 || p.length > 30) return;
    const legacy = b64Encode(JSON.stringify({v:1,m:mode,p}));
    history.replaceState(null,'',location.pathname + location.search + '#route=' + legacy);
  } catch {}
})();