(() => {
  let poiRequestSeq = 0;
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  function selectedClauses(bbox) {
    const parts = [];
    if ($('almsChk')?.checked) {
      parts.push(`nwr["place"="locality"]["name"~"(alm|alpe)",i](${bbox});`);
      parts.push(`nwr["tourism"]["name"~"(alm|alpe)",i](${bbox});`);
      parts.push(`nwr["amenity"]["name"~"(alm|alpe)",i](${bbox});`);
    }
    if ($('hutsChk')?.checked) parts.push(`nwr["tourism"~"^(alpine_hut|wilderness_hut)$"](${bbox});`);
    if ($('foodChk')?.checked) parts.push(`nwr["amenity"~"^(restaurant|cafe|fast_food|bar|biergarten)$"]["name"~"(alm|alpe|hütte|huette|berg|jausen)",i](${bbox});`);
    if ($('peaksChk')?.checked) parts.push(`nwr["natural"="peak"]["name"](${bbox});`);
    return parts;
  }

  function categoryFor(tags = {}) {
    const name = tags.name || tags['name:de'] || '';
    if (tags.natural === 'peak') return ['peaks', 'Gipfel'];
    if (tags.tourism === 'alpine_hut' || tags.tourism === 'wilderness_hut') return ['huts', 'Hütte'];
    if (tags.amenity && /^(restaurant|cafe|fast_food|bar|biergarten)$/.test(tags.amenity) && /(alm|alpe|hütte|huette|berg|jausen)/i.test(name)) return ['food', 'Berggasthaus / Einkehr'];
    if ((tags.place === 'locality' || tags.tourism || tags.amenity) && /(alm|alpe)/i.test(name)) return ['alms', 'Alm / Alpe'];
    return null;
  }

  function coordFor(el) {
    if (Number.isFinite(el.lon) && Number.isFinite(el.lat)) return [el.lon, el.lat];
    if (el.center && Number.isFinite(el.center.lon) && Number.isFinite(el.center.lat)) return [el.center.lon, el.center.lat];
    return null;
  }

  function visibleBboxes() {
    const b = map.getBounds();
    const s = b.getSouth(), n = b.getNorth(), w = b.getWest(), e = b.getEast();
    const latSpan = Math.max(.01, n - s), lonSpan = Math.max(.01, e - w);
    const rows = Math.min(3, Math.max(1, Math.ceil(latSpan / 1.5)));
    const cols = Math.min(3, Math.max(1, Math.ceil(lonSpan / 1.5)));
    const boxes = [];
    for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
      const bs=s+latSpan*r/rows,bn=s+latSpan*(r+1)/rows,bw=w+lonSpan*c/cols,be=w+lonSpan*(c+1)/cols;
      boxes.push(`${bs},${bw},${bn},${be}`);
    }
    return boxes;
  }

  async function fetchOverpass(query, start=0) {
    let lastError;
    for (let i=0;i<endpoints.length;i++) {
      try {
        const endpoint=endpoints[(i+start)%endpoints.length];
        const r=await fetch(endpoint+'?data='+encodeURIComponent(query),{cache:'no-store'});
        if(!r.ok) throw new Error('HTTP '+r.status);
        return await r.json();
      } catch(e) { lastError=e; }
    }
    throw lastError || new Error('Overpass nicht erreichbar');
  }

  async function loadAllVisiblePois() {
    const seq=++poiRequestSeq;
    const boxes=visibleBboxes();
    if(!selectedClauses(boxes[0]).length){
      Object.keys(markers).forEach(clearMarkers);
      if(!tracking&&!planning) $('status').textContent='Keine POI-Kategorie ausgewählt.';
      return;
    }
    if(!tracking&&!planning) $('status').textContent='Lade alle angehakten Ziele …';
    const results=await Promise.all(boxes.map((bbox,i)=>{
      const q=`[out:json][timeout:25];(${selectedClauses(bbox).join('')});out center tags;`;
      return fetchOverpass(q,i).catch(()=>({elements:[]}));
    }));
    if(seq!==poiRequestSeq) return;
    Object.keys(markers).forEach(clearMarkers);
    const seen=new Set();
    for(const data of results) for(const el of data.elements||[]){
      const tags=el.tags||{},cat=categoryFor(tags),c=coordFor(el),name=tags.name||tags['name:de']||'Ohne Namen';
      if(!cat||!c||!visible(cat[0])) continue;
      addPoi(cat[0],cat[1],name,c,seen);
    }
    if(!tracking&&!planning){
      const p=[];
      if($('almsChk')?.checked)p.push(`${markers.alms.length} Almen`);
      if($('hutsChk')?.checked)p.push(`${markers.huts.length} Hütten`);
      if($('foodChk')?.checked)p.push(`${markers.food.length} Einkehr`);
      if($('peaksChk')?.checked)p.push(`${markers.peaks.length} Gipfel`);
      $('status').textContent=p.join(' · ');
    }
  }

  updatePois=loadAllVisiblePois;
  ['almsChk','hutsChk','foodChk','peaksChk'].forEach(id=>$(id)?.addEventListener('change',()=>{
    clearTimeout(poiRefreshTimer);poiRefreshTimer=setTimeout(loadAllVisiblePois,60);
  }));
  map.on('moveend',()=>{clearTimeout(poiRefreshTimer);poiRefreshTimer=setTimeout(loadAllVisiblePois,120)});
  if(map.loaded())loadAllVisiblePois();else map.once('load',loadAllVisiblePois);
})();