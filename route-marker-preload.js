(() => {
  const OriginalMarker = window.maplibregl?.Marker;
  if (!OriginalMarker || OriginalMarker.__miniTrackNoDrag) return;

  let routeSeq = 0;
  let resetTimer = null;

  class MiniTrackMarker extends OriginalMarker {
    constructor(options, ...rest) {
      const isRoutePoint = !!(options && typeof options === 'object' && options.draggable === true);
      let nextOptions = options;

      if (isRoutePoint) {
        routeSeq += 1;
        if (resetTimer) clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          routeSeq = 0;
          resetTimer = null;
        }, 0);

        const el = options.element;
        if (el) {
          el.textContent = String(routeSeq);
          el.dataset.routePointIndex = String(routeSeq - 1);
        }
        nextOptions = {...options, draggable:false};
      }

      super(nextOptions, ...rest);
    }
  }

  MiniTrackMarker.__miniTrackNoDrag = true;
  window.maplibregl.Marker = MiniTrackMarker;
})();
