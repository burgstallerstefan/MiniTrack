(() => {
  let poiRequestSeq = 0;
  let activeKey = '';
  let finishedKey = '';
  const tileUpdatePois = updatePois;
  const CACHE_PREFIX = 'minitrack-pois-v3:';
  const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  const endpoints = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];

  function selectionKey(){
    return ['almsChk','hutsChk','foodChk','peaksChk'].map(id=>$(id)?.checked?'1':'0').join('');
  }

  function selectedClauses(bbox) {
    const parts = [];
    if ($('almsChk')?.checked) {
      // Nur passende Namen abfragen. Keine pauschale Abfrage aller Ortsnamen mehr.
      parts.push(`nwr["name"~"(alm|alpe)",i](${bbox});`);
    }
    if ($('hutsChk')?.checked) {
      parts.push(`nwr["tourism"~"^(alpine_hut|wilderness_hut)$"](${bbox});`);
    }
    if ($('foodChk')?.checked) {
      parts.push(`nwr["amenity"~"^(restaurant|cafe|fast_food|bar|biergarten)$"]["name"~"(alm|alpe|hütte|huette|berg|jausen)",i](${bbox});`);
    }
    if ($('peaksChk')?.checked) {
      parts.push(`nwr["natural"="peak"]["name"](${bbox});`);
    }
    return parts;
  }

  function categoryFor(tags = {}) {
    const name = tags.name || tags['name:de'] || '';
    if (tags.natural === 'peak') return ['peaks', 'Gipfel'];
    if (tags.tourism === 'alpine_hut' || tags.tourism === 'wilderness_hut') return ['huts', 'Hütte'];
    if (tags.amenity && /^(restaurant|cafe|fast_food|bar|biergarten)$/.test(tags.amenity) && /(alm|alpe|hütte|huette|berg|jausen)/i.test(name)) return ['food', 'Berggasthaus'];
    if (/(alm|alpe)/i.test(name)) return ['alms', 'Alm / Alpe'];
    return null;
  }

  function coordFor(el) {
    if (Number.isFinite(el.lon) && Number.isFinite(el.lat)) return [el.lon, el.lat];
    if (el.center && Number.isFinite(el.center.lon) && Number.isFinite(el.center.lat)) return [el.center.lon, el.center.lat];
    return null;
  }

  function visibleBboxes() {
    const b = map.getBounds();
    const s=b.getSouth(), n=b.getNorth(), w=b.getWest(), e=b.getEast();
    const latSpan=Math.max(.01,n-s), lonSpan=Math.max(.01,e-w);
    const rows=Math.min(4,Math.max(1,Math.ceil(latSpan/.8)));
    const cols=Math.min(4,Math.max(1,Math.ceil(lonSpan/.8)));
    const midLat=(s+n)/2, midLon=(w+e)/2;
    const boxes=[];
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
      const bs=s+latSpan*r/rows,bn=s+latSpan*(r+1)/rows,bw=w+lonSpan*c/cols,be=w+lonSpan*(c+1)/cols;
      const cy=(bs+bn)/2,cx=(bw+be)/2;
      boxes.push({bbox:`${bs},${bw},${bn},${be}`,d:(cy-midLat)**2+(cx-midLon)**2});
    }
    boxes.sort((a,b)=>a.d-b.d);
    return boxes.map(x=>x.bbox);
  }

  function viewportKey(){
    const b=map.getBounds();
    return [b.getSouth(),b.getWest(),b.getNorth(),b.getEast()].map(v=>v.toFixed(2)).join('|')+'|'+selectionKey();
  }

  function cacheKey(bbox){return CACHE_PREFIX+selectionKey()+':'+bbox.split(',').map(v=>(+v).toFixed(2)).join(',');}
  function readCache(bbox){
    try{
      const x=JSON.parse(localStorage.getItem(cacheKey(bbox))||'null');
      if(!x||!Array.isArray(x.elements)||Date.now()-x.time>CACHE_MAX_AGE)return null;
      return x.elements;
    }catch{return null;}
  }
  function writeCache(bbox,elements){
    try{localStorage.setItem(cacheKey(bbox),JSON.stringify({time:Date.now(),elements}));}catch{}
  }

  async function fetchOverpass(query,start=0){
    let lastError;
    for(let i=0;i<endpoints.length;i++){
      try{
        const endpoint=endpoints[(i+start)%endpoints.length];
        const ctl=new AbortController();
        const timer=setTimeout(()=>ctl.abort(),7000);
        const r=await fetch(endpoint+'?data='+encodeURIComponent(query),{cache:'no-store',signal:ctl.signal});
        clearTimeout(timer);
        if(!r.ok)throw new Error('HTTP '+r.status);
        return await r.json();
      }catch(e){lastError=e;}
    }
    throw lastError||new Error('Overpass nicht erreichbar');
  }

  function addElements(elements,seen){
    for(const el of elements||[]){
      const tags=el.tags||{},cat=categoryFor(tags),c=coordFor(el),name=tags.name||tags['name:de']||'Ohne Namen';
      if(!cat||!c||!visible(cat[0]))continue;
      addPoi(cat[0],cat[1],name,c,seen);
    }
  }

  function statusText(done,total){
    const p=[];
    if($('almsChk')?.checked)p.push(`${markers.alms.length} Almen`);
    if($('hutsChk')?.checked)p.push(`${markers.huts.length} Hütten`);
    if($('foodChk')?.checked)p.push(`${markers.food.length} Berggasthäuser`);
    if($('peaksChk')?.checked)p.push(`${markers.peaks.length} Gipfel`);
    return p.join(' · ')+(done<total?` · lädt ${done}/${total}`:'');
  }

  async function runQueue(boxes,seq,seen){
    let next=0,done=0;
    const total=boxes.length;
    const worker=async workerId=>{
      while(next<total && seq===poiRequestSeq){
        const i=next++,bbox=boxes[i];
        const q=`[out:json][timeout:7];(${selectedClauses(bbox).join('')});out center tags;`;
        try{
          const data=await fetchOverpass(q,workerId+i);
          if(seq!==poiRequestSeq)return;
          writeCache(bbox,data.elements||[]);
          addElements(data.elements||[],seen);
        }catch{}
        finally{
          if(seq===poiRequestSeq){
            done++;
            if(!tracking&&!planning)$('status').textContent=statusText(done,total);
          }
        }
      }
    };
    await Promise.all([worker(0),worker(1),worker(2)]);
  }

  async function loadAllVisiblePois(force=false){
    const key=viewportKey();
    if(!force&&(key===activeKey||key===finishedKey))return;
    const boxes=visibleBboxes();
    if(!selectedClauses(boxes[0]).length){
      ++poiRequestSeq;activeKey='';finishedKey=key;
      Object.keys(markers).forEach(clearMarkers);
      if(!tracking&&!planning)$('status').textContent='Keine POI-Kategorie ausgewählt.';
      return;
    }

    const seq=++poiRequestSeq;
    activeKey=key;finishedKey='';

    // Sofort verfügbare Kartendaten zeigen.
    try{tileUpdatePois();}catch{}
    const seen=new Set();

    // Cache sofort einblenden, Zentrum zuerst.
    for(const bbox of boxes){
      const cached=readCache(bbox);
      if(cached)addElements(cached,seen);
    }

    if(!tracking&&!planning)$('status').textContent=statusText(0,boxes.length);
    await runQueue(boxes,seq,seen);
    if(seq!==poiRequestSeq)return;
    activeKey='';finishedKey=key;
    if(!tracking&&!planning)$('status').textContent=statusText(boxes.length,boxes.length);
  }

  updatePois=()=>loadAllVisiblePois(false);
  ['almsChk','hutsChk','foodChk','peaksChk'].forEach(id=>$(id)?.addEventListener('change',()=>{
    finishedKey='';
    clearTimeout(poiRefreshTimer);
    poiRefreshTimer=setTimeout(()=>loadAllVisiblePois(true),30);
  }));
  map.on('moveend',()=>{
    clearTimeout(poiRefreshTimer);
    poiRefreshTimer=setTimeout(()=>loadAllVisiblePois(false),120);
  });
  if(map.loaded())loadAllVisiblePois(true);else map.once('load',()=>loadAllVisiblePois(true));
})();