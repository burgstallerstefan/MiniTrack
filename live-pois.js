(() => {
  let poiRequestSeq = 0;
  let activeKey = '';
  let finishedKey = '';
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  function selectionKey(){
    return ['almsChk','hutsChk','foodChk','peaksChk'].map(id=>$(id)?.checked?'1':'0').join('');
  }

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
    const rows = Math.min(3, Math.max(1, Math.ceil(latSpan / 1.2)));
    const cols = Math.min(3, Math.max(1, Math.ceil(lonSpan / 1.2)));
    const boxes = [];
    for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
      const bs=s+latSpan*r/rows,bn=s+latSpan*(r+1)/rows,bw=w+lonSpan*c/cols,be=w+lonSpan*(c+1)/cols;
      boxes.push(`${bs},${bw},${bn},${be}`);
    }
    return boxes;
  }

  function viewportKey(){
    const b=map.getBounds();
    return [b.getSouth(),b.getWest(),b.getNorth(),b.getEast()].map(v=>v.toFixed(2)).join('|')+'|'+selectionKey();
  }

  async function fetchOverpass(query, start=0) {
    let lastError;
    for (let i=0;i<endpoints.length;i++) {
      try {
        const endpoint=endpoints[(i+start)%endpoints.length];
        const ctl=new AbortController();
        const timer=setTimeout(()=>ctl.abort(),12000);
        const r=await fetch(endpoint+'?data='+encodeURIComponent(query),{cache:'no-store',signal:ctl.signal});
        clearTimeout(timer);
        if(!r.ok) throw new Error('HTTP '+r.status);
        return await r.json();
      } catch(e) { lastError=e; }
    }
    throw lastError || new Error('Overpass nicht erreichbar');
  }

  function statusText(done,total){
    const p=[];
    if($('almsChk')?.checked)p.push(`${markers.alms.length} Almen`);
    if($('hutsChk')?.checked)p.push(`${markers.huts.length} Hütten`);
    if($('foodChk')?.checked)p.push(`${markers.food.length} Einkehr`);
    if($('peaksChk')?.checked)p.push(`${markers.peaks.length} Gipfel`);
    return p.join(' · ')+(done<total?` · lade ${done}/${total}`:'');
  }

  async function loadAllVisiblePois(force=false) {
    const key=viewportKey();
    if(!force && (key===activeKey || key===finishedKey)) return;
    const boxes=visibleBboxes();
    if(!selectedClauses(boxes[0]).length){
      ++poiRequestSeq; activeKey=''; finishedKey=key;
      Object.keys(markers).forEach(clearMarkers);
      if(!tracking&&!planning) $('status').textContent='Keine POI-Kategorie ausgewählt.';
      return;
    }

    const seq=++poiRequestSeq;
    activeKey=key;
    finishedKey='';
    Object.keys(markers).forEach(clearMarkers);
    const seen=new Set();
    let done=0;
    if(!tracking&&!planning) $('status').textContent='Lade Ziele …';

    const jobs=boxes.map(async (bbox,i)=>{
      const q=`[out:json][timeout:12];(${selectedClauses(bbox).join('')});out center tags;`;
      try{
        const data=await fetchOverpass(q,i);
        if(seq!==poiRequestSeq) return;
        for(const el of data.elements||[]){
          const tags=el.tags||{},cat=categoryFor(tags),c=coordFor(el),name=tags.name||tags['name:de']||'Ohne Namen';
          if(!cat||!c||!visible(cat[0])) continue;
          addPoi(cat[0],cat[1],name,c,seen);
        }
      }catch{}
      finally{
        if(seq===poiRequestSeq){
          done++;
          if(!tracking&&!planning) $('status').textContent=statusText(done,boxes.length);
        }
      }
    });

    await Promise.allSettled(jobs);
    if(seq!==poiRequestSeq) return;
    activeKey='';
    finishedKey=key;
    if(!tracking&&!planning) $('status').textContent=statusText(boxes.length,boxes.length);
  }

  updatePois=()=>loadAllVisiblePois(false);
  ['almsChk','hutsChk','foodChk','peaksChk'].forEach(id=>$(id)?.addEventListener('change',()=>{
    finishedKey='';
    clearTimeout(poiRefreshTimer);poiRefreshTimer=setTimeout(()=>loadAllVisiblePois(true),40);
  }));
  map.on('moveend',()=>{
    clearTimeout(poiRefreshTimer);poiRefreshTimer=setTimeout(()=>loadAllVisiblePois(false),100);
  });
  if(map.loaded())loadAllVisiblePois(true);else map.once('load',()=>loadAllVisiblePois(true));
})();