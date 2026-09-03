(() => {
  "use strict";

  const app = window.Outabout;

  function pointFromElement(element) {
    const lat = Number(element.getAttribute("lat"));
    const lng = Number(element.getAttribute("lon"));
    if (!app.util.validCoord([lng, lat])) return null;
    const elevation = Number(
      element.querySelector(":scope > ele")?.textContent,
    );
    return Number.isFinite(elevation) ? [lng, lat, elevation] : [lng, lat];
  }

  function trackPoints(xml) {
    const selectors = ["trk trkseg trkpt", "rte rtept", "wpt"];
    for (const selector of selectors) {
      const points = [...xml.querySelectorAll(selector)]
        .map(pointFromElement)
        .filter(Boolean);
      if (points.length >= 2) return points;
    }
    return [];
  }

  function gpxName(xml, fallback) {
    return (
      xml
        .querySelector("metadata > name, trk > name, rte > name")
        ?.textContent?.trim() || fallback.replace(/\.gpx$/i, "")
    );
  }

  function parseGpx(text, filename) {
    const xml = new DOMParser().parseFromString(text, "application/xml");
    if (xml.querySelector("parsererror"))
      throw new Error("Ungültige GPX-Datei");
    const coords = trackPoints(xml);
    if (coords.length < 2)
      throw new Error(
        "Die GPX-Datei enthält keine Strecke mit mindestens zwei Punkten.",
      );
    return { coords, name: gpxName(xml, filename) };
  }

  async function importGpx(file) {
    if (!file) return;
    try {
      const parsed = parseGpx(await file.text(), file.name || "GPX-Route");
      if (!app.planner?.importGpxTrack(parsed.coords, parsed))
        throw new Error("GPX-Strecke konnte nicht übernommen werden.");
    } catch (error) {
      app.log("gpx:import", error, { name: file.name });
      app.setStatus(error.message || "GPX-Import fehlgeschlagen.", "error");
    }
  }

  const input = app.el("gpxImportInput");
  app.el("gpxImportBtn")?.addEventListener("click", () => {
    if (!input) return;
    input.value = "";
    input.click();
  });
  input?.addEventListener("change", () => importGpx(input.files?.[0]));
})();
