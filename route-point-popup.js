(() => {
  function closeMapPopups() {
    document.querySelectorAll('.maplibregl-popup .maplibregl-popup-close-button').forEach(b => {
      try { b.click(); } catch {}
    });
  }

  function routePointIndex(marker) {
    const rows = [...document.querySelectorAll('#routePointList .route-order-row')];
    if (!rows.length) return null;
    const explicit = Number(marker?.dataset?.routePointIndex);
    if (Number.isInteger(explicit) && explicit >= 0 && explicit < rows.length) return explicit;
    const label = marker?.textContent?.trim() || '';
    if (/^\d+$/.test(label)) {
      const i = Number(label) - 1;
      return i >= 0 && i < rows.length ? i : null;
    }
    return null;
  }

  function pointInfo(i) {
    const rows = [...document.querySelectorAll('#routePointList .route-order-row')];
    const row = rows[i];
    const info = row?.children?.[2];
    const name = info?.children?.[0]?.textContent?.trim() || `Punkt ${i + 1}`;
    const type = info?.children?.[1]?.textContent?.trim() || '';
    return {name,type,row};
  }

  function googleMapsUrl(ll, name) {
    const query = name && !/^Punkt \d+$/.test(name)
      ? `${name} ${ll.lat},${ll.lng}`
      : `${ll.lat},${ll.lng}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
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

    const {name,type,row} = pointInfo(i);
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

    const google = document.createElement('a');
    google.className = 'googleMapsLink';
    google.textContent = 'In Google Maps öffnen';
    google.href = googleMapsUrl(ll, name);
    google.target = '_blank';
    google.rel = 'noopener noreferrer';
    google.style.cssText = 'display:block;text-align:center;text-decoration:none;padding:9px 10px;border:1px solid #ccc;border-radius:9px;background:#fff;color:#1769d2;font-weight:800;margin-top:7px';
    body.appendChild(google);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'popbtn warn';
    del.textContent = 'Löschen';
    del.style.cssText = 'display:block;width:100%;margin-top:7px;min-height:40px';
    body.appendChild(del);

    const popup = new maplibregl.Popup({closeButton:true,closeOnClick:false,offset:18})
      .setLngLat(ll)
      .setDOMContent(body)
      .addTo(map);

    add.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      window.MiniTrackPlanner?.addPoi?.([ll.lng,ll.lat], {name,type,cat:'map'});
      popup.remove();
      const status = document.getElementById('status');
      if (status) status.textContent = 'Punkt ans Ende der Route angehängt.';
    });

    del.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const deleteButton = row?.querySelector('button[title="Punkt entfernen"]');
      popup.remove();
      if (deleteButton) {
        deleteButton.click();
        const status = document.getElementById('status');
        if (status) status.textContent = 'Punkt gelöscht · Route wird neu berechnet.';
      }
    });
  }, true);
})();
