(() => {
  const KEY = 'outabout.route.v1';
  const LEGACY_KEY = 'minitrack.route.v1';
  const RESTORE_FLAG = 'outabout.localRestore';
  const planner = window.OutaboutPlanner || window.MiniTrackPlanner;
  const list = document.getElementById('routePointList');
  if (!planner || !list) return;

  try {
    if (!localStorage.getItem(KEY) && localStorage.getItem(LEGACY_KEY)) {
      localStorage.setItem(KEY, localStorage.getItem(LEGACY_KEY));
    }
  } catch {}

  function clearSyntheticHash() {
    if (sessionStorage.getItem(RESTORE_FLAG) !== 'hash') return;
    sessionStorage.removeItem(RESTORE_FLAG);
    try { history.replaceState(null, '', location.pathname + location.search); } catch {}
  }

  function modeKey() {
    return (window.OutaboutActivity || window.MiniTrackActivity)?.key || 'wandern';
  }

  function rowMeta(i) {
    const row = list.querySelectorAll('.route-order-row')[i];
    const info = row?.children?.[2];
    return {
      name: info?.children?.[0]?.textContent?.trim() || `Punkt ${i + 1}`,
      type: info?.children?.[1]?.textContent?.trim() || '',
      cat: 'map'
    };
  }

  function markerCoord(i) {
    const el = document.querySelector(`[data-route-point-index="${i}"]`);
    if (!el) return null;
    try {
      const r = el.getBoundingClientRect();
      const ll = map.unproject([r.left + r.width / 2, r.top + r.height / 2]);
      return [Number(ll.lng.toFixed(6)), Number(ll.lat.toFixed(6))];
    } catch { return null; }
  }

  function saveNow() {
    const count = planner.pointCount?.() || 0;
    if (!count) {
      try { localStorage.removeItem(KEY); localStorage.removeItem(LEGACY_KEY); } catch {}
      return;
    }

    if (count >= 2) {
      try {
        const url = planner.getShareUrl?.();
        const hash = url ? new URL(url).hash : '';
        if (/^#(?:r|route)=/.test(hash)) {
          localStorage.setItem(KEY, JSON.stringify({v:1,kind:'routeHash',hash,updated:Date.now()}));
          return;
        }
      } catch {}
    }

    if (count === 1) {
      const point = markerCoord(0);
      if (!point) return;
      try {
        localStorage.setItem(KEY, JSON.stringify({v:1,kind:'single',mode:modeKey(),point,meta:rowMeta(0),updated:Date.now()}));
      } catch {}
    }
  }

  function applyMode(key) {
    if (!key) return;
    const input = document.querySelector(`input[name="routeMode"][value="${CSS.escape(key)}"]`);
    if (input && !input.checked) {
      input.checked = true;
      input.dispatchEvent(new Event('change',{bubbles:true}));
    }
  }

  function restoreSingleIfNeeded() {
    if (sessionStorage.getItem(RESTORE_FLAG) !== 'single') return;
    sessionStorage.removeItem(RESTORE_FLAG);
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!saved || saved.v !== 1 || saved.kind !== 'single' || !Array.isArray(saved.point)) return;
      applyMode(saved.mode);
      planner.setStartPoi?.(saved.point, saved.meta || {name:'Punkt 1',type:'',cat:'map'});
      try { map.easeTo({center:saved.point,zoom:Math.max(map.getZoom(),15),duration:0}); } catch {}
    } catch {}
  }

  clearSyntheticHash();
  restoreSingleIfNeeded();

  let timer = null;
  function scheduleSave() {
    clearTimeout(timer);
    timer = setTimeout(saveNow, 80);
  }

  new MutationObserver(scheduleSave).observe(list,{childList:true,subtree:true});
  document.addEventListener('outabout:activitychange',scheduleSave);
  window.addEventListener('pagehide',saveNow);
  setTimeout(saveNow, 500);
})();