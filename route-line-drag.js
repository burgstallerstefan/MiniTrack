(() => {
  const mapRef = window.map || (typeof map !== 'undefined' ? map : null);
  if (!mapRef || !mapRef.getCanvas || window.__miniTrackRouteLineDrag) return;
  window.__miniTrackRouteLineDrag = true;

  const originalOn = mapRef.on.bind(mapRef);
  let suppressLegacySequence = false;
  let suppressLegacyGlobals = 0;

  // direct-plan.js besitzt noch den alten Layer-Drag. Dessen Start/Move/End-
  // Registrierung wird abgefangen, damit nur dieses Eingabesystem aktiv ist.
  mapRef.on = function(type, layerOrListener, listener) {
    if ((type === 'mousedown' || type === 'touchstart') && layerOrListener === 'route-segment-hit') {
      suppressLegacySequence = true;
      suppressLegacyGlobals = 4;
      return mapRef;
    }
    if (suppressLegacySequence && suppressLegacyGlobals > 0 && typeof layerOrListener === 'function' &&
        ['mousemove','touchmove','mouseup','touchend'].includes(type)) {
      suppressLegacyGlobals--;
      if (!suppressLegacyGlobals) suppressLegacySequence = false;
      return mapRef;
    }
    return originalOn(type, layerOrListener, listener);
  };

  const canvas = mapRef.getCanvas();
  let drag = null;
  let hoverIndex = null;
  let pointerId = null;

  const fc = features => ({type:'FeatureCollection',features});
  const empty = () => fc([]);

  function mapPoint(ev) {
    const r = canvas.getBoundingClientRect();
    return {x:ev.clientX-r.left,y:ev.clientY-r.top};
  }

  function lngLatFromEvent(ev) {
    try {
      const p=mapPoint(ev);
      return mapRef.unproject([p.x,p.y]);
    } catch { return null; }
  }

  function sourceSegments() {
    try {
      const fs = mapRef.querySourceFeatures?.('route-segments-hit') || [];
      const byIndex = new Map();
      for (const f of fs) {
        const idx=Number(f?.properties?.segmentIndex);
        const coords=f?.geometry?.coordinates;
        if (!Number.isInteger(idx) || !Array.isArray(coords) || coords.length<2) continue;
        if (!byIndex.has(idx)) byIndex.set(idx,f);
      }
      return [...byIndex.values()];
    } catch { return []; }
  }

  function distToScreenSegment(p,a,b) {
    const vx=b.x-a.x, vy=b.y-a.y;
    const wx=p.x-a.x, wy=p.y-a.y;
    const vv=vx*vx+vy*vy;
    let t=vv>0?(wx*vx+wy*vy)/vv:0;
    t=Math.max(0,Math.min(1,t));
    const x=a.x+t*vx, y=a.y+t*vy;
    return Math.hypot(p.x-x,p.y-y);
  }

  // Keine transparente MapLibre-Hit-Linie mehr voraussetzen. Wir vergleichen den
  // Finger/Mauszeiger direkt mit der tatsächlichen Segmentgeometrie in Pixeln.
  function segmentAt(ev, maxPx) {
    const p=mapPoint(ev);
    let best=null;
    for (const f of sourceSegments()) {
      const coords=f.geometry.coordinates;
      let d=Infinity;
      for (let i=1;i<coords.length;i++) {
        try {
          const a=mapRef.project(coords[i-1]);
          const b=mapRef.project(coords[i]);
          d=Math.min(d,distToScreenSegment(p,a,b));
        } catch {}
        if (d<=maxPx) break;
      }
      if (d<=maxPx && (!best || d<best.distance)) {
        best={feature:f,index:Number(f.properties.segmentIndex),distance:d};
      }
    }
    return best;
  }

  function showHover(feature) {
    try {
      mapRef.getSource('route-segment-hover')?.setData(
        feature ? fc([{type:'Feature',properties:{},geometry:feature.geometry}]) : empty()
      );
    } catch {}
  }

  function featureForIndex(index) {
    return sourceSegments().find(f=>Number(f?.properties?.segmentIndex)===index) || null;
  }

  function showDraggedShape(index,ll) {
    const current=featureForIndex(index);
    const coords=current?.geometry?.coordinates;
    if (!Array.isArray(coords)||coords.length<2||!ll) return;
    const a=coords[0], b=coords[coords.length-1];
    showHover({geometry:{type:'LineString',coordinates:[a,[ll.lng,ll.lat],b]}});
  }

  function restoreMapGestures() {
    try { mapRef.dragPan.enable(); } catch {}
    try { mapRef.touchZoomRotate.enable(); } catch {}
    canvas.style.cursor='';
  }

  function onPointerDown(ev) {
    if (ev.button!=null && ev.button!==0) return;
    if ((typeof tracking!=='undefined'&&tracking)||(typeof planning!=='undefined'&&planning)) return;
    if (!window.MiniTrackPlanner?.insertBetween) return;

    const maxPx=ev.pointerType==='touch'?24:14;
    const hit=segmentAt(ev,maxPx);
    if (!hit) return;

    ev.preventDefault();
    ev.stopPropagation();
    pointerId=ev.pointerId;
    const ll=lngLatFromEvent(ev);
    drag={segmentIndex:hit.index,lastLngLat:ll,startX:ev.clientX,startY:ev.clientY};
    hoverIndex=hit.index;
    showHover(hit.feature);
    canvas.style.cursor='grabbing';
    try { mapRef.dragPan.disable(); } catch {}
    try { mapRef.touchZoomRotate.disable(); } catch {}
    try { canvas.setPointerCapture?.(pointerId); } catch {}

    const status=document.getElementById('status');
    if(status) status.textContent=`Abschnitt ${hit.index+1}–${hit.index+2} ziehen …`;
  }

  function onPointerMove(ev) {
    if (drag && ev.pointerId===pointerId) {
      ev.preventDefault();
      ev.stopPropagation();
      const ll=lngLatFromEvent(ev);
      if(!ll)return;
      drag.lastLngLat=ll;
      showDraggedShape(drag.segmentIndex,ll);
      return;
    }
    if(ev.pointerType==='touch')return;
    const hit=segmentAt(ev,12);
    const idx=hit?.index??null;
    if(idx!==hoverIndex){
      hoverIndex=idx;
      showHover(hit?.feature||null);
      canvas.style.cursor=hit?'grab':'';
    }
  }

  function finishPointer(ev,cancelled=false) {
    if(!drag||ev.pointerId!==pointerId)return;
    ev.preventDefault();
    ev.stopPropagation();
    const d=drag;
    drag=null;
    hoverIndex=null;
    try { canvas.releasePointerCapture?.(pointerId); } catch {}
    pointerId=null;
    showHover(null);
    restoreMapGestures();
    if(cancelled)return;

    const movedPx=Math.hypot(ev.clientX-d.startX,ev.clientY-d.startY);
    if(movedPx<6){
      const status=document.getElementById('status');
      if(status) status.textContent='Linie etwas weiter ziehen und dann loslassen.';
      return;
    }

    const ll=lngLatFromEvent(ev)||d.lastLngLat;
    if(!ll)return;
    const ok=window.MiniTrackPlanner?.insertBetween?.(d.segmentIndex,[ll.lng,ll.lat]);
    const status=document.getElementById('status');
    if(status) status.textContent=ok
      ? `Neuer Punkt ${d.segmentIndex+2} eingefügt · Teilstrecken werden neu berechnet.`
      : 'Zwischenpunkt konnte nicht eingefügt werden.';
  }

  canvas.addEventListener('pointerdown',onPointerDown,{capture:true,passive:false});
  canvas.addEventListener('pointermove',onPointerMove,{capture:true,passive:false});
  canvas.addEventListener('pointerup',ev=>finishPointer(ev,false),{capture:true,passive:false});
  canvas.addEventListener('pointercancel',ev=>finishPointer(ev,true),{capture:true,passive:false});
})();
