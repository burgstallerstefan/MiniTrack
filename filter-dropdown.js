(() => {
  const btn = document.getElementById('filterToggle');
  const menu = document.getElementById('filterMenu');
  if (!btn || !menu) return;

  btn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const open = menu.classList.toggle('open');
    btn.classList.toggle('active', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  // Absichtlich NICHT bei Auswahl schließen.
  menu.addEventListener('click', e => e.stopPropagation());
  menu.querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
    menu.classList.add('open');
    btn.classList.add('active');
    btn.setAttribute('aria-expanded','true');
  }));
})();