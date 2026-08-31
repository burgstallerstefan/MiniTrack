(() => {
  const actions = document.getElementById('routeActions');
  const pointList = document.getElementById('routePointList');
  if (!actions) return;

  let btn = document.getElementById('shareRoute');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'shareRoute';
    btn.className = 'secondary';
    const start = document.getElementById('startRoute');
    actions.insertBefore(btn, start || actions.firstChild);
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      window.MiniTrackPlanner?.share?.();
    });
  }

  btn.title = 'Route teilen';
  btn.setAttribute('aria-label', 'Route teilen');
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style="display:block;margin:auto"><path d="M18 8a3 3 0 1 0-2.83-4H15a3 3 0 0 0 .42 1.53L8.9 9.14A3 3 0 0 0 4 11.5a3 3 0 0 0 4.9 2.36l6.52 3.61A3 3 0 0 0 15 19a3 3 0 1 0 .83-2.07L9.3 13.31a3.08 3.08 0 0 0 0-2.62l6.53-3.62A3 3 0 0 0 18 8Z" fill="currentColor"/></svg>';
  btn.style.cssText = 'flex:0 0 46px;min-width:46px;width:46px;min-height:40px;padding:0;display:none;align-items:center;justify-content:center';

  function sync() {
    const count = window.MiniTrackPlanner?.pointCount?.() ?? pointList?.querySelectorAll('.route-order-row').length ?? 0;
    btn.style.display = count >= 2 ? 'flex' : 'none';
  }

  if (pointList) new MutationObserver(sync).observe(pointList, {childList:true,subtree:true});
  document.addEventListener('minitrack:activitychange', sync);
  setTimeout(sync, 0);
})();