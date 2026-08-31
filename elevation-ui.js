(() => {
  function addMetric(container, id, label) {
    if (!container || document.getElementById(id)) return;
    const span = document.createElement('span');
    span.innerHTML = `${label}<b id="${id}">—</b>`;
    container.appendChild(span);
  }

  function fmtDuration(hours) {
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0) return '—';
    const total = Math.max(1, Math.round(h * 60));
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    if (!hh) return `${mm} min`;
    return mm ? `${hh} h ${mm} min` : `${hh} h`;
  }

  const routeGrid = document.querySelector('#routeInfo .routegrid');
  if (routeGrid) {
    routeGrid.style.gridTemplateColumns = 'repeat(4,1fr)';
    addMetric(routeGrid, 'routeUp', 'Aufstieg ↑');
    addMetric(routeGrid, 'routeDown', 'Abstieg ↓');
    addMetric(routeGrid, 'routeDuration', 'Dauer');
  }

  const routeInfo = document.getElementById('routeInfo');
  let profileWrap = document.getElementById('elevationProfile');
  if (routeInfo && !profileWrap) {
    profileWrap = document.createElement('div');
    profileWrap.id = 'elevationProfile';
    profileWrap.style.cssText = 'display:none;margin:7px 0 2px;padding:7px 8px 5px;border:1px solid #e1e1e1;border-radius:10px;background:rgba(248,248,248,.96)';
    profileWrap.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#666;margin-bottom:3px"><span>Höhenprofil</span><span id="elevationRange">—</span></div><svg id="elevationSvg" viewBox="0 0 320 72" preserveAspectRatio="none" style="display:block;width:100%;height:72px" aria-label="Höhenprofil der Route"></svg><div id="elevationEnds" style="display:flex;justify-content:space-between;font-size:10px;color:#777;margin-top:2px"><span>—</span><span>—</span></div>';
    const pointList = document.getElementById('routePointList');
    routeInfo.insertBefore(profileWrap, pointList || document.getElementById('routeActions'));
  }

  const trackGrid = document.querySelector('#trackPanel .trackstats');
  if (trackGrid) {
    addMetric(trackGrid, 'trackRouteUp', 'Route ↑');
    addMetric(trackGrid, 'trackRouteDown', 'Route ↓');
  }

  function drawElevationProfile(coords) {
    if (!profileWrap) return;
    const pts = (coords || []).map((c, i) => ({i, z:Number(c?.[2])})).filter(p => Number.isFinite(p.z));
    const svg = document.getElementById('elevationSvg');
    const range = document.getElementById('elevationRange');
    const ends = document.getElementById('elevationEnds');
    if (!svg || pts.length < 2) {
      profileWrap.style.display = 'none';
      return;
    }

    const maxSamples = 140;
    let sample = pts;
    if (pts.length > maxSamples) {
      sample = [];
      for (let i = 0; i < maxSamples; i++) sample.push(pts[Math.round(i * (pts.length - 1) / (maxSamples - 1))]);
    }

    const min = Math.min(...sample.map(p => p.z));
    const max = Math.max(...sample.map(p => p.z));
    const span = Math.max(20, max - min);
    const pad = Math.max(8, span * .08);
    const lo = min - pad, hi = max + pad;
    const x = i => 4 + (i / Math.max(1, sample.length - 1)) * 312;
    const y = z => 68 - ((z - lo) / Math.max(1, hi - lo)) * 62;
    const line = sample.map((p, i) => `${x(i).toFixed(1)},${y(p.z).toFixed(1)}`).join(' ');
    const area = `4,68 ${line} 316,68`;

    svg.innerHTML = `<polygon points="${area}" fill="rgba(23,105,210,.16)"></polygon><polyline points="${line}" fill="none" stroke="currentColor" stroke-width="2.2" vector-effect="non-scaling-stroke" style="color:#1769d2"></polyline>`;
    if (range) range.textContent = `${Math.round(min)}–${Math.round(max)} m`;
    if (ends) ends.innerHTML = `<span>${Math.round(pts[0].z)} m</span><span>${Math.round(pts[pts.length - 1].z)} m</span>`;
    profileWrap.style.display = 'block';
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
    const durationText = fmtDuration(o?.time);
    const up = document.getElementById('routeUp');
    const down = document.getElementById('routeDown');
    const duration = document.getElementById('routeDuration');
    const trackUp = document.getElementById('trackRouteUp');
    const trackDown = document.getElementById('trackRouteDown');
    if (up) up.textContent = upText;
    if (down) down.textContent = downText;
    if (duration) duration.textContent = durationText;
    if (trackUp) trackUp.textContent = upText;
    if (trackDown) trackDown.textContent = downText;
    drawElevationProfile(o?.coords || routeCoords || []);
  };
})();