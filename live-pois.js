(() => {
  let poiRequestSeq = 0;
  let activeKey = '';
  let finishedKey = '';
  const known = new Set();
  const CACHE_PREFIX = 'minitrack-pois-v4:';
  const CACHE_MAX_AGE = 14 * 24 * 60 * 60 * 1000;
  const CELL = 0.75;
  const endpoints = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];

  function selectionKey(){
    return ['almsChk','hutsChk','foodChk','peaksChk'].map(id=>$(id)?.checked?'1':'0').join('');
  }

  function selectedClauses(bbox) {
    const p=[];
    if($('almsChk')?.checked)p.push(`nwr["name"~"(alm|alpe)",i](${bbox});`);
    if($('hutsChk')?.checked)p.push(`nwr["tourism"~"^(alpine_hut|wilderness_hut)$"](${bbox});`);
    if($('foodChk')?.checked)p.push(`nwr["amenity"~"^(restaurant|cafe|fast_food|bar|biergarten)$"]["name"~"(alm|alpe|hütte|huette|berg|jausen)",i](${bbox});`);
    if($('peaksChk')?.checked)p.push(`nwr["natural"="peak"]["name"](${bbox});`);
    return p;
  }

  function categoryFor(tags={}){
    const name=tags.name||tags['name:de']||'';
    if(tags.natural==='peak')return ['peaks','Gipfel'];
    if(tags.tourism==='alpine_hut'||tags.tourism==='wilderness_hut')return ['huts','Hütte'];
    if(tags.amenity&&/^(restaurant|cafe|fast_food|bar|biergarten)$/.test(tags.amenity)&&/(alm|alpe|hütte|huette|berg|jausen)/i.test(name))return ['food','Berggasthaus'];
    if(/(alm|alpe)/i.test(name))return ['alms','Alm / Alpe'];
    return null;
  }

  function coordFor(el){
    if(Number.isFinite(el.lon)&&Number.isFinite(el.lat))return [el.lon,el.lat];
    if(el.center&&Number.isFinite(el.center.lon)&&Number.isFinite(el.center.lat))return [el.center.lon,el.center.lat];
    return null;
  }

  // Feste kleine Zellen: die Größe ändert sich nicht mit dem Zoom.
  // Dadurch bleiben Cache und bereits geladene POIs auch beim Herauszoomen erhalten.
  function visibleCells(){
    const b=map.getBounds();
    const s=Math.max(-85,b.getSouth()),n=Math.min(85,b.getNorth()),w=b.getWest(),e=b.getEast();
    const midLat=(s+n)/2,midLon=(w+e)/2,cells=[];
    const y0=Math.floor(s/CELL),y1=Math.floor(n/CELL),x0=Math.floor(w/CELL),x1=Math.floor(e/CELL);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const bs=y*CELL,bn=(y+1)*CELL,bw=x*CELL,be=(x+1)*CELL;
      const cy=(bs+bn)/2,cx=(bw+be)/2;
      cells.push({bbox:`${bs},${bw},${bn},${be}`,d:(cy-midLat)**2+(cx-midLon)**2});
    }
    cells.sort((a,b)=>a.d-b.d);
    return cells.map(x=>x.bbox);
  }

  function viewportKey(){
    const b=map.getBounds();
    return [b.getSouth(),b.getWest(),b.getNorth(),b.getEast()].map(v=>(v/CELL|0)).join('|')+'|'+selectionKey();
  }

  function cacheKey(bbox){return CACHE_PREFIX+selectionKey()+':'+bbox;}
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
        const timer=setTimeout(()=>ctl.abort(),6500);
        const r=await fetch(endpoint+'?data='+encodeURIComponent(query),{cache:'no-store',signal:ctl.signal});
        clearTimeout(timer);
        if(!r.ok)throw new Error('HTTP '+r.status);
        return await r.json();
      }catch(e){lastError=e;}
    }
    throw lastError||new Error('Overpass nicht erreichbar');
  }

  function addElements(elements){
    for(const el of elements||[]){
      const tags=el.tags||{},cat=categoryFor(tags),c=coordFor(el),name=tags.name||tags['name:de']||'Ohne Namen';
      if(!cat||!c)continue;
      const key=cat[0]+'|'+name+'|'+c[0].toFixed(5)+'|'+c[1].toFixed(5);
      if(known.has(key))continue;
      known.add(key);
      const one=new Set();
      addPoi(cat[0],cat[1],name,c,one);
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

  async function runQueue(cells,seq){
    let next=0,done=0;
    const total=cells.length;
    const worker=async workerId=>{
      while(next<total&&seq===poiRequestSeq){
        const i=next++,bbox=cells[i];
        const cached=readCache(bbox);
        if(cached){addElements(cached);done++;if(!tracking&&!planning)$('status').textContent=statusText(done,total);continue;}
        const clauses=selectedClauses(bbox);
        if(!clauses.length){done++;continue;}
        const q=`[out:json][timeout:7];(${clauses.join('')});out center tags;`;
        try{
          const data=await fetchOverpass(q,workerId+i);
          if(seq!==poiRequestSeq)return;
          writeCache(bbox,data.elements||[]);
          addElements(data.elements||[]);
        }catch{}
        finally{
          if(seq===poiRequestSeq){done++;if(!tracking&&!planning)$('status').textContent=statusText(done,total);}
        }
      }
    };
    await Promise.all([worker(0),worker(1),worker(2),worker(3)]);
  }

  async function loadAllVisiblePois(force=false){
    const key=viewportKey();
    if(!force&&(key===activeKey||key===finishedKey))return;
    const cells=visibleCells();
    const seq=++poiRequestSeq;
    activeKey=key;finishedKey='';

    // WICHTIG: keine Marker mehr löschen und keine alte updatePois-Funktion aufrufen.
    // Bereits geladene Almen/Hütten usw. bleiben bei jeder Zoomstufe bestehen.
    for(const bbox of cells){const cached=readCache(bbox);if(cached)addElements(cached);}

    if(!tracking&&!planning)$('status').textContent=statusText(0,cells.length);
    await runQueue(cells,seq);
    if(seq!==poiRequestSeq)return;
    activeKey='';finishedKey=key;
    if(!tracking&&!planning)$('status').textContent=statusText(cells.length,cells.length);
  }

  updatePois=()=>loadAllVisiblePois(false);
  ['almsChk','hutsChk','foodChk','peaksChk'].forEach(id=>$(id)?.addEventListener('change',()=>{
    finishedKey='';
    clearTimeout(poiRefreshTimer);
    poiRefreshTimer=setTimeout(()=>loadAllVisiblePois(true),30);
  }));
  map.on('moveend',()=>{
    clearTimeout(poiRefreshTimer);
    poiRefreshTimer=setTimeout(()=>loadAllVisiblePois(false),100);
  });
  if(map.loaded())loadAllVisiblePois(true);else map.once('load',()=>loadAllVisiblePois(true));
})();