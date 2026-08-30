(() => {
  const endpoints = [
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass-api.de/api/interpreter'
  ];
  const known = new Set();
  let runId = 0;
  let timer = null;

  const checked = id => !!document.getElementById(id)?.checked;

  function box() {
    const b = map.getBounds();
    return `${Math.max(-85,b.getSouth())},${b.getWest()},${Math.min(85,b.getNorth())},${b.getEast()}`;
  }

  function coord(el) {
    if (Number.isFinite(el.lon) && Number.isFinite(el.lat)) return [el.lon,el.lat];
    if (el.center && Number.isFinite(el.center.lon) && Number.isFinite(el.center.lat)) return [el.center.lon,el.center.lat];
    return null;
  }

  function classify(tags={}) {
    const name = tags.name || tags['name:de'] || '';
    if (/(alm|alpe)/i.test(name)) return ['alms','Alm / Alpe'];
    if (tags.natural === 'peak') return ['peaks','Gipfel'];
    if (tags.tourism === 'alpine_hut' || tags.tourism === 'wilderness_hut') return ['huts','Hütte'];
    if (tags.amenity && /^(restaurant|cafe|fast_food|bar|biergarten)$/.test(tags.amenity)) return ['food','Berggasthaus'];
    return null;
  }

  function add(elements) {
    for (const el of elements || []) {
      const tags = el.tags || {};
      const c = coord(el);
      const cat = classify(tags);
      const name = tags.name || tags['name:de'] || 'Ohne Namen';
      if (!cat || !c) continue;
      if (cat[0] === 'alms' && !checked('almsChk')) continue;
      if (cat[0] === 'huts' && !checked('hutsChk')) continue;
      if (cat[0] === 'food' && !checked('foodChk')) continue;
      if (cat[0] === 'peaks' && !checked('peaksChk')) continue;
      const k = `${cat[0]}|${el.type||''}|${el.id||''}|${c[0].toFixed(5)}|${c[1].toFixed(5)}`;
      if (known.has(k)) continue;
      known.add(k);
      addPoi(cat[0],cat[1],name,c,new Set());
    }
  }

  function status(text='') {
    if (tracking || planning) return;
    const p=[];
    if (checked('almsChk')) p.push(`${markers.alms.length} Almen`);
    if (checked('hutsChk')) p.push(`${markers.huts.length} Hütten`);
    if (checked('foodChk')) p.push(`${markers.food.length} Berggasthäuser`);
    if (checked('peaksChk')) p.push(`${markers.peaks.length} Gipfel`);
    document.getElementById('status').textContent = (p.join(' · ') || 'Keine Ziele ausgewählt') + (text ? ` · ${text}` : '');
  }

  function fetchOne(endpoint, query, timeout=5500) {
    return new Promise((resolve,reject) => {
      const ctl = new AbortController();
      const t = setTimeout(() => { ctl.abort(); reject(new Error('Timeout')); }, timeout);
      fetch(endpoint + '?data=' + encodeURIComponent(query), {cache:'no-store', signal:ctl.signal})
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(d => { clearTimeout(t); resolve(d.elements || []); })
        .catch(e => { clearTimeout(t); reject(e); });
    });
  }

  async function fastest(query) {
    const jobs = endpoints.map((ep,i) => fetchOne(ep,query).then(elements => ({elements,server:i+1})));
    if (typeof Promise.any === 'function') return Promise.any(jobs);
    return new Promise((resolve,reject) => {
      let fails=0,last;
      jobs.forEach(p => p.then(resolve).catch(e => { last=e; if (++fails===jobs.length) reject(last); }));
    });
  }

  async function loadAlms(b, id) {
    if (!checked('almsChk')) return;
    status('Almen: Server 1+2 …');

    // Phase 1: Nodes sind am schnellsten und decken sehr viele Almen ab (z.B. Ottenalm).
    const nodeQ = `[out:json][timeout:6];node["name"~"(alm|alpe)",i](${b});out body;`;
    try {
      const r = await fastest(nodeQ);
      if (id !== runId) return;
      add(r.elements);
      status(`Almen geladen · Server ${r.server}`);
    } catch (e) {
      if (id === runId) status(`Alm-Serverfehler: ${e?.message || 'keine Antwort'}`);
      return;
    }

    // Phase 2: Ways/Relationen ergänzen, ohne die bereits sichtbaren Almen zu blockieren.
    const wrQ = `[out:json][timeout:8];(way["name"~"(alm|alpe)",i](${b});relation["name"~"(alm|alpe)",i](${b}););out center;`;
    try {
      const r = await fastest(wrQ);
      if (id !== runId) return;
      add(r.elements);
      status();
    } catch {}
  }

  async function loadOthers(b,id) {
    const q=[];
    if (checked('hutsChk')) q.push(`nwr["tourism"~"^(alpine_hut|wilderness_hut)$"](${b});`);
    if (checked('foodChk')) q.push(`nwr["amenity"~"^(restaurant|cafe|fast_food|bar|biergarten)$"]["name"](${b});`);
    if (checked('peaksChk')) q.push(`nwr["natural"="peak"]["name"](${b});`);
    if (!q.length) return;
    try {
      const r = await fastest(`[out:json][timeout:8];(${q.join('')});out center;`);
      if (id !== runId) return;
      add(r.elements);
      status();
    } catch {}
  }

  async function load() {
    const id = ++runId;
    const b = box();
    await loadAlms(b,id);
    if (id !== runId) return;
    loadOthers(b,id);
  }

  // Alte idle-POI-Funktion vollständig deaktivieren.
  updatePois = () => {};

  ['almsChk','hutsChk','foodChk','peaksChk'].forEach(cid => document.getElementById(cid)?.addEventListener('change', () => {
    const cat = cid==='almsChk'?'alms':cid==='hutsChk'?'huts':cid==='foodChk'?'food':'peaks';
    markers[cat].forEach(m => m.getElement().style.display = document.getElementById(cid).checked ? 'block' : 'none');
    clearTimeout(timer);
    timer = setTimeout(load,20);
  }));

  map.on('moveend',() => {
    clearTimeout(timer);
    timer = setTimeout(load,250);
  });

  if (map.loaded()) load(); else map.once('load',load);
})();