(() => {
  const KEY = 'minitrack.route.v1';
  const RESTORE_FLAG = 'minitrack.localRestore';

  // Ein echter geteilter Link hat immer Vorrang vor dem lokal gespeicherten Stand.
  if (location.hash) return;

  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!saved || saved.v !== 1) return;

    if (saved.kind === 'routeHash' && /^#(?:r|route)=/.test(saved.hash || '')) {
      sessionStorage.setItem(RESTORE_FLAG, 'hash');
      history.replaceState(null, '', location.pathname + location.search + saved.hash);
      return;
    }

    if (saved.kind === 'single' && Array.isArray(saved.point) && saved.point.length >= 2) {
      sessionStorage.setItem(RESTORE_FLAG, 'single');
    }
  } catch {}
})();
