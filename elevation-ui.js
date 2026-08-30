(() => {
  function addMetric(container, id, label) {
    if (!container || document.getElementById(id)) return;
    const span = document.createElement('span');
    span.innerHTML = `${label}<b id="${id}">—</b>`;
    container.appendChild(span);
  }

  const routeGrid = document.querySelector('#routeInfo .routegrid');
  if (routeGrid) {
    routeGrid.style.gridTemplateColumns = 'repeat(3,1fr)';
    addMetric(routeGrid, 'routeUp', 'Aufstieg ↑');
    addMetric(routeGrid, 'routeDown', 'Abstieg ↓');
  }

  const trackGrid = document.querySelector('#trackPanel .trackstats');
  if (trackGrid) {
    addMetric(trackGrid, 'trackRouteUp', 'Route ↑');
    addMetric(trackGrid, 'trackRouteDown', 'Route ↓');
  }

  const originalRouteStats = routeStats;
  routeStats = function(f) {
    const r = originalRouteStats(f);
    const p = f?.properties || {};
    let down = Number(p['filtered descend'] ?? p.filtered_descend ?? p.descend ?? p.descent);
    if (!Number.isFinite(down) || down < 0) {
      down = 0;
      const c = f?.geometry?.coordinates || [];
      for (let i = 1; i < c.length; i++) {
        if (c[i - 1]?.length > 2 && c[i]?.length > 2) {
          const dz = Number(c[i - 1][2]) - Number(c[i][2]);
          if (Number.isFinite(dz) && dz > 0) down += dz;
        }
      }
    }
    return { ...r, down };
  };

  const originalUpdateRouteInfo = updateRouteInfo;
  updateRouteInfo = function(o) {
    originalUpdateRouteInfo(o);
    const upText = `${Math.round(Number(o?.up) || 0)} hm`;
    const downText = `${Math.round(Number(o?.down) || 0)} hm`;
    const up = document.getElementById('routeUp');
    const down = document.getElementById('routeDown');
    const trackUp = document.getElementById('trackRouteUp');
    const trackDown = document.getElementById('trackRouteDown');
    if (up) up.textContent = upText;
    if (down) down.textContent = downText;
    if (trackUp) trackUp.textContent = upText;
    if (trackDown) trackDown.textContent = downText;
  };
})();