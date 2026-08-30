(() => {
  const NAV_PITCH = 60;
  const NAV_ZOOM = 16.3;
  let lastHeading = null;

  function routeHeading(pos) {
    try {
      if (!routeCoords?.length) return null;
      const i = nearestRouteIndex(pos);
      const b = nextDirection(pos, i);
      return Number.isFinite(b) ? b : null;
    } catch { return null; }
  }

  function headingFor(position, c) {
    const h = Number(position?.coords?.heading);
    const speed = Number(position?.coords?.speed);
    if (Number.isFinite(h) && h >= 0 && (!Number.isFinite(speed) || speed > 0.4)) {
      lastHeading = h;
      return h;
    }
    const rh = routeHeading(c);
    if (Number.isFinite(rh)) {
      lastHeading = rh;
      return rh;
    }
    return lastHeading;
  }

  function makeArrow(marker, heading) {
    if (!marker) return;
    const el = marker.getElement();
    if (!el) return;
    el.style.cssText = 'width:34px;height:34px;background:transparent;border:0;box-shadow:none;display:flex;align-items:center;justify-content:center;';
    let arrow = el.querySelector('.mini-nav-arrow');
    if (!arrow) {
      el.innerHTML = '';
      arrow = document.createElement('div');
      arrow.className = 'mini-nav-arrow';
      arrow.style.cssText = 'width:28px;height:32px;background:#1769d2;clip-path:polygon(50% 0,100% 100%,50% 78%,0 100%);filter:drop-shadow(0 1px 2px rgba(0,0,0,.55));border:0;transform-origin:50% 50%;';
      el.appendChild(arrow);
    }
    const rel = followMode ? 0 : ((heading || 0) - map.getBearing());
    arrow.style.transform = `rotate(${rel}deg)`;
  }

  function followCamera(c, heading, immediate=false) {
    if (!followMode || !Array.isArray(c)) return;
    const b = Number.isFinite(heading) ? heading : map.getBearing();
    map.easeTo({
      center:c,
      zoom:Math.max(map.getZoom(), NAV_ZOOM),
      pitch:NAV_PITCH,
      bearing:b,
      offset:[0, 115],
      duration:immediate ? 250 : 420,
      essential:true
    });
  }

  function enterNavView() {
    if (!routeCoords?.length) return;
    try {
      if (gpsMarker) { gpsMarker.remove(); gpsMarker = null; }
    } catch {}
    const c = gps || routeCoords[0];
    const h = routeHeading(c) ?? (routeCoords.length > 1 ? bearing(routeCoords[0], routeCoords[Math.min(8, routeCoords.length - 1)]) : 0);
    lastHeading = h;
    setTimeout(() => followCamera(c, h, true), 0);
  }

  const geo = navigator.geolocation;
  if (geo?.watchPosition) {
    const nativeWatch = geo.watchPosition.bind(geo);
    try {
      geo.watchPosition = function(success, error, options) {
        return nativeWatch(function(position) {
          success?.(position);
          if (!tracking) return;
          const c = [position.coords.longitude, position.coords.latitude];
          const h = headingFor(position, c);
          makeArrow(liveMarker, h);
          followCamera(c, h, false);
        }, error, options);
      };
    } catch {}
  }

  document.getElementById('startRoute')?.addEventListener('click', () => setTimeout(enterNavView, 0));
  document.getElementById('followMe')?.addEventListener('click', () => {
    setTimeout(() => {
      if (!tracking || !followMode || !gps) return;
      const h = lastHeading ?? routeHeading(gps);
      makeArrow(liveMarker, h);
      followCamera(gps, h, true);
    }, 0);
  });
})();