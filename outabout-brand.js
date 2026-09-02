(() => {
  document.title = 'Outabout';

  // Neue öffentliche Namen. Alte MiniTrack-Namen bleiben als Kompatibilitätsalias,
  // damit bestehende Module und alte lokale Daten nicht plötzlich brechen.
  if (window.MiniTrackActivity && !window.OutaboutActivity) window.OutaboutActivity = window.MiniTrackActivity;
  if (window.MiniTrackPlanner && !window.OutaboutPlanner) window.OutaboutPlanner = window.MiniTrackPlanner;

  try {
    if (!Object.getOwnPropertyDescriptor(window, 'outaboutTerrain3D')) {
      Object.defineProperty(window, 'outaboutTerrain3D', {
        configurable: true,
        get: () => !!window.miniTrackTerrain3D,
        set: v => { window.miniTrackTerrain3D = !!v; }
      });
    }
  } catch {}

  function rebrandText(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (node.nodeValue?.includes('MiniTrack')) node.nodeValue = node.nodeValue.replaceAll('MiniTrack','Outabout');
    });
  }

  rebrandText(document.body);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') rebrandText(record.target.parentNode);
      record.addedNodes?.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          if (node.nodeValue?.includes('MiniTrack')) node.nodeValue = node.nodeValue.replaceAll('MiniTrack','Outabout');
        } else if (node.nodeType === Node.ELEMENT_NODE) rebrandText(node);
      });
    }
  }).observe(document.body,{subtree:true,childList:true,characterData:true});
})();
