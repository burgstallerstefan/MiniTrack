(() => {
  const isSharedOpen = /^#(?:r|route)=/.test(location.hash);
  let sharedCentered = false;

  function normalizePointRows() {
    const rows = [...document.querySelectorAll('#routePointList .route-order-row')];
    rows.forEach((row, i) => {
      row.style.touchAction = 'pan-y';
      const handle = row.querySelector('button');
      if (handle) handle.style.touchAction = 'none';
      const info = row.children?.[2];
      const name = info?.children?.[0];
      const type = info?.children?.[1]?.textContent?.trim() || '';
      if (!name) return;
      const raw = name.textContent.trim();
      if ((raw === 'Start' || raw === 'Ziel' || /^Wegpunkt \d+$/.test(raw)) && !type) {
        name.textContent = `Punkt ${i + 1}`;
      } else if (raw === 'Start' && type === 'Aktueller Standort') {
        name.textContent = 'Aktueller Standort';
      }
    });
  }

  function centerSharedRouteOnce() {
    if (!isSharedOpen || sharedCentered || !Array.isArray(routeCoords) || routeCoords.length < 2) return;
    try {
      const b = new maplibregl.LngLatBounds();
      routeCoords.forEach(c => b.extend([c[0], c[1]]));
      map.fitBounds(b, {padding:{top:125,bottom:200,left:35,right:35},duration:500});
      sharedCentered = true;
    } catch {}
  }

  const list = document.getElementById('routePointList');
  if (list) {
    list.style.touchAction = 'pan-y';
    new MutationObserver(() => {
      normalizePointRows();
      centerSharedRouteOnce();
    }).observe(list, {childList:true,subtree:true});
    normalizePointRows();
  }

  const routeInfo = document.getElementById('routeInfo');
  if (routeInfo) new MutationObserver(centerSharedRouteOnce).observe(routeInfo, {attributes:true,subtree:true,childList:true});
  const centerPoll = setInterval(() => {
    normalizePointRows();
    centerSharedRouteOnce();
    if (sharedCentered) clearInterval(centerPoll);
  }, 350);
  setTimeout(() => clearInterval(centerPoll), 12000);

  function closePopups() {
    document.querySelectorAll('.maplibregl-popup .maplibregl-popup-close-button').forEach(b => {
      try { b.click(); } catch {}
    });
  }

  function showLongPressPopup(lngLat) {
    if (!lngLat || tracking || planning) return;
    closePopups();
    const body = document.createElement('div');
    body.style.cssText = 'min-width:190px';
    const title = document.createElement('b');
    title.textContent = 'Punkt';
    const sub = document.createElement('div');
    sub.textContent = 'Kartenpunkt';
    sub.style.cssText = 'font-size:12px;color:#666;margin-top:2px';
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'popbtn good';
    add.textContent = '＋ Hinzufügen';
    add.style.cssText = 'display:block;width:100%;margin-top:10px;min-height:40px';
    body.append(title, sub, add);
    const popup = new maplibregl.Popup({closeButton:true,closeOnClick:false,offset:14})
      .setLngLat(lngLat)
      .setDOMContent(body)
      .addTo(map);
    add.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      window.MiniTrackPlanner?.addPoi?.([lngLat.lng,lngLat.lat], {name:'Punkt',type:'Kartenpunkt',cat:'map'});
      popup.remove();
    });
  }

  // Android/touch: Popup erst NACH dem Loslassen öffnen. So bleibt keine aktive
  // MapLibre-Geste hängen, während DOM/Popup unter dem Finger verändert wird.
  const canvas = map.getCanvas();
  let touchHold = null;

  canvas.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || tracking || planning) { touchHold = null; return; }
    const t = e.touches[0];
    touchHold = {x:t.clientX, y:t.clientY, started:Date.now(), moved:false};
  }, {passive:true});

  canvas.addEventListener('touchmove', e => {
    if (!touchHold || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (Math.hypot(t.clientX - touchHold.x, t.clientY - touchHold.y) > 14) touchHold.moved = true;
  }, {passive:true});

  canvas.addEventListener('touchend', () => {
    const hold = touchHold;
    touchHold = null;
    if (!hold || hold.moved || Date.now() - hold.started < 650) return;
    const rect = canvas.getBoundingClientRect();
    let ll;
    try { ll = map.unproject([hold.x - rect.left, hold.y - rect.top]); } catch { return; }
    setTimeout(() => showLongPressPopup(ll), 0);
  }, {passive:true});

  canvas.addEventListener('touchcancel', () => { touchHold = null; }, {passive:true});

  // Maus/Trackpad: Rechtsklick entspricht Langdruck, ohne Touch-Code zu berühren.
  if (window.matchMedia?.('(pointer:fine)').matches) {
    map.on('contextmenu', e => {
      try { e.originalEvent?.preventDefault?.(); } catch {}
      showLongPressPopup(e.lngLat);
    });
  }
})();