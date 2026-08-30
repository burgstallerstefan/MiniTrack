(()=>{
  const xml=s=>String(s??'').replace(/[<>&'\"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
  const safeName=s=>(s||'MiniTrack Route').replace(/[\\/:*?"<>|]+/g,'-').trim()||'MiniTrack Route';

  function gpxPoint(tag,c){
    const ele=(Array.isArray(c)&&c.length>2&&Number.isFinite(+c[2]))?`<ele>${+c[2]}</ele>`:'';
    return `<${tag} lat="${+c[1]}" lon="${+c[0]}">${ele}</${tag}>`;
  }

  function downloadGpx(coords,name,kind='route'){
    if(!Array.isArray(coords)||coords.length<2){alert('Keine Strecke zum Speichern vorhanden.');return;}
    const clean=safeName(name);
    const pts=coords.map(c=>gpxPoint('trkpt',c)).join('');
    const type=kind==='track'?'Wandern':'Hiking';
    const gpx=`<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="MiniTrack" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd"><metadata><name>${xml(clean)}</name></metadata><trk><name>${xml(clean)}</name><type>${type}</type><trkseg>${pts}</trkseg></trk></gpx>`;
    const blob=new Blob([gpx],{type:'application/gpx+xml'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=clean+'.gpx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
    const status=document.getElementById('status');if(status)status.textContent='GPX gespeichert – bereit für Uhr/App.';
  }

  const routeBtn=document.getElementById('exportRouteGpx');
  routeBtn?.addEventListener('click',()=>downloadGpx(routeCoords,routeName||'MiniTrack Route','route'));

  const saveBtn=document.getElementById('saveTrack');
  saveBtn?.addEventListener('click',e=>{
    e.preventDefault();e.stopImmediatePropagation();
    downloadGpx(trackPts,routeName?routeName+' – gelaufen':'MiniTrack Tour','track');
  },true);
})();