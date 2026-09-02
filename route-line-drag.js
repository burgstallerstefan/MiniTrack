(() => {
  const mapRef = window.map || (typeof map !== 'undefined' ? map : null);
  if (!mapRef || !mapRef.getCanvas || window.__miniTrackRouteLineDrag) return;
  window.__miniTrackRouteLineDrag = true;

  const originalOn = mapRef.on.bind(mapRef);
  let suppressLegacySequence = false;
  let suppressLegacyGlobals = 0;

  // direct-plan.js registriert den alten Segment-Editor erst im map-load-Callback.
  // Diese Registrierung wird gezielt abgefangen, damit nur ein Drag-System aktiv ist.
  mapRef.on = function(type, layerOrListener, listener) {
    if ((type === 'mousedown' || type === 'touchstart') && layerOrListener === 'route-segment-hit') {
      suppressLegacySequence = true;
      suppressLegacyGlobals = 4; // mousemove, touchmove, mouseup, touchend direkt danach
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

  const fc = features => ({type:'FeatureCollection', features});
  const empty = () => fc([]);

  function mapPoint(ev) {
    const r = canvas.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  function lngLatFromEvent(ev) {
    try { return mapRef.unproject(mapPoint(ev)); } catch { return null; }
  }

  function segmentAt(ev, pad = 10) {
    if (!mapRef.getLayer('route-segment-hit')) return null;
    const p = mapPoint(ev);
    let fs = [];
    try {
      fs = mapRef.queryRenderedFeatures(
        [[p[0]-pad,p[1]-pad],[p[0]+pad,p[1]+pad]],
        {layers:['route-segment-hit']}
      ) || [];
    } catch { return null; }
    const f = fs[0];
    const idx = Number(f?.properties?.segmentIndex);
    if (!Number.isInteger(idx) || idx < 0) return null;
    return {feature:f,index:idx};
  }

  function showHover(feature) {
    try {
      mapRef.getSource('route-segment-hover')?.setData(
        feature ? fc([{type:'Feature',properties:{},geometry:feature.geometry}]) : empty()
      );
    } catch {}
  }

  function showDraggedShape(index, ll) {
    const planner = window.MiniTrackPlanner;
    if (!planner || !ll) return;
    // Während des Ziehens reicht die aktuelle Segment-Geometrie als optisches Feedback.
    // Der echte neue Punkt wird ausschließlich über insertBetween() erzeugt.
    const seg = segmentAt({clientX:0,clientY:0},0);
    const all = mapRef.querySourceFeatures?.('route-segments-hit') || [];
    const current = all.find(f => Number(f?.properties?.segmentIndex) === index);
    const coords = current?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return;
    const a = coords[0];
    const b = coords[coords.length - 1];
    showHover({geometry:{type:'LineString',coordinates:[a,[ll.lng,ll.lat],b]}});
  }

  function restoreMapGestures() {
    try { mapRef.dragPan.enable(); } catch {}
    try { mapRef.touchZoomRotate.enable(); } catch {}
    canvas.style.cursor = '';
    canvas.style.touchAction = '';
  }

  function onPointerDown(ev) {
    if (ev.button != null && ev.button !== 0) return;
    if ((typeof tracking !== 'undefined' && tracking) || (typeof planning !== 'undefined' && planning)) return;
    if (!window.MiniTrackPlanner?.insertBetween) return;
    const hit = segmentAt(ev, 12);
    if (!hit) return;

    ev.preventDefault();
    ev.stopPropagation();
    pointerId = ev.pointerId;
    const ll = lngLatFromEvent(ev);
    drag = {segmentIndex:hit.index,lastLngLat:ll,moved:false};
    hoverIndex = hit.index;
    showHover(hit.feature);
    canvas.style.cursor = 'grabbing';
    canvas.style.touchAction = 'none';
    try { mapRef.dragPan.disable(); } catch {}
    try { mapRef.touchZoomRotate.disable(); } catch {}
    try { canvas.setPointerCapture?.(pointerId); } catch {}
  }

  function onPointerMove(ev) {
    if (drag && ev.pointerId === pointerId) {
      ev.preventDefault();
      ev.stopPropagation();
      const ll = lngLatFromEvent(ev);
      if (!ll) return;
      drag.lastLngLat = ll;
      drag.moved = true;
      showDraggedShape(drag.segmentIndex,ll);
      return;
    }

    if (ev.pointerType === 'touch') return;
    const hit = segmentAt(ev,8);
    const idx = hit?.index ?? null;
    if (idx !== hoverIndex) {
      hoverIndex = idx;
      showHover(hit?.feature || null);
      canvas.style.cursor = hit ? 'grab' : '';
    }
  }

  function finishPointer(ev, cancelled = false) {
    if (!drag || ev.pointerId !== pointerId) return;
    ev.preventDefault();
    ev.stopPropagation();
    const d = drag;
    drag = null;
    hoverIndex = null;
    try { canvas.releasePointerCapture?.(pointerId); } catch {}
    pointerId = null;
    showHover(null);
    restoreMapGestures();

    if (cancelled) return;
    const ll = lngLatFromEvent(ev) || d.lastLngLat;
    if (!ll) return;
    window.MiniTrackPlanner?.insertBetween?.(d.segmentIndex,[ll.lng,ll.lat]);
    const status = document.getElementById('status');
    if (status) status.textContent = `Zwischenpunkt ${d.segmentIndex + 2} eingefügt · Route wird neu berechnet.`;
  }

  canvas.addEventListener('pointerdown', onPointerDown, {capture:true,passive:false});
  canvas.addEventListener('pointermove', onPointerMove, {capture:true,passive:false});
  canvas.addEventListener('pointerup', ev => finishPointer(ev,false), {capture:true,passive:false});
  canvas.addEventListener('pointercancel', ev => finishPointer(ev,true), {capture:true,passive:false});
})();
