(() => {
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
    const up = document.getElementById('routeUp');
    const down = document.getElementById('routeDown');
    if (up) up.textContent = `${Math.round(Number(o?.up) || 0)} hm`;
    if (down) down.textContent = `${Math.round(Number(o?.down) || 0)} hm`;
  };
})();