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

  function showPointPopup(lngLat) {
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

  // Android-stabil: kein Long-Press-, Pointer- oder Touch-Hooking.
  // Doppeltipp auf freie Karte öffnet das Hinzufügen-Popup.
  map.on('dblclick', e => {
    if (tracking || planning) return;
    const target = e.originalEvent?.target;
    if (target?.closest?.('.maplibregl-marker,.maplibregl-popup,button,input,label')) return;
    try { e.preventDefault?.(); } catch {}
    try { e.originalEvent?.preventDefault?.(); } catch {}
    showPointPopup(e.lngLat);
  });
})();
