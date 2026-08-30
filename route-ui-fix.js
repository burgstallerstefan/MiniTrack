(() => {
  const actions = document.getElementById('routeActions');
  const add = document.getElementById('addRoutePoint');
  // Der Planer braucht diesen Knopf intern weiterhin; für den Benutzer bleibt er unsichtbar.
  if (add) {
    add.style.display = 'none';
    add.setAttribute('aria-hidden','true');
  }

  let save = document.getElementById('exportRouteGpx');
  if (!save && actions) {
    save = document.createElement('button');
    save.id = 'exportRouteGpx';
    save.className = 'secondary';
    const start = document.getElementById('startRoute');
    actions.insertBefore(save, start || actions.firstChild);
  }
  if (save) save.textContent = 'Speichern';

  // Weniger, klarere Richtungspfeile entlang der Route.
  arrowFeatures = function(c) {
    const fs = [];
    let acc = 0;
    for (let i = 1; i < (c?.length || 0); i++) {
      acc += geoKm({lat:c[i-1][1],lng:c[i-1][0]},{lat:c[i][1],lng:c[i][0]});
      if (acc >= 0.60) {
        fs.push({
          type:'Feature',
          properties:{bearing:bearing(c[i-1],c[i])},
          geometry:{type:'Point',coordinates:c[i]}
        });
        acc = 0;
      }
    }
    return {type:'FeatureCollection',features:fs};
  };

  function fixRouteArrows() {
    if (!map.getLayer('route-arrows')) return;
    try {
      // Gegenüber der bisherigen Darstellung um 180° drehen.
      map.setLayoutProperty('route-arrows', 'text-rotate', ['+', ['get','bearing'], 270]);
      map.setLayoutProperty('route-arrows', 'text-size', 16);
      map.setLayoutProperty('route-arrows', 'text-allow-overlap', false);
      map.setLayoutProperty('route-arrows', 'text-ignore-placement', false);
    } catch {}
    if (routeCoords?.length && map.getSource('route-arrows')) {
      try { map.getSource('route-arrows').setData(arrowFeatures(routeCoords)); } catch {}
    }
  }

  if (map.loaded()) fixRouteArrows(); else map.once('load', fixRouteArrows);
  map.on('styledata', fixRouteArrows);
})();