(() => {
  const grid = document.querySelector('#routeInfo .routegrid');
  if (!grid) return;

  let box = document.getElementById('routeDuration');
  if (!box) {
    const span = document.createElement('span');
    span.innerHTML = 'Dauer<b id="routeDuration">—</b>';
    grid.appendChild(span);
    box = document.getElementById('routeDuration');
  }
  grid.style.gridTemplateColumns = 'repeat(4,minmax(0,1fr))';

  function format(hours) {
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0) return '—';
    const mins = Math.max(1, Math.round(h * 60));
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    if (!hh) return `${mm} min`;
    return mm ? `${hh} h ${mm} min` : `${hh} h`;
  }

  const previous = updateRouteInfo;
  updateRouteInfo = function(o) {
    previous(o);
    const el = document.getElementById('routeDuration');
    if (el) el.textContent = format(o?.time);
  };

  const current = routeOptions?.[selectedRouteIndex];
  if (current && box) box.textContent = format(current.time);
})();