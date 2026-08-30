(() => {
  function apply() {
    if (!map.getLayer('route-arrows')) return;
    try {
      map.setLayoutProperty('route-arrows', 'text-rotate', ['+', ['get','bearing'], 90]);
    } catch {}
  }

  if (map.loaded()) apply();
  else map.once('load', apply);

  map.on('styledata', apply);
})();
