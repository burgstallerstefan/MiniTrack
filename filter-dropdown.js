(() => {
  const btn = document.getElementById('filterToggle');
  const menu = document.getElementById('filterMenu');
  if (!btn || !menu) return;

  function closeContentMenu() {
    menu.classList.remove('open');
    btn.classList.remove('active');
    btn.setAttribute('aria-expanded','false');
  }

  function closeRouteMode() {
    const other = document.getElementById('routeModeMenu');
    const otherBtn = document.getElementById('routeModeToggle');
    other?.classList.remove('open');
    otherBtn?.classList.remove('active');
    otherBtn?.setAttribute('aria-expanded','false');
  }

  btn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const open = !menu.classList.contains('open');
    closeRouteMode();
    menu.classList.toggle('open',open);
    btn.classList.toggle('active',open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  // Mehrfachauswahl bleibt offen, solange direkt im Menü gewählt wird.
  menu.addEventListener('click', e => e.stopPropagation());
  menu.querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
    closeRouteMode();
    menu.classList.add('open');
    btn.classList.add('active');
    btn.setAttribute('aria-expanded','true');
  }));

  // Außerhalb beider Dropdowns tippen = beide schließen.
  document.addEventListener('pointerdown', e => {
    const routeBtn = document.getElementById('routeModeToggle');
    const routeMenu = document.getElementById('routeModeMenu');
    const target = e.target;
    if (btn.contains(target) || menu.contains(target) || routeBtn?.contains(target) || routeMenu?.contains(target)) return;
    closeContentMenu();
    closeRouteMode();
  }, true);
})();