(() => {
  let lastPoi = null;

  const style = document.createElement('style');
  style.textContent = '.maplibregl-popup .fromBtn,.maplibregl-popup .routeBtn{display:none!important}.maplibregl-popup .googleMapsLink{display:block;text-align:center;text-decoration:none;padding:9px 10px;border:1px solid #ccc;border-radius:9px;background:#fff;color:#1769d2;font-weight:800}.maplibregl-popup .maplibregl-popup-close-button{display:flex!important;align-items:center;justify-content:center;position:absolute!important;top:5px!important;right:5px!important;width:26px!important;height:26px!important;padding:0!important;border:0!important;border-radius:50%!important;background:rgba(255,255,255,.96)!important;color:#444!important;font-size:20px!important;line-height:1!important;font-weight:700!important;z-index:5!important}.maplibregl-popup-content{position:relative!important;padding-right:36px!important}';
  document.head.appendChild(style);

  function coordFromElement(el) {
    try {
      const r = el.getBoundingClientRect();
      const ll = map.unproject([r.left + r.width / 2, r.top + r.height / 2]);
      return [ll.lng, ll.lat];
    } catch { return null; }
  }

  function markerType(marker) {
    if (marker.classList.contains('poi-hut')) return {type:'Hütte',cat:'huts'};
    if (marker.classList.contains('poi-alm')) return {type:'Alm / Alpe',cat:'alms'};
    if (marker.classList.contains('poi-food')) return {type:'Gasthaus / Unterkunft',cat:'food'};
    if (marker.classList.contains('poi-locality')) return {type:'Ort / Lokalität',cat:'localities'};
    if (marker.classList.contains('poi-peak')) return {type:'Gipfel',cat:'peaks'};
    return {type:'Punkt',cat:'poi'};
  }

  function googleMapsUrl(poi) {
    const query = `${poi.name} ${poi.c[1]},${poi.c[0]}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  document.addEventListener('click', e => {
    const marker = e.target?.closest?.('.poi-marker');
    if (!marker) return;
    document.querySelectorAll('.maplibregl-popup[data-minitrack-new-poi-popup="1"]').forEach(p => p.remove());
    const c = coordFromElement(marker);
    if (c) lastPoi = {c, ...markerType(marker)};
  }, true);

  function transformPopup(pop) {
    if (!pop || pop.dataset.minitrackNewPoiPopup === '1') return;
    const oldFrom = pop.querySelector('.fromBtn');
    const oldRoute = pop.querySelector('.routeBtn');
    if (!oldFrom && !oldRoute) return;

    document.querySelectorAll('.maplibregl-popup[data-minitrack-new-poi-popup="1"]').forEach(other => {
      if (other !== pop) other.remove();
    });
    pop.dataset.minitrackNewPoiPopup = '1';
    oldFrom?.remove(); oldRoute?.remove();

    const body = pop.querySelector('.maplibregl-popup-content');
    if (!body) return;
    const name = body.querySelector('b')?.textContent?.trim() || 'Punkt';
    const poi = lastPoi ? {...lastPoi, name} : null;
    if (!poi?.c) return;

    const actions = document.createElement('div');
    actions.style.cssText = 'display:grid;gap:8px;margin-top:10px';

    if (!window.MiniTrackPlanner?.hasStart?.()) {
      const start = document.createElement('button');
      start.className = 'popbtn secondary'; start.textContent = 'Start';
      start.addEventListener('click', ev => {
        ev.stopPropagation();
        window.MiniTrackPlanner?.setStartPoi?.(poi.c,{name:poi.name,type:poi.type,cat:poi.cat});
        pop.querySelector('.maplibregl-popup-close-button')?.click();
      });
      actions.appendChild(start);
    }

    const add = document.createElement('button');
    add.className = 'popbtn good'; add.textContent = '＋ Hinzufügen';
    add.addEventListener('click', ev => {
      ev.stopPropagation();
      window.MiniTrackPlanner?.addPoi?.(poi.c,{name:poi.name,type:poi.type,cat:poi.cat});
      pop.querySelector('.maplibregl-popup-close-button')?.click();
    });
    actions.appendChild(add);

    const google = document.createElement('a');
    google.className = 'googleMapsLink';
    google.textContent = 'In Google Maps öffnen';
    google.href = googleMapsUrl(poi);
    google.target = '_blank';
    google.rel = 'noopener noreferrer';
    actions.appendChild(google);

    body.appendChild(actions);
  }

  const scan = root => {
    if (root?.matches?.('.maplibregl-popup')) transformPopup(root);
    root?.querySelectorAll?.('.maplibregl-popup').forEach(transformPopup);
  };

  new MutationObserver(ms => {
    for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n);
  }).observe(document.body, {childList:true,subtree:true});

  document.querySelectorAll('.maplibregl-popup').forEach(transformPopup);
})();