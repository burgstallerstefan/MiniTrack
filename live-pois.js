(() => {
  let poiRequestSeq = 0;
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  function bboxString() {
    const b = map.getBounds();
    return `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
  }

  function selectedClauses(bbox) {
    const parts = [];
    if ($('almsChk')?.checked) {
      parts.push(`nwr["place"="locality"]["name"~"(alm|alpe)",i](${bbox});`);
      parts.push(`nwr["name"~"(alm|alpe)",i]["tourism"](${bbox});`);
      parts.push(`nwr["name"~"(alm|alpe)",i]["amenity"](${bbox});`);
    }
    if ($('hutsChk')?.checked) {
      parts.push(`nwr["tourism"~"^(alpine_hut|wilderness_hut)$"](${bbox});`);
    }
    if ($('foodChk')?.checked) {
      parts.push(`nwr["amenity"~"^(restaurant|cafe|fast_food|bar|biergarten)$"]["name"~"(alm|alpe|hütte|huette|berg|jausen)",i](${bbox});`);
    }
    if ($('peaksChk')?.checked) {
      parts.push(`nwr["natural"="peak"]["name"](${bbox});`);
    }
    return parts;
  }

  function categoryFor(tags = {}) {
    const name = tags.name || tags['name:de'] || '';
    if (tags.natural === 'peak') return ['peaks', 'Gipfel'];
    if (tags.tourism === 'alpine_hut' || tags.tourism === 'wilderness_hut') return ['huts', 'Hütte'];
    if (tags.amenity && /^(restaurant|cafe|fast_food|bar|biergarten)$/.test(tags.amenity) && /(alm|alpe|hütte|huette|berg|jausen)/i.test(name)) return ['food', 'Berggasthaus / Einkehr'];
    if ((tags.place === 'locality' || tags.tourism || tags.amenity) && /(alm|alpe)/i.test(name)) return ['alms', 'Alm / Alpe'];
    return null;
  }

  function coordFor(el) {
    if (Number.isFinite(el.lon) && Number.isFinite(el.lat)) return [el.lon, el.lat];
    if (el.center && Number.isFinite(el.center.lon) && Number.isFinite(el.center.lat)) return [el.center.lon, el.center.lat];
    return null;
  }

  async function fetchOverpass(query) {
    let lastError;
    for (const endpoint of endpoints) {
      try {
        const url = endpoint + '?data=' + encodeURIComponent(query);
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.json();
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('Overpass nicht erreichbar');
  }

  async function loadAllVisiblePois() {
    const seq = ++poiRequestSeq;
    const clauses = selectedClauses(bboxString());
    Object.keys(markers).forEach(clearMarkers);
    if (!clauses.length) {
      if (!tracking && !planning) $('status').textContent = 'Keine POI-Kategorie ausgewählt.';
      return;
    }

    if (!tracking && !planning) $('status').textContent = 'Lade alle ausgewählten Ziele …';
    const query = `[out:json][timeout:25];(${clauses.join('')});out center tags;`;
    try {
      const data = await fetchOverpass(query);
      if (seq !== poiRequestSeq) return;
      const seen = new Set();
      for (const el of data.elements || []) {
        const tags = el.tags || {};
        const cat = categoryFor(tags);
        const c = coordFor(el);
        const name = tags.name || tags['name:de'] || 'Ohne Namen';
        if (!cat || !c) continue;
        addPoi(cat[0], cat[1], name, c, seen);
      }
      if (!tracking && !planning) {
        const parts = [];
        if ($('almsChk')?.checked) parts.push(`${markers.alms.length} Almen`);
        if ($('hutsChk')?.checked) parts.push(`${markers.huts.length} Hütten`);
        if ($('foodChk')?.checked) parts.push(`${markers.food.length} Einkehr`);
        if ($('peaksChk')?.checked) parts.push(`${markers.peaks.length} Gipfel`);
        $('status').textContent = parts.join(' · ') || 'Keine Ziele ausgewählt.';
      }
    } catch (e) {
      if (seq !== poiRequestSeq) return;
      if (!tracking && !planning) $('status').textContent = 'Live-Ziele konnten gerade nicht geladen werden.';
    }
  }

  updatePois = loadAllVisiblePois;

  ['almsChk','hutsChk','foodChk','peaksChk'].forEach(id => {
    $(id)?.addEventListener('change', () => {
      clearTimeout(poiRefreshTimer);
      poiRefreshTimer = setTimeout(loadAllVisiblePois, 80);
    });
  });

  map.on('moveend', () => {
    clearTimeout(poiRefreshTimer);
    poiRefreshTimer = setTimeout(loadAllVisiblePois, 180);
  });

  if (map.loaded()) loadAllVisiblePois();
  else map.once('load', loadAllVisiblePois);
})();