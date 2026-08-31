(() => {
  // Routenpunkte auf der Karte nur antippbar, nicht ziehbar.
  document.addEventListener('pointerdown', e => {
    const marker = e.target?.closest?.('.maplibregl-marker');
    if (!marker || marker.classList.contains('poi-marker')) return;
    const label = marker.textContent?.trim() || '';
    if (!/^\d+$/.test(label)) return;
    e.stopImmediatePropagation();
  }, true);
})();
