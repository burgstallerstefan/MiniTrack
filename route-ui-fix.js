(() => {
  const actions = document.getElementById('routeActions');
  const add = document.getElementById('addRoutePoint');
  if (add) add.remove();

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