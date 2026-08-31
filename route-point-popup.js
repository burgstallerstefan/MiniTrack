(() => {
  function closeMapPopups() {
    document.querySelectorAll('.maplibregl-popup .maplibregl-popup-close-button').forEach(b => {
      try { b.click(); } catch {}
    });
  }

  function routePointIndex(marker) {
    const label = marker?.textContent?.trim() || '';
    const rows = [...document.querySelectorAll('#routePointList .route-order-row')];
    if (!rows.length) return null;
    if (label === 'S') return 0;
    if (label === 'Z') return rows.length - 1;
    if (/^\d+$/.test(label)) {
      const i = Number(label);
      return i >= 0 && i < rows.length ? i : null;
    }
    return null;
  }

  function pointInfo(i) {
    const row = document.querySelector(`#routePointList .route-order-row[data-index="${i}"]`);
    const info = row?.children?.[2];
    const name = info?.children?.[0]?.textContent?.trim() || (i === 0 ? 'Start' : 'Wegpunkt');
    const type = info?.children?.[1]?.textContent?.trim() || '';
    return {name,type};
  }

  document.addEventListener('click', e => {
    const marker = e.target?.closest?.('.maplibregl-marker');
    if (!marker || marker.classList.contains('poi-marker')) return;

    const i = routePointIndex(marker);
    if (i == null) return;

    e.preventDefault();
    e.stopPropagation();

    const r = marker.getBoundingClientRect();
    let ll;
    try { ll = map.unproject([r.left + r.width / 2, r.top + r.height / 2]); }
    catch { return; }

    const {name,type} = pointInfo(i);
    closeMapPopups();

    const body = document.createElement('div');
    body.style.cssText = 'min-width:190px';
    const title = document.createElement('b');
    title.textContent = name;
    body.appendChild(title);
    if (type) {
      const sub = document.createElement('div');
      sub.textContent = type;
      sub.style.cssText = 'font-size:12px;color:#666;margin-top:2px';
      body.appendChild(sub);
    }

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'popbtn good';
    add.textContent = '＋ Hinzufügen';
    add.style.cssText = 'display:block;width:100%;margin-top:10px;min-height:40px';
    body.appendChild(add);

    const popup = new maplibregl.Popup({closeButton:true,closeOnClick:false,offset:18})
      .setLngLat(ll)
      .setDOMContent(body)
      .addTo(map);

    add.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      document.getElementById('addRoutePoint')?.click();
      popup.remove();
      const status = document.getElementById('status');
      if (status) status.textContent = 'Neuen Punkt auf der Karte antippen · wird am Ende angehängt.';
    });
  }, true);
})();
