(() => {
  const routeInfo = document.getElementById('routeInfo');
  if (!routeInfo) return;

  let wrap = document.getElementById('elevationProfileChart');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'elevationProfileChart';
    wrap.style.cssText = 'display:none;margin:7px 0 2px;padding:7px 8px 5px;border:1px solid #e1e1e1;border-radius:10px;background:rgba(248,248,248,.96)';
    wrap.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#666;margin-bottom:3px"><span>Höhenprofil</span><span id="elevationProfileRange">—</span></div><svg id="elevationProfileSvg" viewBox="0 0 320 72" preserveAspectRatio="none" style="display:block;width:100%;height:72px" aria-label="Höhenprofil der Route"></svg><div id="elevationProfileEnds" style="display:flex;justify-content:space-between;font-size:10px;color:#777;margin-top:2px"><span>—</span><span>—</span></div>';
    const pointList = document.getElementById('routePointList');
    routeInfo.insertBefore(wrap, pointList || document.getElementById('routeActions'));
  }

  let lastFingerprint = '';

  function fingerprint(coords) {
    if (!coords?.length) return '';
    const a = coords[0], b = coords[coords.length - 1];
    return `${coords.length}|${a?.[0]}|${a?.[1]}|${a?.[2]}|${b?.[0]}|${b?.[1]}|${b?.[2]}`;
  }

  function draw(coords) {
    const pts = (coords || []).map(c => Number(c?.[2])).filter(Number.isFinite);
    const svg = document.getElementById('elevationProfileSvg');
    const range = document.getElementById('elevationProfileRange');
    const ends = document.getElementById('elevationProfileEnds');
    if (!svg || pts.length < 2) {
      wrap.style.display = 'none';
      return;
    }

    const maxSamples = 140;
    let sample = pts;
    if (pts.length > maxSamples) {
      sample = [];
      for (let i = 0; i < maxSamples; i++) sample.push(pts[Math.round(i * (pts.length - 1) / (maxSamples - 1))]);
    }

    const min = Math.min(...sample), max = Math.max(...sample);
    const span = Math.max(20, max - min);
    const pad = Math.max(8, span * .08);
    const lo = min - pad, hi = max + pad;
    const x = i => 4 + i / Math.max(1, sample.length - 1) * 312;
    const y = z => 68 - (z - lo) / Math.max(1, hi - lo) * 62;
    const line = sample.map((z,i) => `${x(i).toFixed(1)},${y(z).toFixed(1)}`).join(' ');
    const area = `4,68 ${line} 316,68`;

    svg.innerHTML = `<polygon points="${area}" fill="rgba(23,105,210,.16)"></polygon><polyline points="${line}" fill="none" stroke="#1769d2" stroke-width="2.2" vector-effect="non-scaling-stroke"></polyline>`;
    range.textContent = `${Math.round(min)}–${Math.round(max)} m`;
    ends.innerHTML = `<span>${Math.round(pts[0])} m</span><span>${Math.round(pts[pts.length - 1])} m</span>`;
    wrap.style.display = 'block';
  }

  function sync() {
    const coords = window.routeCoords || (typeof routeCoords !== 'undefined' ? routeCoords : null);
    if (!coords?.length) {
      lastFingerprint = '';
      wrap.style.display = 'none';
      return;
    }
    const f = fingerprint(coords);
    if (f === lastFingerprint) return;
    lastFingerprint = f;
    draw(coords);
  }

  setInterval(sync, 350);
  document.addEventListener('minitrack:activitychange', () => setTimeout(sync, 500));
  sync();
})();