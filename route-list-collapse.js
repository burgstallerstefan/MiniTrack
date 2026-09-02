(() => {
  const routeInfo = document.getElementById('routeInfo');
  const pointList = document.getElementById('routePointList');
  const routeActions = document.getElementById('routeActions');
  const routeGrid = routeInfo?.querySelector('.routegrid');
  const routeTitle = document.getElementById('routeTitle');
  const note = routeInfo?.querySelector('.smallnote');
  if (!routeInfo || !pointList) return;

  let collapsed = true;

  const toggle = document.createElement('button');
  toggle.id = 'routeListToggle';
  toggle.type = 'button';
  toggle.title = 'Routendetails ein-/ausklappen';
  toggle.setAttribute('aria-label','Routendetails ein-/ausklappen');
  toggle.style.cssText = 'position:absolute;right:8px;top:7px;width:34px;height:34px;min-width:34px;padding:0;border:0;border-radius:50%;background:transparent;color:#444;font-size:22px;line-height:34px;font-weight:900;z-index:3';
  routeInfo.appendChild(toggle);

  function countPoints() {
    return pointList.querySelectorAll('.route-order-row').length;
  }

  function enableTouchScroll() {
    pointList.style.touchAction = 'pan-y';
    pointList.style.overflowX = 'hidden';
    pointList.style.webkitOverflowScrolling = 'touch';
    pointList.querySelectorAll('.route-order-row').forEach(row => {
      row.style.touchAction = 'pan-y';
      const handle = row.children?.[0];
      if (handle instanceof HTMLElement) {
        handle.style.display = '';
        handle.style.pointerEvents = 'auto';
        handle.style.touchAction = 'none';
      }
      row.style.gridTemplateColumns = '44px 34px 1fr 38px';
    });
  }

  function sync() {
    const count = countPoints();
    enableTouchScroll();
    toggle.style.display = count >= 2 ? 'block' : 'none';
    toggle.textContent = collapsed ? '⌄' : '⌃';
    toggle.setAttribute('aria-expanded', String(!collapsed));

    if (count === 0) {
      pointList.style.display = 'none';
      if (routeActions) routeActions.style.display = 'none';
      if (routeGrid) routeGrid.style.display = '';
      if (note) note.style.display = 'none';
      return;
    }

    if (count === 1) {
      routeInfo.style.display = 'block';
      pointList.style.display = 'block';
      if (routeTitle) routeTitle.textContent = '1 Punkt';
      if (routeGrid) routeGrid.style.display = 'none';
      if (routeActions) routeActions.style.display = 'none';
      if (note) note.style.display = 'none';
      pointList.style.maxHeight = '';
      pointList.style.overflowY = '';
      pointList.style.overscrollBehavior = '';
      return;
    }

    if (routeGrid) routeGrid.style.display = '';

    if (collapsed) {
      pointList.style.display = 'none';
      if (routeActions) routeActions.style.display = 'none';
      if (note) note.style.display = 'none';
    } else {
      pointList.style.display = 'block';
      if (routeActions) routeActions.style.display = 'flex';
      if (note) note.style.display = '';
    }

    if (!collapsed && count >= 4) {
      pointList.style.maxHeight = '216px';
      pointList.style.overflowY = 'auto';
      pointList.style.overscrollBehavior = 'contain';
    } else {
      pointList.style.maxHeight = '';
      pointList.style.overflowY = '';
      pointList.style.overscrollBehavior = '';
    }
  }

  toggle.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    collapsed = !collapsed;
    sync();
  });

  new MutationObserver(() => requestAnimationFrame(sync)).observe(pointList, {childList:true,subtree:true});
  sync();
})();