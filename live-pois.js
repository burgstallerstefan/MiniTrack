(() => {
  const STORE='minitrack-known-pois-v1';
  const known=new Set();
  const saved=[];
  let timer=null;

  const checked=id=>!!document.getElementById(id)?.checked;

  function catFor(props={},layer=''){
    const name=props.name||props.name_de||props['name:de']||'';
    const cls=String(props.class||'').toLowerCase();
    const sub=String(props.subclass||'').toLowerCase();

    // Alm/Alpe hat immer Vorrang, egal ob zusätzlich Restaurant/Hütte getaggt.
    if(/(alm|alpe)/i.test(name)) return ['alms','Alm / Alpe'];
    if(layer==='mountain_peak' && name) return ['peaks','Gipfel'];
    if(layer==='poi'){
      if(['alpine_hut','wilderness_hut'].includes(sub)||/hut/.test(sub)) return ['huts','Hütte'];
      if(['restaurant','cafe','fast_food','bar','biergarten'].includes(sub)||['restaurant','cafe','bar'].includes(cls)) return ['food','Berggasthaus'];
    }
    return null;
  }

  function coordFor(f){
    const g=f?.geometry;
    if(!g) return null;
    if(g.type==='Point') return g.coordinates;
    if(g.type==='MultiPoint') return g.coordinates?.[0]||null;
    return null;
  }

  function key(cat,name,c){
    return `${cat}|${name}|${(+c[0]).toFixed(5)}|${(+c[1]).toFixed(5)}`;
  }

  function addOne(cat,type,name,c,persist=true){
    if(!Array.isArray(c)||!Number.isFinite(+c[0])||!Number.isFinite(+c[1])) return;
    const k=key(cat,name,c);
    if(known.has(k)) return;
    known.add(k);
    addPoi(cat,type,name,[+c[0],+c[1]],new Set());
    if(persist){
      saved.push({cat,type,name,c:[+c[0],+c[1]]});
      save();
    }
  }

  function save(){
    try{
      // Begrenzen, damit localStorage nie vollläuft.
      if(saved.length>5000) saved.splice(0,saved.length-5000);
      localStorage.setItem(STORE,JSON.stringify(saved));
    }catch{}
  }

  function restore(){
    try{
      const arr=JSON.parse(localStorage.getItem(STORE)||'[]');
      if(!Array.isArray(arr)) return;
      for(const x of arr){
        if(!x?.cat||!x?.name||!Array.isArray(x.c)) continue;
        saved.push(x);
        addOne(x.cat,x.type||'',x.name,x.c,false);
      }
    }catch{}
  }

  function showStatus(){
    if(tracking||planning) return;
    const p=[];
    if(checked('almsChk')) p.push(`${markers.alms.length} Almen`);
    if(checked('hutsChk')) p.push(`${markers.huts.length} Hütten`);
    if(checked('foodChk')) p.push(`${markers.food.length} Berggasthäuser`);
    if(checked('peaksChk')) p.push(`${markers.peaks.length} Gipfel`);
    document.getElementById('status').textContent=(p.join(' · ')||'Keine Ziele ausgewählt')+' · direkt aus Kartendaten';
  }

  function harvest(){
    if(!vectorSource) return;
    for(const layer of ['poi','place','mountain_peak']){
      let fs=[];
      try{ fs=map.querySourceFeatures(vectorSource,{sourceLayer:layer})||[]; }
      catch{ continue; }
      for(const f of fs){
        const props=f.properties||{};
        const cat=catFor(props,layer);
        const c=coordFor(f);
        const name=props.name||props.name_de||props['name:de']||'';
        if(!cat||!c||!name) continue;
        addOne(cat[0],cat[1],name,c,true);
      }
    }

    // Checkboxen bestimmen nur Sichtbarkeit, nicht ob Daten gesammelt werden.
    for(const [cat,id] of [['alms','almsChk'],['huts','hutsChk'],['food','foodChk'],['peaks','peaksChk']]){
      const on=checked(id);
      markers[cat].forEach(m=>m.getElement().style.display=on?'block':'none');
    }
    showStatus();
  }

  // Alte Funktion wird bewusst ersetzt: keine Marker löschen, kein Overpass.
  updatePois=harvest;

  ['almsChk','hutsChk','foodChk','peaksChk'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>{
    const cat=id==='almsChk'?'alms':id==='hutsChk'?'huts':id==='foodChk'?'food':'peaks';
    const on=checked(id);
    markers[cat].forEach(m=>m.getElement().style.display=on?'block':'none');
    harvest();
  }));

  map.on('moveend',()=>{
    clearTimeout(timer);
    timer=setTimeout(harvest,80);
  });

  restore();
  if(map.loaded()) setTimeout(harvest,80);
  else map.once('load',()=>setTimeout(harvest,80));
})();