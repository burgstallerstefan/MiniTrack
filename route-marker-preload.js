(() => {
  const OriginalMarker = window.maplibregl?.Marker;
  if (!OriginalMarker || OriginalMarker.__miniTrackNoDrag) return;

  let routeSeq = 0;
  let resetTimer = null;

  function isDirectRoutePoint(options) {
    if (!options || typeof options !== 'object' || options.draggable !== true) return false;
    const el = options.element;
    if (!el) return false;
    const label = el.textContent?.trim() || '';
    return el.style.width === '30px' &&
      el.style.height === '30px' &&
      el.style.borderTopWidth === '3px' &&
      (label === 'S' || label === 'Z' || /^\d+$/.test(label));
  }

  class MiniTrackMarker extends OriginalMarker {
    constructor(options, ...rest) {
      let nextOptions = options;

      if (isDirectRoutePoint(options)) {
        routeSeq += 1;
        if (resetTimer) clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          routeSeq = 0;
          resetTimer = null;
        }, 0);

        const el = options.element;
        el.textContent = String(routeSeq);
        el.dataset.routePointIndex = String(routeSeq - 1);
        nextOptions = {...options, draggable:false};
      }

      super(nextOptions, ...rest);
    }
  }

  MiniTrackMarker.__miniTrackNoDrag = true;
  window.maplibregl.Marker = MiniTrackMarker;
})();
