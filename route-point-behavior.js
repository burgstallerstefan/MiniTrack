(() => {
  const isSharedOpen = /^#(?:r|route)=/.test(location.hash);
  let sharedCentered = false;

  function normalizePointRows() {
    const list = document.getElementById('routePointList');
    if (!list) return;
    list.style.touchAction = 'pan-y';
    list.style.overflowX = 'hidden';
    list.style.webkitOverflowScrolling = 'touch';

    const rows = [...list.querySelectorAll('.route-order-row')];
    rows.forEach((row, i) => {
      row.style.touchAction = 'pan-y';

      const handle = row.children?.[0];
      if (handle instanceof HTMLElement) {
        handle.style.display = '';
        handle.style.pointerEvents = 'auto';
        handle.style.touchAction = 'none';
      }
      row.style.gridTemplateColumns = '44px 34px 1fr 38px';

      const badge = row.children?.[1];
      const wantedNumber = String(i + 1);
      if (badge && badge.textContent !== wantedNumber) badge.textContent = wantedNumber;

      const info = row.children?.[2];
      const name = info?.children?.[0];
      const type = info?.children?.[1]?.textContent?.trim() || '';
      if (!name) return;
      const raw = name.textContent.trim();
      let wanted = raw;
      if ((raw === 'Start' || raw === 'Ziel' || /^Wegpunkt \d+$/.test(raw)) && !type) wanted = `Punkt ${i + 1}`;
      else if (raw === 'Start' && type === 'Aktueller Standort') wanted = 'Aktueller Standort';
      if (wanted !== raw) name.textContent = wanted;
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
    let normalizing = false;
    new MutationObserver(() => {
      if (normalizing) return;
      normalizing = true;
      requestAnimationFrame(() => {
        normalizePointRows();
        centerSharedRouteOnce();
        normalizing = false;
      });
    }).observe(list, {childList:true,subtree:true});
    normalizePointRows();
  }

  const routeInfo = document.getElementById('routeInfo');
  if (routeInfo) new MutationObserver(centerSharedRouteOnce).observe(routeInfo, {attributes:true,subtree:true,childList:true});
  const centerPoll = setInterval(() => {
    centerSharedRouteOnce();
    if (sharedCentered) clearInterval(centerPoll);
  }, 350);
  setTimeout(() => clearInterval(centerPoll), 12000);

  function closePopups() {
    document.querySelectorAll('.maplibregl-popup .maplibregl-popup-close-button').forEach(b => {
      try { b.click(); } catch {}
    });
  }

  function googleMapsUrl(lngLat) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lngLat.lat},${lngLat.lng}`)}`;
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

    const google = document.createElement('a');
    google.className = 'googleMapsLink';
    google.textContent = 'In Google Maps öffnen';
    google.href = googleMapsUrl(lngLat);
    google.target = '_blank';
    google.rel = 'noopener noreferrer';
    google.style.cssText = 'display:block;text-align:center;text-decoration:none;padding:9px 10px;border:1px solid #ccc;border-radius:9px;background:#fff;color:#1769d2;font-weight:800;margin-top:8px';

    body.append(title, sub, add, google);

    const popup = new maplibregl.Popup({closeButton:true,closeOnClick:false,offset:14})
      .setLngLat(lngLat)
      .setDOMContent(body)
      .addTo(map);

    add.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      popup.remove();
      requestAnimationFrame(() => {
        window.MiniTrackPlanner?.addPoi?.([lngLat.lng,lngLat.lat], {name:'Punkt',type:'Kartenpunkt',cat:'map'});
      });
    }, {once:true});
  }

  map.on('dblclick', e => {
    if (tracking || planning) return;
    const target = e.originalEvent?.target;
    if (target?.closest?.('.maplibregl-marker,.maplibregl-popup,button,input,label')) return;
    try { e.preventDefault?.(); } catch {}
    try { e.originalEvent?.preventDefault?.(); } catch {}
    showPointPopup(e.lngLat);
  });
})();