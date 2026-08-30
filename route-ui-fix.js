(() => {
  const actions = document.getElementById('routeActions');
  const add = document.getElementById('addRoutePoint');
  // Der Planer braucht diesen Knopf intern weiterhin; für den Benutzer bleibt er unsichtbar.
  if (add) {
    add.style.display = 'none';
    add.setAttribute('aria-hidden','true');
  }

  let save = document.getElementById('exportRouteGpx');
  if (!save && actions) {
    save = document.createElement('button');
    save.id = 'exportRouteGpx';
    save.className = 'secondary';
    const start = document.getElementById('startRoute');
    actions.insertBefore(save, start || actions.firstChild);
  }
  if (save) save.textContent = 'Speichern';
})();