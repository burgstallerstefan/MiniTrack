(() => {
  const OriginalMarker = window.maplibregl?.Marker;
  if (!OriginalMarker || OriginalMarker.__miniTrackNoDrag) return;

  class MiniTrackMarker extends OriginalMarker {
    constructor(options, ...rest) {
      if (options && typeof options === 'object' && options.draggable === true) {
        options = {...options, draggable:false};
      }
      super(options, ...rest);
    }
  }

  MiniTrackMarker.__miniTrackNoDrag = true;
  window.maplibregl.Marker = MiniTrackMarker;
})();
