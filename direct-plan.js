(() => {
  let directPoints = [];
  let directMeta = [];
  let directMarkers = [];
  let failedSegments = new Set();
  let segmentFeatures = [];
  let calcToken = 0;
  let pendingAdd = false;
  let rebuildTimer = null;
  let activeRouteController = null;
  let routeCalculationId = 0;
  let segmentEditorReady = false;
  let segmentDrag = null;
  const routeCache = new Map();
  const ROUTE_CACHE_MS = 5 * 60 * 1000;

  if (!document.querySelector('script[data-elevation-ui]')) {
    const s = document.createElement('script');
    s.src = 'elevation-ui.js?v=20260830-4';
    s.dataset.elevationUi = '1';
    document.body.appendChild(s);
  }

  const routeInfo = $('routeInfo');
  const routeActions = $('routeActions');
  const startBtn = $('startRoute');
  const clearBtn = $('clearRoute');
  if (clearBtn) clearBtn.style.display = 'none';

  const addBtn = document.createElement('button');
  addBtn.id = 'addRoutePoint';
  addBtn.className = 'secondary';
  addBtn.textContent = '＋ Hinzufügen';
  if (routeActions) routeActions.insertBefore(addBtn, startBtn || routeActions.firstChild);

  const shareBtn = document.createElement('button');
  shareBtn.id = 'shareRoute';
  shareBtn.className = 'secondary';
  shareBtn.textContent = '↗';
  shareBtn.title = 'Route teilen';
  shareBtn.setAttribute('aria-label','Route teilen');
  shareBtn.style.cssText = 'display:none;flex:0 0 46px;min-width:46px;font-size:22px;font-weight:800';
  if (routeActions) routeActions.insertBefore(shareBtn, startBtn || routeActions.lastChild);

  const pointList = document.createElement('div');
  pointList.id = 'routePointList';
  pointList.style.cssText = 'display:none;margin:10px 0 8px;border:1px solid #ddd;border-radius:12px;overflow:hidden;background:#fff';
  routeActions?.parentNode?.insertBefore(pointList, routeActions);

  const genericMeta = i => ({name:`Punkt ${i + 1}`,type:'',cat:'map'});
  const metaAt = i => directMeta[i] || genericMeta(i);
  const pointLabel = i => String(i + 1);

  function activityLabel() {
    return window.MiniTrackActivity?.config?.label || 'Route';
  }

  function resetMetric(id, value='—') {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function emptyFc() { return {type:'FeatureCollection',features:[]}; }

  function clearSegmentSources() {
    try { map.getSource('route-fallback')?.setData(emptyFc()); } catch {}
    try { map.getSource('route-segments-hit')?.setData(emptyFc()); } catch {}
    try { map.getSource('route-segment-hover')?.setData(emptyFc()); } catch {}
  }

  function clearCalculatedRoute(hidePanel = false) {
    try { map.getSource('route')?.setData(emptyFc()); } catch {}
    try { map.getSource('route-arrows')?.setData(emptyFc()); } catch {}
    try { map.getSource('alternatives')?.setData(emptyFc()); } catch {}
    clearSegmentSources();
    routeCoords = null;
    routeOptions = [];
    selectedRouteIndex = 0;
    failedSegments = new Set();
    segmentFeatures = [];
    if (startBtn) startBtn.disabled = true;
    resetMetric('routeRemain');
    resetMetric('routeUp');
    resetMetric('routeDown');
    resetMetric('routeDuration');
    resetMetric('routeEffort');
    resetMetric('routeRemainUp');
    if (hidePanel) routeInfo.style.display = 'none';
  }

  function routeCacheKey(a,b) {
    const profile = window.MiniTrackActivity?.profile || 'trekking';
    return profile + ':' + [a,b].map(p => `${(+p[0]).toFixed(5)},${(+p[1]).toFixed(5)}`).join('|');
  }
  function cachedRoute(key) {
    const x = routeCache.get(key);
    if (!x) return null;
    if (Date.now() - x.time > ROUTE_CACHE_MS) { routeCache.delete(key); return null; }
    return x.value;
  }
  function saveRouteCache(key, value) {
    routeCache.set(key, {time:Date.now(),value});
    while (routeCache.size > 40) routeCache.delete(routeCache.keys().next().value);
  }
  function abortRouting() { routeCalculationId++; activeRouteController?.abort(); activeRouteController = null; }

  async function fetchLeg(a,b,signal) {
    const key = routeCacheKey(a,b), cached = cachedRoute(key);
    if (cached) return cached;
    const profile = window.MiniTrackActivity?.profile || 'trekking';
    const lonlats = `${a[0]},${a[1]}|${b[0]},${b[1]}`;
    const url = 'https://brouter.de/brouter?lonlats=' + encodeURIComponent(lonlats) + '&profile=' + encodeURIComponent(profile) + '&alternativeidx=0&format=geojson';
    const r = await fetch(url,{signal,cache:'no-store'});
    if (!r.ok) throw new Error('routing HTTP ' + r.status);
    const d = await r.json();
    const f = d.type === 'FeatureCollection' ? d.features?.[0] : d;
    if (!f?.geometry?.coordinates?.length) throw new Error('empty route');
    const value = routeStats(f);
    saveRouteCache(key,value);
    return value;
  }

  function concatCoords(parts) {
    const out = [];
    for (const c of parts) {
      if (!c?.length) continue;
      out.push(...(out.length ? c.slice(1) : c));
    }
    return out;
  }

  function combinedStats(coords) {
    const a = analyzeCoords(coords);
    let down = 0;
    for (let i=1;i<coords.length;i++) {
      if (coords[i-1]?.length>2 && coords[i]?.length>2) {
        const d = Number(coords[i-1][2]) - Number(coords[i][2]);
        if (Number.isFinite(d) && d>0) down += d;
      }
    }
    return {...a,down,coords};
  }

  function ensureSegmentLayers() {
    if (!map.loaded()) return;
    if (!map.getSource('route-fallback')) map.addSource('route-fallback',{type:'geojson',data:emptyFc()});
    if (!map.getLayer('route-fallback-outline')) map.addLayer({id:'route-fallback-outline',type:'line',source:'route-fallback',paint:{'line-width':9,'line-color':'#fff','line-opacity':.9}});
    if (!map.getLayer('route-fallback-line')) map.addLayer({id:'route-fallback-line',type:'line',source:'route-fallback',paint:{'line-width':5,'line-color':'#858585','line-opacity':.95,'line-dasharray':[1.4,1.1]}});
    if (!map.getSource('route-segments-hit')) map.addSource('route-segments-hit',{type:'geojson',data:emptyFc()});
    if (!map.getLayer('route-segment-hit')) map.addLayer({id:'route-segment-hit',type:'line',source:'route-segments-hit',paint:{'line-width':24,'line-color':'#000','line-opacity':0}});
    if (!map.getSource('route-segment-hover')) map.addSource('route-segment-hover',{type:'geojson',data:emptyFc()});
    if (!map.getLayer('route-segment-hover')) map.addLayer({id:'route-segment-hover',type:'line',source:'route-segment-hover',paint:{'line-width':10,'line-color':'#1769d2','line-opacity':.48}});
    ['route-outline','route-line','route-fallback-outline','route-fallback-line','route-segment-hover','route-segment-hit','route-arrows'].forEach(id=>{try{if(map.getLayer(id))map.moveLayer(id)}catch{}});
    setupSegmentEditor();
  }

  function featureCollection(fs) { return {type:'FeatureCollection',features:fs}; }

  function drawSegmentSources() {
    ensureSegmentLayers();
    const good = segmentFeatures.filter(f=>!f.properties.fallback);
    const bad = segmentFeatures.filter(f=>f.properties.fallback);
    try { map.getSource('route')?.setData(featureCollection(good)); } catch {}
    try { map.getSource('route-fallback')?.setData(featureCollection(bad)); } catch {}
    try { map.getSource('route-segments-hit')?.setData(featureCollection(segmentFeatures)); } catch {}
    try {
      const arrows = good.flatMap(f => arrowFeatures(f.geometry.coordinates).features || []);
      map.getSource('route-arrows')?.setData(featureCollection(arrows));
    } catch {}
  }

  calculateRoutes = async function(points, baseName) {
    if (!Array.isArray(points) || points.length < 2) throw new Error('too few points');
    abortRouting();
    const id = routeCalculationId;
    const controller = new AbortController();
    activeRouteController = controller;
    const signal = controller.signal;
    const timeout = setTimeout(()=>controller.abort(),12000);
    $('status').textContent = `Berechne Route für ${activityLabel()} …`;
    try {
      const legs = await Promise.all(points.slice(0,-1).map(async (a,i) => {
        const b = points[i+1];
        try { return {ok:true,stats:await fetchLeg(a,b,signal),i}; }
        catch (e) {
          if (e?.name === 'AbortError') throw e;
          return {ok:false,i,stats:{coords:[[a[0],a[1]],[b[0],b[1]]]}};
        }
      }));
      if (id !== routeCalculationId || signal.aborted) throw new DOMException('stale','AbortError');

      failedSegments = new Set(legs.filter(x=>!x.ok).map(x=>x.i));
      segmentFeatures = legs.map(x => ({type:'Feature',properties:{segmentIndex:x.i,fallback:x.ok?0:1},geometry:{type:'LineString',coordinates:x.stats.coords}}));
      const coords = concatCoords(legs.map(x=>x.stats.coords));
      const main = {...combinedStats(coords),brouterIndex:0,fingerprint:routeFingerprint(coords),failedCount:failedSegments.size};
      routeOptions = [main]; routeBaseName = baseName; selectedRouteIndex = 0; routeCoords = coords; routeName = baseName;
      try { map.getSource('alternatives')?.setData(emptyFc()); } catch {}
      showRoute(false);
      drawSegmentSources();
      updateRouteInfo(main);
      routeInfo.style.display = 'block';
      if (startBtn) startBtn.disabled = false;
      renderDirectMarkers(); renderPointList();
      if (failedSegments.size) $('status').textContent = `${activityLabel()}: ${failedSegments.size} Abschnitt${failedSegments.size===1?'':'e'} nicht routbar · gestrichelt = direkte Verbindung.`;
      return main;
    } finally {
      clearTimeout(timeout);
      if (id === routeCalculationId) activeRouteController = null;
    }
  };

  function cancelScheduledRoute() { if (rebuildTimer) clearTimeout(rebuildTimer); rebuildTimer = null; }
  function scheduleRebuild(delay=160,label=null) {
    cancelScheduledRoute();
    if (directPoints.length < 2) return;
    rebuildTimer = setTimeout(()=>{rebuildTimer=null;rebuildDirectRoute(label)},delay);
  }
  function clearDirectMarkers() { directMarkers.forEach(m=>m.remove()); directMarkers=[]; }
  function pointFailed(i) { return failedSegments.has(i-1) || failedSegments.has(i); }

  function removePoint(i) {
    if (i<0 || i>=directPoints.length) return;
    directPoints.splice(i,1); directMeta.splice(i,1); pendingAdd=false; calcToken++;
    failedSegments = new Set();
    abortRouting(); cancelScheduledRoute(); renderDirectMarkers(); renderPointList();
    if (directPoints.length>=2) {
      clearCalculatedRoute(false); routeInfo.style.display='block'; scheduleRebuild(80);
    } else {
      clearCalculatedRoute(true); $('routeTitle').textContent='Route planen';
      $('status').textContent=directPoints.length?'Route entfernt · nur noch ein Punkt vorhanden.':'Route entfernt.';
    }
  }

  function beginHandleDrag(ev,fromIndex) {
    ev.preventDefault(); ev.stopPropagation();
    const pointerId=ev.pointerId; let targetIndex=fromIndex;
    const rows=()=>[...pointList.querySelectorAll('.route-order-row')];
    const clearTargets=()=>rows().forEach(r=>r.style.background='#fff');
    const move=e=>{if(e.pointerId!==pointerId)return;const el=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('.route-order-row');if(!el||!pointList.contains(el))return;const idx=Number(el.dataset.index);if(!Number.isInteger(idx))return;targetIndex=idx;clearTargets();el.style.background='#eaf2ff'};
    const up=e=>{if(e.pointerId!==pointerId)return;document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',up,true);clearTargets();if(targetIndex!==fromIndex){const[p]=directPoints.splice(fromIndex,1);const[m]=directMeta.splice(fromIndex,1);directPoints.splice(targetIndex,0,p);directMeta.splice(targetIndex,0,m);calcToken++;abortRouting();clearCalculatedRoute(false);renderDirectMarkers();renderPointList();scheduleRebuild(80)}};
    document.addEventListener('pointermove',move,true); document.addEventListener('pointerup',up,true); document.addEventListener('pointercancel',up,true);
  }

  function focusPoint(i) {
    const c=directPoints[i]; if(!c)return;
    map.easeTo({center:c,zoom:Math.max(map.getZoom(),16.5),pitch:0,duration:420});
    directMarkers[i]?.getElement()?.animate?.([{transform:'scale(1)'},{transform:'scale(1.35)'},{transform:'scale(1)'}],{duration:650});
    const m=metaAt(i); $('status').textContent=m.type?`${m.name} · ${m.type}`:m.name;
  }

  function renderPointList() {
    pointList.innerHTML=''; pointList.style.display=directPoints.length?'block':'none';
    shareBtn.style.display=directPoints.length>=2?'':'none';
    directPoints.forEach((_,i)=>{
      const row=document.createElement('div'); row.className='route-order-row'; row.dataset.index=String(i);
      row.style.cssText='display:grid;grid-template-columns:44px 34px 1fr 38px;align-items:center;min-height:54px;border-bottom:1px solid #eee;touch-action:pan-y;cursor:pointer';
      const handle=document.createElement('button'); handle.type='button'; handle.textContent='☰'; handle.title='Punkt verschieben';
      handle.style.cssText='height:50px;border:0;background:transparent;font-size:24px;color:#666;touch-action:none;padding:0';
      handle.addEventListener('pointerdown',e=>beginHandleDrag(e,i)); handle.addEventListener('click',e=>e.stopPropagation());
      const badge=document.createElement('div'); badge.textContent=pointLabel(i);
      const fail=pointFailed(i);
      badge.style.cssText=`width:26px;height:26px;border-radius:50%;border:${fail?'2px dashed #888':'2px solid #1769d2'};color:${fail?'#777':'#111'};background:${fail?'#eee':'#fff'};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11px`;
      const info=document.createElement('div'); info.style.cssText='padding-left:6px;min-width:0';
      const m=metaAt(i); const name=document.createElement('div'); name.textContent=m.name||genericMeta(i).name;
      name.style.cssText='font-weight:750;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'; info.appendChild(name);
      if(m.type){const type=document.createElement('div');type.textContent=m.type;type.style.cssText='font-size:11px;color:#666;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';info.appendChild(type)}
      const del=document.createElement('button');del.type='button';del.textContent='×';del.title='Punkt entfernen';del.style.cssText='border:0;background:transparent;font-size:24px;color:#777;height:50px';del.addEventListener('click',e=>{e.stopPropagation();removePoint(i)});
      row.addEventListener('click',e=>{if(!e.target.closest('button'))focusPoint(i)}); row.append(handle,badge,info,del); pointList.appendChild(row);
    });
  }

  function addDirectMarker(c,i) {
    const el=document.createElement('div'); const fail=pointFailed(i);
    el.style.cssText=`width:30px;height:30px;border-radius:50%;background:${fail?'#ededed':'white'};border:${fail?'3px dashed #888':'3px solid #1769d2'};color:${fail?'#777':'#111'};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;box-shadow:0 2px 8px #555;touch-action:none`;
    el.textContent=pointLabel(i); el.dataset.routePointIndex=String(i);
    const marker=new maplibregl.Marker({element:el,draggable:false}).setLngLat(c).addTo(map); directMarkers.push(marker);
  }
  function renderDirectMarkers(){clearDirectMarkers();directPoints.forEach((c,i)=>addDirectMarker(c,i))}

  async function rebuildDirectRoute(label=null) {
    if(directPoints.length<2)return;
    const token=++calcToken,snapshot=directPoints.map(p=>[p[0],p[1]]),modeLabel=label||activityLabel();
    try {
      const o=await calculateRoutes(snapshot,`Geplante ${modeLabel}-Route`); if(!o||token!==calcToken)return;
      $('routeTitle').textContent=`${directPoints.length} Punkte · ${o.dist.toFixed(1)} km`;
      if(!o.failedCount)$('status').textContent=`${modeLabel}: ${o.dist.toFixed(1)} km · Linie ziehen = Zwischenpunkt.`;
    } catch(e) {
      if(e?.name==='AbortError')return;
      if(token===calcToken){clearCalculatedRoute(false);routeInfo.style.display='block';renderPointList();$('routeTitle').textContent=`${directPoints.length} Punkte · ${modeLabel}`;$('status').textContent=`Route für ${modeLabel} nicht möglich.`}
    }
  }

  function ensureGpsStart(done) {
    const ready=()=>{if(!gps)return;if(!directPoints.length){directPoints=[[gps[0],gps[1]]];directMeta=[{name:'Aktueller Standort',type:'',cat:'gps'}];renderDirectMarkers();renderPointList();routeInfo.style.display='block';$('routeTitle').textContent='1 Punkt';if(startBtn)startBtn.disabled=true}done?.()};
    if(gps)ready();else requestLocation(ready);
  }
  function setGpsAsStartAndWaitForPoint(){ensureGpsStart(()=>{pendingAdd=true;$('status').textContent='Neuen Punkt auf der Karte antippen.'})}
  function addPoiPoint(c,meta={}){if(!Array.isArray(c))return;ensureGpsStart(()=>{const m={name:meta.name||`Punkt ${directPoints.length+1}`,type:meta.type||'',cat:meta.cat||'poi'};directPoints.push([c[0],c[1]]);directMeta.push(m);pendingAdd=false;failedSegments=new Set();renderDirectMarkers();renderPointList();abortRouting();clearCalculatedRoute(false);routeInfo.style.display='block';scheduleRebuild(60)})}
  function setPoiStart(c,meta={}){if(!Array.isArray(c)||directPoints.length)return;directPoints=[[c[0],c[1]]];directMeta=[{name:meta.name||'Punkt 1',type:meta.type||'',cat:meta.cat||'poi'}];renderDirectMarkers();renderPointList();routeInfo.style.display='block';if(startBtn)startBtn.disabled=true;$('status').textContent=`${directMeta[0].name} als Punkt 1 gesetzt.`}

  function insertPointBetween(segmentIndex,c) {
    if(!Array.isArray(c)||segmentIndex<0||segmentIndex>=directPoints.length-1)return false;
    const insertAt=segmentIndex+1;
    directPoints.splice(insertAt,0,[+c[0],+c[1]]);
    directMeta.splice(insertAt,0,{name:`Punkt ${insertAt+1}`,type:'Kartenpunkt',cat:'map'});
    failedSegments=new Set(); calcToken++; abortRouting(); cancelScheduledRoute(); clearCalculatedRoute(false); renderDirectMarkers(); renderPointList(); routeInfo.style.display='block'; scheduleRebuild(60); return true;
  }

  function hoverFeature(f) {
    try { map.getSource('route-segment-hover')?.setData(f?featureCollection([{type:'Feature',properties:{},geometry:f.geometry}]):emptyFc()); } catch {}
  }

  function setupSegmentEditor() {
    if(segmentEditorReady||!map.getLayer('route-segment-hit'))return;
    segmentEditorReady=true;
    const canvas=map.getCanvas();
    map.on('mouseenter','route-segment-hit',e=>{canvas.style.cursor='grab';hoverFeature(e.features?.[0])});
    map.on('mousemove','route-segment-hit',e=>{if(!segmentDrag)hoverFeature(e.features?.[0])});
    map.on('mouseleave','route-segment-hit',()=>{if(!segmentDrag){canvas.style.cursor='';hoverFeature(null)}});

    const start=e=>{
      if(tracking||planning||segmentDrag)return;
      const f=e.features?.[0]; const idx=Number(f?.properties?.segmentIndex);
      if(!Number.isInteger(idx)||idx<0||idx>=directPoints.length-1)return;
      try{e.preventDefault?.();e.originalEvent?.preventDefault?.()}catch{}
      segmentDrag={segmentIndex:idx,lngLat:e.lngLat};
      canvas.style.cursor='grabbing'; hoverFeature(f);
      try{map.dragPan.disable()}catch{}; try{map.touchZoomRotate.disable()}catch{};
    };
    map.on('mousedown','route-segment-hit',start);
    map.on('touchstart','route-segment-hit',start);

    const move=e=>{
      if(!segmentDrag||!e.lngLat)return;
      segmentDrag.lngLat=e.lngLat;
      const i=segmentDrag.segmentIndex,a=directPoints[i],b=directPoints[i+1],p=[e.lngLat.lng,e.lngLat.lat];
      hoverFeature({geometry:{type:'LineString',coordinates:[a,p,b]}});
      try{e.preventDefault?.();e.originalEvent?.preventDefault?.()}catch{}
    };
    map.on('mousemove',move); map.on('touchmove',move);

    const end=e=>{
      if(!segmentDrag)return;
      const d=segmentDrag; segmentDrag=null;
      const ll=e?.lngLat||d.lngLat; canvas.style.cursor=''; hoverFeature(null);
      try{map.dragPan.enable()}catch{}; try{map.touchZoomRotate.enable()}catch{};
      if(ll)insertPointBetween(d.segmentIndex,[ll.lng,ll.lat]);
    };
    map.on('mouseup',end); map.on('touchend',end);
  }

  function base64UrlEncode(value){const bytes=new TextEncoder().encode(JSON.stringify(value));let binary='';bytes.forEach(b=>binary+=String.fromCharCode(b));return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
  function base64UrlDecode(value){let s=value.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const binary=atob(s),bytes=Uint8Array.from(binary,ch=>ch.charCodeAt(0));return JSON.parse(new TextDecoder().decode(bytes))}
  function sharePayload(){return{v:1,m:window.MiniTrackActivity?.key||'wandern',p:directPoints.map((c,i)=>{const meta=metaAt(i);return[Number((+c[0]).toFixed(6)),Number((+c[1]).toFixed(6)),meta.name||'',meta.type||'',meta.cat||'map']})}}
  function shareUrl(){const u=new URL(location.href);u.hash='route='+base64UrlEncode(sharePayload());return u.toString()}
  function readSharedRoute(){const match=location.hash.match(/^#route=([^&]+)/);if(!match)return null;try{const data=base64UrlDecode(match[1]);if(data?.v!==1||!Array.isArray(data.p)||data.p.length<2||data.p.length>30)return null;const points=[],meta=[];for(const x of data.p){if(!Array.isArray(x)||!Number.isFinite(+x[0])||!Number.isFinite(+x[1]))return null;points.push([+x[0],+x[1]]);meta.push({name:String(x[2]||''),type:String(x[3]||''),cat:String(x[4]||'shared')})}return{mode:String(data.m||'wandern'),points,meta}}catch{return null}}
  async function copyShareLink(url){try{await navigator.clipboard.writeText(url);$('status').textContent='MiniTrack-Link kopiert.';return}catch{}const ta=document.createElement('textarea');ta.value=url;ta.style.cssText='position:fixed;left:-9999px;top:-9999px';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');$('status').textContent='MiniTrack-Link kopiert.'}catch{$('status').textContent='Teilen auf diesem Gerät nicht möglich.'}ta.remove()}
  async function shareRoute(){if(directPoints.length<2)return;const url=shareUrl(),title=`MiniTrack · ${activityLabel()}`,text=`${activityLabel()}-Route mit ${directPoints.length} Punkten`;if(navigator.share){try{await navigator.share({title,text,url});return}catch(e){if(e?.name==='AbortError')return}}await copyShareLink(url)}
  function loadSharedRoute(shared){if(!shared)return false;const modeInput=document.querySelector(`input[name="routeMode"][value="${CSS.escape(shared.mode)}"]`);if(modeInput){modeInput.checked=true;modeInput.dispatchEvent(new Event('change',{bubbles:true}))}directPoints=shared.points.map(p=>[p[0],p[1]]);directMeta=shared.meta.map((m,i)=>({...genericMeta(i),...m,cat:m.cat||'shared'}));pendingAdd=false;renderDirectMarkers();renderPointList();routeInfo.style.display='block';$('routeTitle').textContent=`${directPoints.length} Punkte`;$('status').textContent='Geteilte MiniTrack-Route wird berechnet …';try{const bounds=new maplibregl.LngLatBounds();directPoints.forEach(p=>bounds.extend(p));map.fitBounds(bounds,{padding:{top:120,bottom:210,left:35,right:35},duration:500})}catch{}scheduleRebuild(120);return true}

  window.MiniTrackPlanner={hasStart:()=>directPoints.length>0,pointCount:()=>directPoints.length,addPoi:addPoiPoint,setStartPoi:setPoiStart,focusPoint,share:shareRoute,getShareUrl:()=>directPoints.length>=2?shareUrl():null,insertBetween:insertPointBetween,recalculate:label=>{if(directPoints.length<2)return false;calcToken++;abortRouting();cancelScheduledRoute();clearCalculatedRoute(false);routeInfo.style.display='block';renderPointList();scheduleRebuild(40,label||activityLabel());return true}};

  document.addEventListener('minitrack:activitychange',e=>{if(directPoints.length<2)return;window.MiniTrackPlanner.recalculate(e.detail?.label||activityLabel())});
  addBtn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();setGpsAsStartAndWaitForPoint()});
  shareBtn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();shareRoute()});
  map.on('click',e=>{if(tracking||planning||!pendingAdd)return;const target=e.originalEvent?.target;if(target?.closest?.('.maplibregl-marker,.maplibregl-popup,button,input,label'))return;pendingAdd=false;const c=[e.lngLat.lng,e.lngLat.lat],m={name:`Punkt ${directPoints.length+1}`,type:'Kartenpunkt',cat:'map'};directPoints.push(c);directMeta.push(m);renderDirectMarkers();renderPointList();abortRouting();clearCalculatedRoute(false);routeInfo.style.display='block';scheduleRebuild(60)});
  clearBtn?.addEventListener('click',()=>{directPoints=[];directMeta=[];pendingAdd=false;calcToken++;abortRouting();cancelScheduledRoute();clearDirectMarkers();renderPointList();clearCalculatedRoute(true)});
  startBtn?.addEventListener('click',()=>{if(!routeCoords?.length)return;calcToken++;abortRouting();cancelScheduledRoute();pendingAdd=false;clearDirectMarkers();pointList.style.display='none';const pos=gps||routeCoords[0],b=routeCoords.length>1?bearing(routeCoords[0],routeCoords[Math.min(8,routeCoords.length-1)]):0,use3D=window.miniTrackTerrain3D===true;map.easeTo({center:pos,zoom:Math.max(map.getZoom(),16),pitch:use3D?55:0,bearing:b,duration:450});$('directionCard').style.display='block';$('directionText').textContent='Route folgen'});

  if(startBtn)startBtn.disabled=true;
  if($('saveTrack'))$('saveTrack').textContent='⬇ GPX';
  const sharedRoute=readSharedRoute();
  map.on('load',()=>{ensureSegmentLayers();if(sharedRoute&&loadSharedRoute(sharedRoute))return;if(!gps&&!tracking)requestLocation();if(!tracking)$('status').textContent='Standort wird geladen …'});
})();