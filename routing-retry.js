(() => {
  if (typeof calculateRoutes !== 'function') return;
  const original = calculateRoutes;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function setBusy() {
    const ids = ['routeRemain','routeUp','routeDown'];
    ids.forEach(id => { const el=document.getElementById(id); if(el) el.textContent='…'; });
    const s=document.getElementById('status'); if(s) s.textContent='Berechne Wanderroute …';
  }

  function calcDown(coords=[]) {
    let down=0;
    for(let i=1;i<coords.length;i++) {
      if(coords[i-1]?.length>2 && coords[i]?.length>2) {
        const dz=Number(coords[i-1][2])-Number(coords[i][2]);
        if(Number.isFinite(dz) && dz>0) down+=dz;
      }
    }
    return down;
  }

  function showMetrics(o) {
    if(!o) return;
    const dist=document.getElementById('routeRemain');
    const up=document.getElementById('routeUp');
    const down=document.getElementById('routeDown');
    if(dist && Number.isFinite(+o.dist)) dist.textContent=(+o.dist).toFixed(1)+' km';
    if(up && Number.isFinite(+o.up)) up.textContent=Math.round(+o.up)+' hm';
    const d=Number.isFinite(+o.down)?+o.down:calcDown(o.coords);
    if(down) down.textContent=Math.round(d||0)+' hm';
  }

  async function fetchLeg(a,b) {
    const ctl=new AbortController();
    const t=setTimeout(()=>ctl.abort(),12000);
    try {
      const lonlats=`${a[0]},${a[1]}|${b[0]},${b[1]}`;
      const url='https://brouter.de/brouter?lonlats='+encodeURIComponent(lonlats)+'&profile=trekking&alternativeidx=0&format=geojson';
      const r=await fetch(url,{signal:ctl.signal,cache:'no-store'});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const d=await r.json();
      const f=d.type==='FeatureCollection'?d.features?.[0]:d;
      if(!f?.geometry?.coordinates?.length) throw new Error('empty');
      return routeStats(f);
    } finally { clearTimeout(t); }
  }

  async function perLeg(points,baseName) {
    const legs=[];
    for(let i=1;i<points.length;i++) legs.push(await fetchLeg(points[i-1],points[i]));
    const coords=[];
    let dist=0,up=0,down=0;
    for(const leg of legs) {
      const c=leg.coords||[];
      coords.push(...(coords.length?c.slice(1):c));
      dist+=Number(leg.dist)||0;
      up+=Number(leg.up)||0;
      down+=Number.isFinite(+leg.down)?+leg.down:calcDown(c);
    }
    const remDist=new Array(coords.length).fill(0),remUp=new Array(coords.length).fill(0);
    for(let i=coords.length-2;i>=0;i--) {
      remDist[i]=remDist[i+1]+geoKm({lat:coords[i][1],lng:coords[i][0]},{lat:coords[i+1][1],lng:coords[i+1][0]});
      let dz=0;
      if(coords[i].length>2&&coords[i+1].length>2) {
        const z=+coords[i+1][2]-+coords[i][2]; if(Number.isFinite(z)&&z>0) dz=z;
      }
      remUp[i]=remUp[i+1]+dz;
    }
    const o={coords,dist,up,down,remDist,remUp,effort:dist+up/120,time:dist/5+up/600,brouterIndex:0,fingerprint:routeFingerprint(coords)};
    routeOptions=[o]; routeBaseName=baseName; selectedRouteIndex=0; routeCoords=coords; routeName=baseName;
    showRoute(false); updateRouteInfo(o); document.getElementById('routeInfo').style.display='block';
    document.getElementById('startRoute').disabled=false;
    return o;
  }

  calculateRoutes = async function(points,baseName) {
    setBusy();
    try {
      const o=await original(points,baseName);
      showMetrics(o);
      return o;
    } catch(e) {
      if(e?.name==='AbortError') throw e;
      await sleep(450);
      try {
        const o=await original(points,baseName);
        showMetrics(o);
        return o;
      } catch(e2) {
        if(e2?.name==='AbortError') throw e2;
        const s=document.getElementById('status'); if(s) s.textContent='Berechne Teilstrecken …';
        const o=await perLeg(points,baseName);
        showMetrics(o);
        if(s) s.textContent='Route berechnet.';
        return o;
      }
    }
  };
})();