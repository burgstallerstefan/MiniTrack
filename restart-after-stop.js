(() => {
  const stopBtn = document.getElementById('stopTrack');
  const actions = document.getElementById('trackActions');
  const startBtn = document.getElementById('startRoute');
  if (!stopBtn || !actions || !startBtn) return;

  let restartBtn = document.getElementById('restartTrack');
  if (!restartBtn) {
    restartBtn = document.createElement('button');
    restartBtn.id = 'restartTrack';
    restartBtn.className = 'good';
    restartBtn.textContent = '▶ Wieder starten';
    restartBtn.style.display = 'none';
    actions.appendChild(restartBtn);
  }

  stopBtn.addEventListener('click', () => {
    setTimeout(() => {
      if (tracking) return;
      restartBtn.style.display = Array.isArray(routeCoords) && routeCoords.length > 1 ? 'block' : 'none';
    }, 0);
  });

  restartBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    restartBtn.style.display = 'none';
    startBtn.click();
  });

  startBtn.addEventListener('click', () => {
    restartBtn.style.display = 'none';
  });
})();
