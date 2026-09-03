# Outabout – technischer Audit vor der Konsolidierung

Stand: 3. September 2026

## Aktive Architektur vor dem Refactoring

Die Anwendung ist eine statische GitHub-Pages-App ohne Build-Schritt. `index.html` lädt MapLibre von unpkg und danach 26 lokale JavaScript-Dateien als klassische Scripts. `minitrack.js` erzeugt Karte, globalen Zustand, POIs, Routing, Planung, Navigation, Tracking und Suche. Fast alle späteren Dateien greifen auf dessen implizite Globals zu oder ersetzen dessen Funktionen zur Laufzeit.

Aktive Reihenfolge und Aufgabe:

| Datei                          | Aufgabe vor dem Refactoring                           | Auffälligkeit                                                                  |
| ------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `minitrack.js`                 | Karte, Basisschichten, POIs, Routing, Tracking, Suche | Monolith; festes `profile=trekking`; namensbasierte POI-Klassifikation         |
| `elevation-ui.js`              | Höhenwerte, Dauer, Profil                             | ersetzt `routeStats` und `updateRouteInfo`                                     |
| `live-pois.js`                 | POIs aus Vektorkacheln                                | ersetzt `visible`, `addPoi`, `updatePois`; eigener localStorage-Cache          |
| `layers.js`                    | Karten-/Topo-/Satellitenbasis                         | eigenständige, brauchbare Funktion                                             |
| `terrain.js`                   | Gelände, Hillshade, 3D-Gebäude                        | globale Legacy-Aliase und wiederholte Style-Reparatur                          |
| `activity-mode.js`             | Aktivitätsauswahl und BRouter-Profil                  | doppelte Legacy-/Outabout-Events und globale API                               |
| `route-persistence-preload.js` | stellt Route vor Planner-Start per Hash bereit        | zusätzlicher Session-/Hash-Zwischenzustand                                     |
| `share-preload.js`             | wandelt kompakten Share-Hash in Legacy-Hash um        | zweite Share-Dekodierung                                                       |
| `brouter-response-guard.js`    | Plausibilitätsprüfung                                 | ersetzt global `window.fetch`; erfolgreiche Antworten werden künstlich geleert |
| `direct-plan.js`               | aktuelle Punkt-/Segmentplanung                        | ersetzt `calculateRoutes`; jeder Segmentfehler wird Fallback                   |
| `route-line-drag.js`           | Zwischenpunkt-/Punktbearbeitung                       | Doppelklick statt direktem Linienziehen; DOM-/private Source-Abhängigkeit      |
| `route-persistence.js`         | localStorage-Persistenz                               | liest Koordinaten aus projizierten DOM-Markern und Metadaten aus Listen-DOM    |
| `route-ui-fix.js`              | UI/Pfeile                                             | ersetzt `arrowFeatures`; MutationObserver auf Titel                            |
| `poi-popup-fix.js`             | POI-Popup-Aktionen                                    | MutationObserver und Koordinatenrückrechnung aus DOM                           |
| `route-point-popup.js`         | Routenpunkt-Popup                                     | globaler Capture-Listener; liest Punktdaten aus DOM                            |
| `route-point-behavior.js`      | Punktnormalisierung/Blanko-Popup                      | überschneidet sich mit Listen- und Popup-Modulen; Observer plus Polling        |
| `filter-dropdown.js`           | Karteninhalt-Menü                                     | eigenständige UI-Funktion                                                      |
| `route-list-collapse.js`       | Routendetails einklappen                              | weiterer Listen-Observer und wiederholte Inline-Styles                         |
| `route-share-button.js`        | Share-Button                                          | beobachtet später ein abgetrenntes Element                                     |
| `duration-ui.js`               | Routendauer                                           | ersetzt `updateRouteInfo` ein weiteres Mal                                     |
| `nav-mode.js`                  | Kamera und Positionspfeil                             | versucht global `geolocation.watchPosition` zu ersetzen                        |
| `nav-arrow-filter.js`          | Pfeile während Navigation                             | zusätzlicher 700-ms-Timer                                                      |
| `route-tools.js`               | kompakter Share-Link, Route zentrieren                | klont Share-Button und entfernt damit vorhandene Listener/Observer             |
| `restart-after-stop.js`        | Neustart nach Stop                                    | zusätzlicher Start-/Stop-Listener und Timeout                                  |
| `gpx-export.js`                | GPX-Export                                            | fängt den vorhandenen Save-Listener nachträglich ab                            |
| `outabout-brand.js`            | Laufzeit-Rebranding                                   | beobachtet den gesamten DOM-Baum und ersetzt Text nachträglich                 |

Bereits nicht geladen und damit verwaist: `elevation-profile.js`, `route-arrow-fix.js`, `route-marker-lock.js`, `route-marker-preload.js`, `route-performance.js`, `route-point-numbers.js`.

## Gefundene Risiken und Fehler

1. Es existieren drei Routing-Pipelines: die ursprüngliche Mehrpunkt-/Alternativenberechnung, `route-performance.js` (verwaist) und die aktive segmentweise Berechnung in `direct-plan.js`.
2. Die aktive Segmentberechnung behandelt jeden Fehler außer `AbortError` als fachlich nicht routbar. Netzwerk-, Timeout-, HTTP-, Server- und JSON-Fehler werden deshalb falsch grau/gestrichelt angezeigt.
3. Der globale Fetch-Guard kann reguläre 200-Antworten in leere FeatureCollections umwandeln. Der Aufrufer kann nicht mehr zwischen fachlichem und technischem Fehler unterscheiden.
4. Aktivitätsprofile werden nur in der letzten Routing-Überschreibung berücksichtigt; ältere aktive Funktionen enthalten weiterhin hartes `trekking`.
5. Der Cache-Schlüssel von `route-performance.js` enthält kein Aktivitätsprofil. Die Datei ist aktuell verwaist, wäre bei Reaktivierung aber fehlerhaft.
6. `routeCoords` enthält geroutete und lineare Fallbacks ohne dauerhafte Segmentgrenzen. Nachgelagerte Navigation kann dadurch einen Fallback nicht sicher erkennen.
7. Linienbearbeitung erfüllt Touch-Ziehen nicht: Ein Doppelklick erzeugt zuerst einen Punkt, anschließend wird ein MapLibre-Marker draggable. Auf Android gibt es keinen gleichwertigen direkten Griff auf die Linie.
8. Punktzustand ist auf JavaScript-Arrays, DOM-Zeilen und Marker verteilt. Persistenz und Popups lesen teils aus dem DOM zurück; das begünstigt stale state und falsche Koordinaten während Kartenbewegungen.
9. Share-Logik existiert in `direct-plan.js`, `share-preload.js`, `route-share-button.js` und `route-tools.js`. Der letzte Code klont den Button; vorherige Referenzen aktualisieren danach ein abgetrenntes Element.
10. Punktnormalisierung läuft in mehreren MutationObservern sowie in der verwaisten Datei zusätzlich per Intervall. Änderungen können weitere Mutationen auslösen.
11. POI-Popups werden erst erzeugt und danach von einem Body-MutationObserver umgebaut. Die dazugehörige Position wird aus der Bildschirmposition des zuletzt geklickten Markers zurückgerechnet.
12. Das Basisscript kategorisiert POIs anhand von Namensbestandteilen. Ein späterer Override korrigiert dies zwar, der falsche Code bleibt aber aktiv vorhanden und ist lade­reihenfolgeabhängig.
13. POIs werden als tausende DOM-Marker aufgebaut und bis zu 5.000 Einträge in localStorage dupliziert. Das ist für mobile Geräte unnötig teuer.
14. `nav-mode.js` versucht eine Browser-API zu überschreiben. Gleichzeitig aktualisieren das Basisscript, ein Start-Listener und ein periodischer Pfeilfilter die Navigation.
15. Zahlreiche Catch-Blöcke verschlucken Fehler vollständig. Reale Style-, Storage- oder Kartenfehler sind dadurch kaum diagnostizierbar.
16. Das Rebranding erfolgt zuletzt über einen Observer des gesamten Body statt über Quelltext und Datenmodell.
17. Cache-Busting besteht aus vielen voneinander abweichenden Versionsparametern; Cache-Metadaten im HTML sind für Subressourcen kein verlässlicher Ersatz für konsistente Versionierung.
18. `index.html` und CSS enthalten alte, versteckte Start-/Ziel-Planer-UI sowie viele Inline-Styles und tote Selektoren.

## Refactoring-Reihenfolge

1. Eine zentrale `Outabout`-Runtime mit explizitem State, Events, Map-Referenz, Hilfsfunktionen und Fehlerprotokollierung einführen.
2. Aktivität, Planner/Routing, POIs/Popups, Navigation/Tracking und Kartensteuerung in klar zuständige Module überführen.
3. Segmentrouting mit typisierten Fehlern implementieren: Nur explizite BRouter-No-Route-Antworten erzeugen einen linearen Fallback; technische Fehler lassen die letzte gültige Route stehen.
4. Punkte, Metadaten, Segmente und Marker ausschließlich aus dem Planner-State rendern. Persistenz und Sharing lesen direkt aus diesem State.
5. Direkte Pointer-Bearbeitung der Segmentlinie mit Pointer-Capture und temporär deaktiviertem Map-Drag implementieren; keine parallelen Touch-/Click-Pfade.
6. Popup-Inhalte beim Erzeugen zusammensetzen; keine MutationObserver zur nachträglichen Reparatur.
7. Navigation aus denselben Segmentdaten ableiten und auf Fallback-Segmenten keine Pfeile erzeugen.
8. Medienindex in IndexedDB, lokale FileSystemHandles, Worker-basierte Metadatenanalyse, Clusterquelle und Punktverknüpfung ergänzen.
9. Erst wenn alle Aufgaben übernommen sind, die alten Patch-Dateien entfernen und `index.html` auf die neue eindeutige Ladefolge umstellen.

## Zielarchitektur

- `app.js`: Namespace, State/Event-Bus, Map, Utilities und Grundinitialisierung
- `activity.js`: sechs Aktivitätsmodi und Kartenoverlay
- `planner.js`: Punkte, Routing, Segmentdarstellung/-bearbeitung, Statistik, Persistenz, Sharing, GPX
- `pois.js`: tagbasierte POIs, Suche und gemeinsame Popup-Erzeugung
- `navigation.js`: GPS, Follow/North-up, Tracking, Richtung und Neustart
- `map-controls.js`: Basiskarten, 3D-Gelände und Menüs
- `media.js`: Import, IndexedDB, lokale Referenzen, Filter, Cluster, Popups und Punktmedien
- `media-worker.js`: EXIF-/ISO-6709-/QuickTime-Metadatenanalyse in Batches außerhalb des UI-Threads

Die Anwendung bleibt ohne Backend, ohne Framework und ohne Build-Schritt als statische GitHub-Pages-App betreibbar.
