(() => {
  const actions = document.getElementById('routeActions');
  const add = document.getElementById('addRoutePoint');
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

  // Entfernung steht bereits in der Statistik. Im Titel nur die Punktanzahl zeigen.
  const routeTitle = document.getElementById('routeTitle');
  function cleanRouteTitle() {
    if (!routeTitle) return;
    const cleaned = routeTitle.textContent.replace(/\s·\s\d+(?:[.,]\d+)?\s*km\s*$/i, '');
    if (cleaned !== routeTitle.textContent) routeTitle.textContent = cleaned;
  }
  if (routeTitle) {
    new MutationObserver(cleanRouteTitle).observe(routeTitle, {childList:true,characterData:true,subtree:true});
    cleanRouteTitle();
  }

  const angleDiff = (a,b) => {
    const d = Math.abs(((a-b+540)%360)-180);
    return d;
  };
  const kmBetween = (a,b) => geoKm({lat:a[1],lng:a[0]},{lat:b[1],lng:b[0]});

  // Auf Hin-und-zurück-Passagen keine zwei gegensätzlichen Pfeile stapeln.
  // Dort wird ein einzelnes Doppelpfeil-Symbol gezeigt.
  arrowFeatures = function(c) {
    const candidates = [];
    let acc = 0;
    for (let i = 1; i < (c?.length || 0); i++) {
      acc += kmBetween(c[i-1], c[i]);
      if (acc >= 0.65) {
        candidates.push({coord:c[i], bearing:bearing(c[i-1],c[i])});
        acc = 0;
      }
    }

    const kept = [];
    for (const cand of candidates) {
      let merged = false;
      for (const old of kept) {
        if (kmBetween(cand.coord, old.coord) > 0.14) continue;
        if (angleDiff(cand.bearing, old.bearing) >= 120) {
          old.symbol = '↔';
          old.double = true;
          merged = true;
          break;
        }
        // Gleiche Richtung an nahezu derselben Stelle ebenfalls nicht doppelt zeichnen.
        if (angleDiff(cand.bearing, old.bearing) <= 35) {
          merged = true;
          break;
        }
      }
      if (!merged) kept.push({...cand, symbol:'➤', double:false});
    }

    return {
      type:'FeatureCollection',
      features:kept.map(x => ({
        type:'Feature',
        properties:{bearing:x.bearing,symbol:x.symbol,double:x.double?1:0},
        geometry:{type:'Point',coordinates:x.coord}
      }))
    };
  };

  function fixRouteArrows() {
    if (!map.getLayer('route-arrows')) return;
    try {
      map.setLayoutProperty('route-arrows', 'text-field', ['get','symbol']);
      map.setLayoutProperty('route-arrows', 'text-rotate', ['+', ['get','bearing'], 270]);
      map.setLayoutProperty('route-arrows', 'text-size', ['case',['==',['get','double'],1],18,16]);
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