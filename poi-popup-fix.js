(() => {
  let lastPoiCoord = null;

  function coordFromElement(el) {
    try {
      const r = el.getBoundingClientRect();
      const ll = map.unproject([r.left + r.width / 2, r.top + r.height / 2]);
      return [ll.lng, ll.lat];
    } catch { return null; }
  }

  document.addEventListener('click', e => {
    const marker = e.target?.closest?.('.poi-marker');
    if (!marker) return;
    const c = coordFromElement(marker);
    if (c) lastPoiCoord = c;
  }, true);

  function hasPlannerStart() {
    return !!document.querySelector('#routePointList .route-order-row');
  }

  function plannerAdd(c) {
    const add = document.getElementById('addRoutePoint');
    if (!add || !c) return;
    const fire = () => {
      add.click();
      setTimeout(() => {
        try {
          map.fire('click', {
            lngLat: new maplibregl.LngLat(c[0], c[1]),
            originalEvent: { target: map.getCanvas() }
          });
        } catch {}
      }, 30);
    };
    if (gps) fire(); else requestLocation(fire);
  }

  function plannerSetStart(c) {
    const add = document.getElementById('addRoutePoint');
    if (!add || !c) return;
    const oldGps = gps ? [gps[0], gps[1]] : null;
    gps = [c[0], c[1]];
    add.click();
    if (oldGps) gps = oldGps;
    const status = document.getElementById('status');
    if (status) status.textContent = 'Start gesetzt. Jetzt Ziel oder Wegpunkt hinzufügen.';
  }

  function transformPopup(pop) {
    if (!pop || pop.dataset.minitrackNewPoiPopup === '1') return;
    const oldFrom = pop.querySelector('.fromBtn');
    const oldRoute = pop.querySelector('.routeBtn');
    if (!oldFrom && !oldRoute) return;

    pop.dataset.minitrackNewPoiPopup = '1';
    oldFrom?.remove();
    oldRoute?.remove();

    const body = pop.querySelector('.maplibregl-popup-content');
    if (!body) return;
    const c = lastPoiCoord && [...lastPoiCoord];

    const actions = document.createElement('div');
    actions.style.cssText = 'display:grid;gap:8px;margin-top:10px';

    if (!hasPlannerStart()) {
      const start = document.createElement('button');
      start.className = 'popbtn secondary';
      start.textContent = 'Von hier starten';
      start.addEventListener('click', ev => {
        ev.stopPropagation();
        plannerSetStart(c);
        pop.querySelector('.maplibregl-popup-close-button')?.click();
      });
      actions.appendChild(start);
    }

    const add = document.createElement('button');
    add.className = 'popbtn good';
    add.textContent = '＋ Hinzufügen';
    add.addEventListener('click', ev => {
      ev.stopPropagation();
      plannerAdd(c);
      pop.querySelector('.maplibregl-popup-close-button')?.click();
    });
    actions.appendChild(add);
    body.appendChild(actions);
  }

  const scan = root => {
    if (root?.matches?.('.maplibregl-popup')) transformPopup(root);
    root?.querySelectorAll?.('.maplibregl-popup').forEach(transformPopup);
  };

  new MutationObserver(ms => {
    for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n);
  }).observe(document.body, { childList: true, subtree: true });

  document.querySelectorAll('.maplibregl-popup').forEach(transformPopup);
})();