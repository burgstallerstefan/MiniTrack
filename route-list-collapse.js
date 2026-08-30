(() => {
  const pointList = document.getElementById('routePointList');
  if (!pointList) return;

  let collapsed = true;
  const header = document.createElement('button');
  header.id = 'routeListToggle';
  header.type = 'button';
  header.className = 'secondary';
  header.style.cssText = 'width:100%;min-height:42px;margin:8px 0 0;display:flex;align-items:center;justify-content:space-between;padding:0 12px;font-weight:800';
  pointList.parentNode.insertBefore(header, pointList);

  function countPoints() {
    return pointList.querySelectorAll('.route-order-row').length;
  }

  function sync() {
    const count = countPoints();
    header.style.display = count ? 'flex' : 'none';
    header.innerHTML = `<span>Punkte (${count})</span><span>${collapsed ? '▾' : '▴'}</span>`;

    if (!count) {
      pointList.style.display = 'none';
      return;
    }

    pointList.style.display = collapsed ? 'none' : 'block';
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