(() => {
  const OriginalMarker = window.maplibregl?.Marker;
  if (!OriginalMarker || OriginalMarker.__miniTrackNoDrag) return;

  let routeSeq = 0;

  class MiniTrackMarker extends OriginalMarker {
    constructor(options, ...rest) {
      const el = options && typeof options === 'object' ? options.element : null;
      const isRoutePoint = !!(
        options && typeof options === 'object' &&
        options.draggable === true &&
        el && el.style?.width === '30px' && el.style?.height === '30px'
      );

      let nextOptions = options;
      if (isRoutePoint) {
        // renderDirectMarkers() entfernt zuerst alle alten Routenmarker.
        // Wenn keiner mehr im DOM ist, beginnt ein neuer Renderlauf immer bei 1.
        const existing = document.querySelectorAll('.maplibregl-marker[data-minitrack-route-point="1"]').length;
        if (existing === 0) routeSeq = 0;
        routeSeq += 1;

        el.textContent = String(routeSeq);
        el.dataset.routePointIndex = String(routeSeq - 1);
        el.dataset.minitrackRoutePoint = '1';
        nextOptions = {...options, draggable:false};
      }

      super(nextOptions, ...rest);
    }
  }

  MiniTrackMarker.__miniTrackNoDrag = true;
  window.maplibregl.Marker = MiniTrackMarker;
})();
