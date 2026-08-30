(() => {
  const endpoints = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];
  const known = new Set();
  const CACHE_PREFIX = 'minitrack-pois-v8:';
  const CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
  let seq = 0;
  let moveTimer = null;

  const checked = id => !!$(id)?.checked;

  function bbox() {
    const b = map.getBounds();
    return `${Math.max(-85,b.getSouth())},${b.getWest()},${Math.min(85,b.getNorth())},${b.getEast()}`;
  }

  function keyFor(kind, box) {
    return `${CACHE_PREFIX}${kind}:${box.split(',').map(v=>(+v).toFixed(3)).join(',')}`;
  }

  function readCache(kind, box) {
    try {
      const x = JSON.parse(localStorage.getItem(keyFor(kind,box)) || 'null');
      if (!x || !Array.isArray(x.elements) || Date.now() - x.time > CACHE_MAX_AGE) return null;
      return x.elements;
    } catch { return null; }
  }

  function writeCache(kind, box, elements) {
    try { localStorage.setItem(keyFor(kind,box), JSON.stringify({time:Date.now(),elements})); } catch {}
  }

  function coordFor(el) {
    if (Number.isFinite(el.lon) && Number.isFinite(el.lat)) return [el.lon,el.lat];
    if (el.center && Number.isFinite(el.center.lon) && Number.isFinite(el.center.lat)) return [el.center.lon,el.center.lat];
    return null;
  }

  function categoryFor(tags={}) {
    const name = tags.name || tags['name:de'] || '';
    if (/(alm|alpe)/i.test(name)) return ['alms','Alm / Alpe'];
    if (tags.natural === 'peak') return ['peaks','Gipfel'];
    if (tags.tourism === 'alpine_hut' || tags.tourism === 'wilderness_hut') return ['huts','Hütte'];
    if (tags.amenity && /^(restaurant|cafe|fast_food|bar|biergarten)$/.test(tags.amenity)) return ['food','Berggasthaus'];
    return null;
  }

  function addElements(elements) {
    for (const el of elements || []) {
      const tags = el.tags || {};
      const cat = categoryFor(tags);
      const c = coordFor(el);
      const name = tags.name || tags['name:de'] || 'Ohne Namen';
      if (!cat || !c) continue;
      if (cat[0] === 'alms' && !checked('almsChk')) continue;
      if (cat[0] === 'huts' && !checked('hutsChk')) continue;
      if (cat[0] === 'food' && !checked('foodChk')) continue;
      if (cat[0] === 'peaks' && !checked('peaksChk')) continue;
      const k = `${cat[0]}|${name}|${c[0].toFixed(5)}|${c[1].toFixed(5)}`;
      if (known.has(k)) continue;
      known.add(k);
      addPoi(cat[0], cat[1], name, c, new Set());
    }
  }

  function showStatus(extra='') {
    if (tracking || planning) return;
    const p=[];
    if (checked('almsChk')) p.push(`${markers.alms.length} Almen`);
    if (checked('hutsChk')) p.push(`${markers.huts.length} Hütten`);
    if (checked('foodChk')) p.push(`${markers.food.length} Berggasthäuser`);
    if (checked('peaksChk')) p.push(`${markers.peaks.length} Gipfel`);
    $('status').textContent = (p.join(' · ') || 'Keine Ziele ausgewählt.') + (extra ? ` · ${extra}` : '');
  }

  async function request(query) {
    const errors=[];
    for (let i=0;i<endpoints.length;i++) {
      const ctl = new AbortController();
      const timer = setTimeout(()=>ctl.abort(), 15000);
      try {
        const r = await fetch(endpoints[i] + '?data=' + encodeURIComponent(query), {cache:'no-store',signal:ctl.signal});
        clearTimeout(timer);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        return data.elements || [];
      } catch (e) {
        clearTimeout(timer);
        errors.push(`${i+1}:${e?.name==='AbortError'?'Timeout':e?.message||'Fehler'}`);
      }
    }
    throw new Error(errors.join(', '));
  }

  async function loadAlms(box, mySeq) {
    if (!checked('almsChk')) return;
    const cached = readCache('alms',box);
    if (cached) addElements(cached);
    showStatus('lade Almen …');
    const q = `[out:json][timeout:20];nwr["name"~"(alm|alpe)",i](${box});out center;`;
    try {
      const elements = await request(q);
      if (mySeq !== seq) return;
      writeCache('alms',box,elements);
      addElements(elements);
      showStatus();
    } catch (e) {
      if (mySeq === seq) showStatus(`Alm-Fehler: ${e.message}`);
      throw e;
    }
  }

  async function loadOthers(box, mySeq) {
    const parts=[];
    if (checked('hutsChk')) parts.push(`nwr["tourism"~"^(alpine_hut|wilderness_hut)$"](${box});`);
    if (checked('foodChk')) parts.push(`nwr["amenity"~"^(restaurant|cafe|fast_food|bar|biergarten)$"]["name"](${box});`);
    if (checked('peaksChk')) parts.push(`nwr["natural"="peak"]["name"](${box});`);
    if (!parts.length) return;
    const cached = readCache('other',box);
    if (cached) addElements(cached);
    const q = `[out:json][timeout:20];(${parts.join('')});out center;`;
    try {
      const elements = await request(q);
      if (mySeq !== seq) return;
      writeCache('other',box,elements);
      addElements(elements);
      showStatus();
    } catch (e) {
      if (mySeq === seq && !checked('almsChk')) showStatus(`POI-Fehler: ${e.message}`);
    }
  }

  async function loadVisible() {
    const mySeq = ++seq;
    const box = bbox();
    try { await loadAlms(box,mySeq); } catch {}
    if (mySeq !== seq) return;
    await loadOthers(box,mySeq);
  }

  updatePois = () => {};

  ['almsChk','hutsChk','foodChk','peaksChk'].forEach(id => $(id)?.addEventListener('change', () => {
    const cat = id==='almsChk'?'alms':id==='hutsChk'?'huts':id==='foodChk'?'food':'peaks';
    markers[cat].forEach(m => m.getElement().style.display = $(id).checked ? 'block' : 'none');
    clearTimeout(moveTimer);
    moveTimer = setTimeout(loadVisible,30);
  }));

  map.on('moveend', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(loadVisible,180);
  });

  if (map.loaded()) loadVisible(); else map.once('load',loadVisible);
})();