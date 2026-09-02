(() => {
  const STORE='minitrack-known-pois-v2';
  const known=new Set();
  const saved=[];
  let timer=null;

  markers.localities ||= [];

  const checked=id=>!!document.getElementById(id)?.checked;

  visible = function(cat){
    const id=cat==='alms'?'almsChk':cat==='huts'?'hutsChk':cat==='food'?'foodChk':cat==='localities'?'localitiesChk':'peaksChk';
    return !!document.getElementById(id)?.checked;
  };

  addPoi = function(cat,type,name,c,seen){
    const key=cat+'|'+name+'|'+c[0].toFixed(5)+'|'+c[1].toFixed(5);
    if(seen.has(key)) return;
    seen.add(key);
    const el=document.createElement('div');
    const markerClass=cat==='alms'?'alm':cat==='huts'?'hut':cat==='food'?'food':cat==='localities'?'locality':'peak';
    el.className='poi-marker poi-'+markerClass;
    if(cat==='localities'){
      el.style.background='#4d78a8';
      el.style.width='11px';
      el.style.height='11px';
      el.style.border='2px solid white';
      el.style.boxShadow='0 1px 4px rgba(0,0,0,.55)';
    }
    const m=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat(c).addTo(map);
    markers[cat].push(m);
    if(!visible(cat)) el.style.display='none';
    el.addEventListener('click',ev=>{
      ev.stopPropagation();
      const pop=new maplibregl.Popup({offset:14}).setLngLat(c).setHTML(popupHtml(name,type)).addTo(map);
      setTimeout(()=>{
        const root=pop.getElement();
        root?.querySelector('.fromBtn')?.addEventListener('click',()=>{customStart=c;customStartName=name;document.getElementById('status').textContent='Start gesetzt: '+name;pop.remove()});
        root?.querySelector('.routeBtn')?.addEventListener('click',()=>routeTo(c,name));
      },0);
    });
  };

  function value(props,key){
    return String(props?.[key] ?? '').trim().toLowerCase();
  }

  function catFor(props={},layer=''){
    const name=props.name||props.name_de||props['name:de']||'';
    if(!name) return null;

    const cls=value(props,'class');
    const sub=value(props,'subclass');
    const place=value(props,'place');
    const tourism=value(props,'tourism');
    const amenity=value(props,'amenity');
    const natural=value(props,'natural');
    const landuse=value(props,'landuse');
    const feature=value(props,'feature');
    const values=new Set([cls,sub,place,tourism,amenity,natural,landuse,feature].filter(Boolean));

    // Nur explizite Typ-/Tagwerte. Namen werden nie zur Kategorisierung verwendet.
    if(layer==='mountain_peak' || values.has('peak')) return ['peaks','Gipfel'];

    const almTypes=new Set(['alm','alpe','alp','alpine_pasture','mountain_pasture']);
    for(const t of almTypes) if(values.has(t)) return ['alms','Alm / Alpe'];

    const hutTypes=new Set(['alpine_hut','wilderness_hut']);
    for(const t of hutTypes) if(values.has(t)) return ['huts',t==='alpine_hut'?'Alpenhütte':'Schutzhütte'];

    const localityTypes=new Set(['locality','hamlet','isolated_dwelling']);
    if(layer==='place'){
      for(const t of localityTypes) if(values.has(t)) return ['localities',t==='locality'?'Lokalität':t==='hamlet'?'Weiler':'Einzellage'];
    }

    if(layer==='poi'){
      const foodTypes=new Set(['restaurant','cafe','fast_food','bar','pub','biergarten','food_court']);
      for(const t of foodTypes){
        if(!values.has(t)) continue;
        const label=t==='cafe'?'Café':t==='pub'?'Pub':t==='biergarten'?'Biergarten':t==='bar'?'Bar':t==='fast_food'?'Imbiss':'Gasthaus / Restaurant';
        return ['food',label];
      }

      const lodgingTypes=new Set(['hotel','motel','hostel','guest_house','guesthouse','inn','bed_and_breakfast','chalet','apartment','apartments','holiday_apartment','camp_site','caravan_site']);
      for(const t of lodgingTypes){
        if(!values.has(t)) continue;
        let label='Unterkunft';
        if(t==='hotel') label='Hotel';
        else if(t==='hostel') label='Hostel';
        else if(t==='motel') label='Motel';
        else if(['guest_house','guesthouse','inn','bed_and_breakfast'].includes(t)) label='Pension / Gasthaus';
        else if(t==='chalet') label='Chalet';
        else if(['apartment','apartments','holiday_apartment'].includes(t)) label='Ferienwohnung';
        else if(['camp_site','caravan_site'].includes(t)) label='Camping';
        return ['food',label];
      }
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
        if(!markers[x.cat]) continue;
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
    if(checked('foodChk')) p.push(`${markers.food.length} Gasthäuser & Unterkünfte`);
    if(checked('localitiesChk')) p.push(`${markers.localities.length} Lokalitäten`);
    if(checked('peaksChk')) p.push(`${markers.peaks.length} Gipfel`);
    document.getElementById('status').textContent=(p.join(' · ')||'Keine Ziele ausgewählt')+' · nach OSM/Kartentyp';
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

    for(const [cat,id] of [['alms','almsChk'],['huts','hutsChk'],['food','foodChk'],['localities','localitiesChk'],['peaks','peaksChk']]){
      const on=checked(id);
      markers[cat].forEach(m=>m.getElement().style.display=on?'block':'none');
    }
    showStatus();
  }

  updatePois=harvest;

  ['almsChk','hutsChk','foodChk','localitiesChk','peaksChk'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>{
    const cat=id==='almsChk'?'alms':id==='hutsChk'?'huts':id==='foodChk'?'food':id==='localitiesChk'?'localities':'peaks';
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