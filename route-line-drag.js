(() => {
  const mapRef = window.map || (typeof map !== 'undefined' ? map : null);
  if (!mapRef || !mapRef.getCanvas || window.__outaboutRoutePointEdit || window.__miniTrackRoutePointEdit) return;
  window.__outaboutRoutePointEdit = true;
  window.__miniTrackRoutePointEdit = true; // Legacy-Kompatibilität

  const canvas = mapRef.getCanvas();
  const container = mapRef.getContainer();
  let editMarker = null;
  let editIndex = null;
  let hiddenOriginal = null;
  let ignoreClickUntil = 0;
  const plannerApi = () => window.OutaboutPlanner || window.MiniTrackPlanner;

  function status(text) {
    const el = document.getElementById('status');
    if (el) el.textContent = text;
  }

  function mapPoint(ev) {
    const r = canvas.getBoundingClientRect();
    return {x:ev.clientX-r.left,y:ev.clientY-r.top};
  }

  function lngLatFromEvent(ev) {
    try {
      const p = mapPoint(ev);
      return mapRef.unproject([p.x,p.y]);
    } catch { return null; }
  }

  function sourceSegments() {
    const byIndex = new Map();
    const add = f => {
      const idx = Number(f?.properties?.segmentIndex);
      const coords = f?.geometry?.coordinates;
      if (!Number.isInteger(idx) || !Array.isArray(coords) || coords.length < 2) return;
      if (!byIndex.has(idx)) byIndex.set(idx,f);
    };

    try {
      const src = mapRef.getSource('route-segments-hit');
      const raw = src?._data || src?._options?.data;
      if (raw?.type === 'FeatureCollection') raw.features?.forEach(add);
      else if (raw?.type === 'Feature') add(raw);
    } catch {}

    try { (mapRef.querySourceFeatures?.('route-segments-hit') || []).forEach(add); } catch {}

    if (!byIndex.size) {
      try {
        const rendered = mapRef.queryRenderedFeatures?.({layers:['route-segment-hit']}) || [];
        rendered.forEach(add);
      } catch {}
    }
    return [...byIndex.values()];
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

  function segmentAt(ev,maxPx=24) {
    const p = mapPoint(ev);
    let best = null;
    for (const f of sourceSegments()) {
      const coords = f.geometry.coordinates;
      let distance = Infinity;
      for (let i=1;i<coords.length;i++) {
        try {
          const a=mapRef.project(coords[i-1]);
          const b=mapRef.project(coords[i]);
          distance=Math.min(distance,distToScreenSegment(p,a,b));
        } catch {}
      }
      if (distance <= maxPx && (!best || distance < best.distance)) {
        best={index:Number(f.properties.segmentIndex),distance};
      }
    }
    return best;
  }

  function originalPointElement(index) {
    return container.querySelector(`[data-route-point-index="${index}"]`);
  }

  function hideOriginalPoint(index) {
    const el = originalPointElement(index);
    if (!el) return;
    if (hiddenOriginal && hiddenOriginal !== el) hiddenOriginal.style.visibility='';
    hiddenOriginal = el;
    el.style.visibility='hidden';
  }

  function restoreOriginalPoint() {
    if (hiddenOriginal) hiddenOriginal.style.visibility='';
    hiddenOriginal = null;
  }

  function lockEdit(showStatus=false) {
    if (!editMarker) return;
    editMarker.remove();
    editMarker = null;
    editIndex = null;
    restoreOriginalPoint();
    if (showStatus) status('Punkt fixiert. Doppelklick auf Linie oder Punkt zum Bearbeiten.');
  }

  function activateEdit(index,coord) {
    const planner = plannerApi();
    if (!planner?.movePoint || !Array.isArray(coord)) return false;
    lockEdit(false);

    editIndex = index;
    const el = document.createElement('div');
    el.className = 'route-edit-marker';
    el.dataset.routeEditMarker = '1';
    el.style.cssText = 'width:36px;height:36px;border-radius:50%;background:#e32626;border:3px solid #8b0000;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;box-shadow:0 2px 10px rgba(0,0,0,.45);cursor:grab;touch-action:none;z-index:20';
    el.textContent = String(index + 1);

    hideOriginalPoint(index);
    editMarker = new maplibregl.Marker({element:el,draggable:true})
      .setLngLat(coord)
      .addTo(mapRef);

    editMarker.on('dragstart',()=>{
      el.style.cursor='grabbing';
      status(`Punkt ${index+1} verschieben …`);
    });
    editMarker.on('dragend',()=>{
      el.style.cursor='grab';
      const ll=editMarker?.getLngLat();
      if (!ll || editIndex == null) return;
      const currentIndex = editIndex;
      const ok=plannerApi()?.movePoint?.(currentIndex,[ll.lng,ll.lat]);
      ignoreClickUntil = performance.now() + 450;
      requestAnimationFrame(()=>hideOriginalPoint(currentIndex));
      if (ok) status(`Punkt ${currentIndex+1} verschoben · Route wird neu berechnet. Rot = weiter verschiebbar.`);
    });

    status(`Punkt ${index+1} ist rot und verschiebbar. Klick woanders = fixieren.`);
    return true;
  }

  function routePointIndexFromTarget(target) {
    const el = target?.closest?.('[data-route-point-index]');
    if (!el) return null;
    const idx = Number(el.dataset.routePointIndex);
    return Number.isInteger(idx) && idx >= 0 ? idx : null;
  }

  function onDoubleClick(ev) {
    if ((typeof tracking !== 'undefined' && tracking) || (typeof planning !== 'undefined' && planning)) return;
    const planner=plannerApi();
    if (!planner?.insertBetween || !planner?.movePoint || !planner?.getPoint) return;

    if (ev.target?.closest?.('.route-edit-marker')) {
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
      return;
    }

    const pointIndex = routePointIndexFromTarget(ev.target);
    if (pointIndex != null) {
      const coord=planner.getPoint(pointIndex);
      if (!coord) return;
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
      activateEdit(pointIndex,coord);
      return;
    }

    const hit=segmentAt(ev,24);
    if (!hit) return;
    const ll=lngLatFromEvent(ev);
    if (!ll) return;

    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
    const newIndex=hit.index+1;
    const ok=planner.insertBetween(hit.index,[ll.lng,ll.lat]);
    if (ok) {
      requestAnimationFrame(()=>activateEdit(newIndex,[ll.lng,ll.lat]));
      status(`Neuer Punkt ${newIndex+1} erstellt. Rot = verschiebbar; Klick woanders = fixieren.`);
    }
  }

  function onClick(ev) {
    if (!editMarker) return;
    if (performance.now() < ignoreClickUntil) return;
    if (ev.target?.closest?.('.route-edit-marker')) return;
    lockEdit(true);
  }

  const observer = new MutationObserver(()=>{
    if (editIndex != null && editMarker) requestAnimationFrame(()=>hideOriginalPoint(editIndex));
  });
  observer.observe(container,{childList:true,subtree:true});

  container.addEventListener('dblclick',onDoubleClick,{capture:true,passive:false});
  container.addEventListener('click',onClick,{capture:true,passive:true});
})();