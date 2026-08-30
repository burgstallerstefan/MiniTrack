(() => {
  const endpoints = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];
  const CELL = 0.5;
  const CACHE_PREFIX = 'minitrack-pois-v5:';
  const CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
  const known = new Set();
  const loadedCells = new Set();
  let requestSeq = 0;
  let moveTimer = null;

  function checked(id){ return !!$(id)?.checked; }

  function selectionKey(){
    return [checked('almsChk'),checked('hutsChk'),checked('foodChk'),checked('peaksChk')].map(Boolean).map(Number).join('');
  }

  function clauses(bbox, onlyAlms=false){
    const p=[];
    if(checked('almsChk')){
      p.push(`nwr["name"~"(alm|alpe)",i](${bbox});`);
    }
    if(!onlyAlms && checked('hutsChk')){
      p.push(`nwr["tourism"~"^(alpine_hut|wilderness_hut)$"](${bbox});`);
    }
    if(!onlyAlms && checked('foodChk')){
      p.push(`nwr["amenity"~"^(restaurant|cafe|fast_food|bar|biergarten)$"]["name"](${bbox});`);
    }
    if(!onlyAlms && checked('peaksChk')){
      p.push(`nwr["natural"="peak"]["name"](${bbox});`);
    }
    return p;
  }

  function categoryFor(tags={}){
    const name=tags.name||tags['name:de']||'';
    if(tags.natural==='peak') return ['peaks','Gipfel'];
    if(tags.tourism==='alpine_hut'||tags.tourism==='wilderness_hut') return ['huts','Hütte'];
    if(tags.amenity && /^(restaurant|cafe|fast_food|bar|biergarten)$/.test(tags.amenity)) return ['food','Berggasthaus'];
    if(/(alm|alpe)/i.test(name)) return ['alms','Alm / Alpe'];
    return null;
  }

  function coordFor(el){
    if(Number.isFinite(el.lon)&&Number.isFinite(el.lat)) return [el.lon,el.lat];
    if(el.center&&Number.isFinite(el.center.lon)&&Number.isFinite(el.center.lat)) return [el.center.lon,el.center.lat];
    return null;
  }

  function markerKey(cat,name,c){
    return `${cat}|${name}|${c[0].toFixed(5)}|${c[1].toFixed(5)}`;
  }

  function addElements(elements){
    for(const el of elements||[]){
      const tags=el.tags||{};
      const cat=categoryFor(tags), c=coordFor(el);
      const name=tags.name||tags['name:de']||'Ohne Namen';
      if(!cat||!c) continue;
      if(cat[0]==='alms'&&!checked('almsChk')) continue;
      if(cat[0]==='huts'&&!checked('hutsChk')) continue;
      if(cat[0]==='food'&&!checked('foodChk')) continue;
      if(cat[0]==='peaks'&&!checked('peaksChk')) continue;
      const k=markerKey(cat[0],name,c);
      if(known.has(k)) continue;
      known.add(k);
      addPoi(cat[0],cat[1],name,c,new Set());
    }
  }

  function status(extra=''){
    if(tracking||planning) return;
    const p=[];
    if(checked('almsChk')) p.push(`${markers.alms.length} Almen`);
    if(checked('hutsChk')) p.push(`${markers.huts.length} Hütten`);
    if(checked('foodChk')) p.push(`${markers.food.length} Berggasthäuser`);
    if(checked('peaksChk')) p.push(`${markers.peaks.length} Gipfel`);
    $('status').textContent=(p.join(' · ')||'Keine Ziele ausgewählt.')+(extra?` · ${extra}`:'');
  }

  function cacheKey(bbox){ return CACHE_PREFIX+selectionKey()+':'+bbox; }
  function readCache(bbox){
    try{
      const x=JSON.parse(localStorage.getItem(cacheKey(bbox))||'null');
      if(!x||!Array.isArray(x.elements)||Date.now()-x.time>CACHE_MAX_AGE) return null;
      return x.elements;
    }catch{return null;}
  }
  function writeCache(bbox,elements){
    try{localStorage.setItem(cacheKey(bbox),JSON.stringify({time:Date.now(),elements}));}catch{}
  }

  async function overpass(query,start=0){
    let err;
    for(let i=0;i<endpoints.length;i++){
      const endpoint=endpoints[(start+i)%endpoints.length];
      const ctl=new AbortController();
      const timer=setTimeout(()=>ctl.abort(),6500);
      try{
        const r=await fetch(endpoint,{
          method:'POST',
          headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
          body:'data='+encodeURIComponent(query),
          cache:'no-store',
          signal:ctl.signal
        });
        clearTimeout(timer);
        if(!r.ok) throw new Error('HTTP '+r.status);
        return await r.json();
      }catch(e){
        clearTimeout(timer);
        err=e;
      }
    }
    throw err||new Error('Overpass nicht erreichbar');
  }

  function bboxAroundCenter(){
    const c=map.getCenter();
    const z=map.getZoom();
    const d=z>=13?.12:z>=11?.25:z>=9?.5:1.0;
    return `${c.lat-d},${c.lng-d},${c.lat+d},${c.lng+d}`;
  }

  async function quickAlms(seq){
    if(!checked('almsChk')) return;
    const bbox=bboxAroundCenter();
    const cached=readCache('ALM:'+bbox);
    if(cached) addElements(cached);
    status('lade Almen zuerst …');
    const q=`[out:json][timeout:7];(${clauses(bbox,true).join('')});out center tags;`;
    try{
      const data=await overpass(q,0);
      if(seq!==requestSeq) return;
      writeCache('ALM:'+bbox,data.elements||[]);
      addElements(data.elements||[]);
      status();
    }catch{
      if(seq===requestSeq) status('Alm-Server antwortet langsam');
    }
  }

  function visibleCells(){
    const b=map.getBounds();
    const s=Math.max(-85,b.getSouth()), n=Math.min(85,b.getNorth());
    const w=b.getWest(), e=b.getEast();
    const c=map.getCenter();
    const cells=[];
    const y0=Math.floor(s/CELL), y1=Math.floor(n/CELL);
    const x0=Math.floor(w/CELL), x1=Math.floor(e/CELL);
    for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){
      const bs=y*CELL,bn=(y+1)*CELL,bw=x*CELL,be=(x+1)*CELL;
      const cy=(bs+bn)/2,cx=(bw+be)/2;
      cells.push({bbox:`${bs},${bw},${bn},${be}`,d:(cy-c.lat)**2+(cx-c.lng)**2});
    }
    cells.sort((a,b)=>a.d-b.d);
    return cells.map(x=>x.bbox);
  }

  async function loadCell(bbox,seq,index){
    const cellKey=selectionKey()+':'+bbox;
    const cached=readCache(bbox);
    if(cached){
      addElements(cached);
      loadedCells.add(cellKey);
      return;
    }
    if(loadedCells.has(cellKey)) return;
    const cs=clauses(bbox,false);
    if(!cs.length) return;
    const q=`[out:json][timeout:7];(${cs.join('')});out center tags;`;
    try{
      const data=await overpass(q,index);
      if(seq!==requestSeq) return;
      writeCache(bbox,data.elements||[]);
      addElements(data.elements||[]);
      loadedCells.add(cellKey);
    }catch{}
  }

  async function loadVisible(){
    const seq=++requestSeq;
    await quickAlms(seq);
    if(seq!==requestSeq) return;
    const cells=visibleCells();

    for(const bbox of cells){
      const cached=readCache(bbox);
      if(cached) addElements(cached);
    }
    status(cells.length?'lade weitere Ziele …':'');

    let next=0;
    const worker=async id=>{
      while(next<cells.length&&seq===requestSeq){
        const i=next++;
        await loadCell(cells[i],seq,id+i);
        if(seq===requestSeq && i%2===0) status(`lädt ${Math.min(next,cells.length)}/${cells.length}`);
      }
    };
    await Promise.all([worker(0),worker(1),worker(2)]);
    if(seq===requestSeq) status();
  }

  // Die alte idle-Funktion darf nie wieder Marker löschen oder neue Endlosschleifen starten.
  updatePois=()=>{};

  ['almsChk','hutsChk','foodChk','peaksChk'].forEach(id=>$(id)?.addEventListener('change',()=>{
    const cat=id==='almsChk'?'alms':id==='hutsChk'?'huts':id==='foodChk'?'food':'peaks';
    markers[cat].forEach(m=>m.getElement().style.display=$(id).checked?'block':'none');
    clearTimeout(moveTimer);
    moveTimer=setTimeout(loadVisible,20);
  }));

  map.on('moveend',()=>{
    clearTimeout(moveTimer);
    moveTimer=setTimeout(loadVisible,120);
  });

  if(map.loaded()) loadVisible();
  else map.once('load',loadVisible);
})();