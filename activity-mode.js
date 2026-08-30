(() => {
  const MODES = {
    wandern: {label:'Wandern', profile:'hiking-mountain', tiles:'hiking', wayLabel:'Wanderwege'},
    alpin: {label:'Alpin', profile:'hiking-mountain', tiles:'hiking', wayLabel:'Alpine Wege'},
    rennrad: {label:'Rennrad', profile:'fastbike', tiles:'cycling', wayLabel:'Radrouten'},
    mtb: {label:'Mountainbike', profile:'mtb', tiles:'mtb', wayLabel:'MTB-Routen'},
    spazieren: {label:'Spazieren', profile:'hiking-mountain', tiles:'hiking', wayLabel:'Spazierwege'}
  };

  let current = 'wandern';
  window.MiniTrackActivity = {
    get key(){ return current; },
    get config(){ return MODES[current]; },
    get profile(){ return MODES[current].profile; }
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      if (raw && raw.includes('brouter.de/brouter')) {
        const u = new URL(raw, location.href);
        u.searchParams.set('profile', MODES[current].profile);
        if (typeof input === 'string') return nativeFetch(u.toString(), init);
        return nativeFetch(new Request(u.toString(), input), init);
      }
    } catch {}
    return nativeFetch(input, init);
  };

  const style = document.createElement('style');
  style.textContent = `
    #routeModeToggle{min-height:44px;background:rgba(255,255,255,.97);color:#222;border:1px solid #ccc;border-radius:13px;box-shadow:0 2px 8px rgba(0,0,0,.15);padding:0 14px}
    #routeModeToggle.active{background:#222;color:#fff}
    #routeModeMenu{display:none;position:absolute;left:0;top:50px;min-width:245px;background:rgba(255,255,255,.98);border:1px solid #ddd;border-radius:14px;padding:7px;box-shadow:0 5px 18px rgba(0,0,0,.22);z-index:4}
    #routeModeMenu.open{display:grid;gap:2px}
    .routeModeOption{display:grid;grid-template-columns:26px 1fr;align-items:center;min-height:42px;padding:0 8px;border-radius:9px;font-size:14px;background:#fff}
    .routeModeOption input{margin:0}
  `;
  document.head.appendChild(style);

  const filters = document.getElementById('filters');
  if (!filters) return;

  const btn = document.createElement('button');
  btn.id = 'routeModeToggle';
  btn.type = 'button';
  btn.textContent = 'Wandern ▾';
  btn.setAttribute('aria-expanded','false');

  const menu = document.createElement('div');
  menu.id = 'routeModeMenu';
  Object.entries(MODES).forEach(([key,m]) => {
    const label = document.createElement('label');
    label.className = 'routeModeOption';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'routeMode';
    radio.value = key;
    radio.checked = key === current;
    const text = document.createElement('span');
    text.textContent = m.label;
    label.append(radio,text);
    menu.appendChild(label);
  });
  filters.append(btn,menu);

  function closeContentMenu() {
    const other = document.getElementById('filterMenu');
    const otherBtn = document.getElementById('filterToggle');
    other?.classList.remove('open');
    otherBtn?.classList.remove('active');
    otherBtn?.setAttribute('aria-expanded','false');
  }

  function updateWayLabel() {
    const row = document.querySelector('#routesChk')?.closest('label');
    const spans = row ? row.querySelectorAll('span') : [];
    if (spans.length) spans[spans.length-1].textContent = MODES[current].wayLabel;
  }

  function updateWayTiles() {
    if (!map?.loaded?.()) return;
    const cfg = MODES[current];
    const url = `https://tile.waymarkedtrails.org/${cfg.tiles}/{z}/{x}/{y}.png`;
    const src = map.getSource('hiking');
    try {
      if (src?.setTiles) src.setTiles([url]);
      else {
        const visible = document.getElementById('routesChk')?.checked !== false;
        if (map.getLayer('hiking')) map.removeLayer('hiking');
        if (map.getSource('hiking')) map.removeSource('hiking');
        map.addSource('hiking',{type:'raster',tiles:[url],tileSize:256});
        map.addLayer({id:'hiking',type:'raster',source:'hiking',layout:{visibility:visible?'visible':'none'},paint:{'raster-opacity':.78}});
      }
    } catch {}
  }

  function applyMode(key) {
    if (!MODES[key]) return;
    current = key;
    const cfg = MODES[key];
    btn.textContent = `${cfg.label} ▾`;
    updateWayLabel();
    updateWayTiles();
    document.dispatchEvent(new CustomEvent('minitrack:activitychange',{detail:{key,...cfg}}));
    const s = document.getElementById('status');
    if (s) s.textContent = `${cfg.label} aktiv · passende Wege geladen.`;
  }

  btn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const open = !menu.classList.contains('open');
    closeContentMenu();
    menu.classList.toggle('open',open);
    btn.classList.toggle('active',open);
    btn.setAttribute('aria-expanded',String(open));
  });

  menu.addEventListener('click', e => e.stopPropagation());
  menu.addEventListener('change', e => {
    if (e.target?.name !== 'routeMode') return;
    applyMode(e.target.value);
    menu.classList.remove('open');
    btn.classList.remove('active');
    btn.setAttribute('aria-expanded','false');
  });

  map.on('load',()=>{ updateWayLabel(); updateWayTiles(); });
})();