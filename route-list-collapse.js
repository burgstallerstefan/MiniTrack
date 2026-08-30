(() => {
  const routeInfo = document.getElementById('routeInfo');
  const pointList = document.getElementById('routePointList');
  const routeActions = document.getElementById('routeActions');
  const note = routeInfo?.querySelector('.smallnote');
  if (!routeInfo || !pointList) return;

  let collapsed = true;
  const header = document.createElement('button');
  header.id = 'routeListToggle';
  header.type = 'button';
  header.className = 'secondary';
  header.style.cssText = 'width:100%;min-height:36px;margin:6px 0 0;display:flex;align-items:center;justify-content:space-between;padding:0 10px;font-weight:800;font-size:13px';
  pointList.parentNode.insertBefore(header, pointList);

  function countPoints() {
    return pointList.querySelectorAll('.route-order-row').length;
  }

  function sync() {
    const count = countPoints();
    header.style.display = count >= 2 ? 'flex' : 'none';
    header.innerHTML = `<span>${collapsed ? 'Details' : `Punkte (${count})`}</span><span>${collapsed ? '▾' : '▴'}</span>`;

    if (count < 2) {
      pointList.style.display = 'none';
      if (routeActions) routeActions.style.display = 'none';
      if (note) note.style.display = 'none';
      return;
    }

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
      pointList.style.webkitOverflowScrolling = 'touch';
    } else {
      pointList.style.maxHeight = '';
      pointList.style.overflowY = '';
      pointList.style.overscrollBehavior = '';
    }
  }

  header.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    collapsed = !collapsed;
    sync();
  });

  new MutationObserver(sync).observe(pointList, {childList:true});
  sync();
})();