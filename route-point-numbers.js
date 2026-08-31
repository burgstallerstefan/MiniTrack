(() => {
  function syncPointNumbers() {
    const rows = [...document.querySelectorAll('#routePointList .route-order-row')];
    if (!rows.length) return;

    // Liste: nur 1, 2, 3 ... und neutrale Standardnamen.
    rows.forEach((row, i) => {
      const badge = row.children?.[1];
      if (badge) badge.textContent = String(i + 1);
      const info = row.children?.[2];
      const name = info?.children?.[0];
      const type = info?.children?.[1]?.textContent?.trim() || '';
      if (name) {
        const raw = name.textContent.trim();
        if ((raw === 'Start' || raw === 'Ziel' || /^Wegpunkt \d+$/.test(raw)) && !type) name.textContent = `Punkt ${i + 1}`;
        if (raw === 'Start' && type === 'Aktueller Standort') name.textContent = 'Aktueller Standort';
      }
    });

    // Kartenmarker: die direkten Routenpunkte anhand der bisherigen S/Z/Zahlen sammeln
    // und in derselben Routenreihenfolge auf 1..N umstellen.
    const candidates = [...document.querySelectorAll('.maplibregl-marker')].filter(el => {
      if (el.classList.contains('poi-marker')) return false;
      const t = el.textContent?.trim() || '';
      return t === 'S' || t === 'Z' || /^\d+$/.test(t);
    });

    if (candidates.length >= rows.length) {
      const routeMarkers = candidates.slice(-rows.length);
      routeMarkers.forEach((el, i) => {
        el.textContent = String(i + 1);
        el.dataset.routePointIndex = String(i);
      });
    }
  }

  const list = document.getElementById('routePointList');
  if (list) new MutationObserver(syncPointNumbers).observe(list, {childList:true,subtree:true,characterData:true});
  new MutationObserver(syncPointNumbers).observe(document.body, {childList:true,subtree:true});
  document.addEventListener('minitrack:activitychange', syncPointNumbers);
  setInterval(syncPointNumbers, 500);
  syncPointNumbers();
})();
