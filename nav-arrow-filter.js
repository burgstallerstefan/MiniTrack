(() => {
  const LOOK_AHEAD_KM = 2.8;
  const ARROW_GAP_KM = 0.42;

  const kmBetween = (a,b) => geoKm({lat:a[1],lng:a[0]},{lat:b[1],lng:b[0]});

  function forwardArrowFeatures() {
    if (!tracking || !gps || !Array.isArray(routeCoords) || routeCoords.length < 2) {
      return null;
    }
    const start = nearestRouteIndex(gps);
    const features = [];
    let walked = 0;
    let sinceArrow = 0;

    for (let i = Math.max(1, start + 1); i < routeCoords.length; i++) {
      const a = routeCoords[i - 1], b = routeCoords[i];
      const d = kmBetween(a,b);
      walked += d;
      sinceArrow += d;
      if (walked > LOOK_AHEAD_KM) break;
      if (sinceArrow < ARROW_GAP_KM) continue;
      sinceArrow = 0;
      features.push({
        type:'Feature',
        properties:{bearing:bearing(a,b),symbol:'➤',double:0},
        geometry:{type:'Point',coordinates:b}
      });
    }
    return {type:'FeatureCollection',features};
  }

  function syncArrows() {
    const source = map.getSource('route-arrows');
    if (!source || !routeCoords?.length) return;
    try {
      if (tracking) {
        const data = forwardArrowFeatures();
        if (data) source.setData(data);
      } else {
        source.setData(arrowFeatures(routeCoords));
      }
    } catch {}
  }

  function restoreStaticPositionDot() {
    try {
      if (liveMarker) {
        liveMarker.remove();
        liveMarker = null;
      }
      if (!gps) return;
      if (gpsMarker) gpsMarker.remove();
      const el = document.createElement('div');
      el.style.cssText = 'width:18px;height:18px;border-radius:50%;background:#1769d2;border:3px solid white;box-shadow:0 1px 5px #555';
      gpsMarker = new maplibregl.Marker({element:el}).setLngLat(gps).addTo(map);
    } catch {}
  }

  document.getElementById('startRoute')?.addEventListener('click', () => {
    setTimeout(syncArrows, 250);
  });

  document.getElementById('stopTrack')?.addEventListener('click', () => {
    setTimeout(() => {
      restoreStaticPositionDot();
      syncArrows();
    }, 0);
  });

  const timer = setInterval(() => {
    if (tracking) syncArrows();
  }, 700);

  window.addEventListener('pagehide', () => clearInterval(timer), {once:true});
})();
