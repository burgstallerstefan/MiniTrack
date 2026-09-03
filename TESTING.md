# Outabout – Test- und Abnahmeprotokoll

Stand: 3. September 2026

## Automatisch geprüft

- Syntaxprüfung aller sieben aktiven JavaScript-Module und des Media-Workers
- siebzehn Node-Tests für Script-Inventar, Architekturregeln, sechs Aktivitäten, Share-Kompatibilität, Persistenzmigration sowie EXIF-, XMP-, HEIC- und QuickTime-/MP4-GPS-Metadaten
- HTML-Validierung und Prettier-Formatprüfung
- alle lokalen Seitenressourcen über einen statischen HTTP-Server mit HTTP 200 erreichbar
- MapLibre 5.21.1, OpenFreeMap und BRouter erreichbar
- alle verwendeten BRouter-Profile mit realen Beispielrouten geprüft; `profile:allow_steps=0` für Spazieren liefert eine gültige Route
- BRouter-Fehlerklassifikation im Code geprüft: nur explizite No-Route-Antworten erzeugen lineare Fallback-Segmente

Kommandos:

```powershell
npm test
npm run check
npx html-validate index.html
npx prettier --check index.html styles.css *.js tests/*.cjs
```

## Manuelle Browser-Abnahme

- [ ] Drei normale Punkte anlegen, Aktivität ändern, neu laden: Punkte, Reihenfolge, Metadaten und Aktivität bleiben erhalten; Route wird neu berechnet.
- [ ] Nur einen Punkt speichern und neu laden: Punkt und Liste bleiben sichtbar, Route/Statistik nicht.
- [ ] Route löschen und neu laden: Route bleibt gelöscht.
- [ ] Einen Share-Link bei abweichender lokal gespeicherter Route öffnen: Share-Link gewinnt und die Punktliste startet eingeklappt.
- [ ] Share-Link mit Umlaut, Backslash und den Zeichenfolgen `\r`/`\f` in Punktnamen testen.
- [ ] Mindestens sieben Punkte anlegen; Linie zwischen 6 und 7 ziehen: neuer Punkt wird 7, alter Punkt wird 8 und beide angrenzenden Segmente werden neu berechnet.
- [ ] Dasselbe Ziehen auf einem grauen Fallback-Segment wiederholen.
- [ ] Explizit nicht routbaren Abschnitt testen: ausschließlich dieses Segment und seine angrenzenden Marker sind grau/gestrichelt.
- [ ] BRouter offline, Timeout und HTTP-/JSON-Fehler simulieren: Fehlermeldung erscheint, kein falsches Fallback; eine bisher gültige Route bleibt beim reinen Aktivitätswechsel sichtbar und korrekt beschriftet.
- [ ] Wandern, Alpin, Rennrad, Gravel, MTB und Spazieren nacheinander auswählen und im Netzwerk-Panel Profil plus Profilparameter kontrollieren.
- [ ] Punktreihenfolge am Griff umsortieren; Marker selbst lassen sich nicht frei ziehen.
- [ ] Marker-/POI-/freien Kartenpunkt öffnen: Anhängen, Löschen, Google Maps und Medien funktionieren passend zum Punkt.
- [ ] Navigation starten, Follow und North-up testen, Hin-/Rückweg prüfen; keine Pfeile auf Fallbacks oder doppelte zukünftige Rückwegpfeile; Stop zeigt wieder den normalen Standort und erlaubt Neustart.
- [ ] GPX exportieren und den Track in einem GPX-Viewer öffnen.

## Manuelle Medien-Abnahme

- [ ] Ordner mit mindestens 100, danach möglichst 1.000+ Dateien importieren; Fortschritt bleibt sichtbar und die UI reagiert weiter.
- [ ] Ergebniszähler für Fotos/Videos mit Standort, ohne Standort, nicht unterstützt und fehlerhaft gegen die Testdateien prüfen.
- [ ] JPEG mit EXIF-GPS erscheint an der tatsächlichen Koordinate; PNG/HEIC nur bei auslesbarer Geometadatenstruktur.
- [ ] Dateien ohne GPS erzeugen keinen erfundenen Kartenmarker.
- [ ] MP4/MOV mit QuickTime-/ISO-6709-Location erscheint als Video-Marker.
- [ ] Cluster auf- und hineinzoomen; Foto- und Videomarker bleiben unterscheidbar.
- [ ] Medienmarker öffnen: Dateiname, Datum, Vorschau und „Öffnen“; Video startet nicht automatisch.
- [ ] Mehrere Fotos/Videos manuell einem bestehenden Routenpunkt hinzufügen; Verknüpfung bleibt erhalten, eine vorhandene GPS-Position wird nicht auf den Routenpunkt verschoben.
- [ ] Foto- und Videofilter getrennt aus- und einschalten; kein erneuter Dateiimport.
- [ ] Neu laden: Metadaten und Handles werden wiederhergestellt. Bei fehlender Berechtigung fordert die App verständlich zum erneuten Freigeben/Ordnerauswählen auf.
- [ ] Share-Link nach Medienimport prüfen: keine Media-Metadaten, Blob-URLs oder lokalen Referenzen enthalten.

## Android-Chrome-Checkliste

- [ ] Karte mit zwei Fingern zoomen und drehen; Seite/Listen weiterhin scrollen.
- [ ] Normale und gestrichelte Routenlinie direkt mit dem Finger ziehen, ohne eingefrorene Karte.
- [ ] Punktliste am Griff verschieben; kein doppeltes Auslösen durch Pointer/Touch/Click.
- [ ] Medienordner importieren; Fortschrittsanzeige und Karte bleiben bedienbar.
- [ ] Foto-Popup, Bilddialog, Video-Popup und Videodialog bedienen; Video nur bewusst starten.
- [ ] Android Web Share testen; Abbruch bleibt still, ohne Absturz. Clipboard-Fallback in einem Browser ohne Web Share testen.
- [ ] App in den Hintergrund und zurück bringen; Navigation stoppen und erneut starten.

## Verbleibende technische Schulden

- Die File System Access API und persistierbare Handles sind browserabhängig; auf nicht unterstützten Browsern ist nach einem Reload eine erneute Ordnerauswahl erforderlich.
- HEIC/HEIF-Metadaten werden strukturell mit `exifr` gelesen; eine Bilddekodierung oder Konvertierung ist bewusst nicht enthalten.
- QuickTime/MP4 besitzt viele Herstellerdialekte. Unterstützt sind die typischen ISO-6709-, `keys`-/`ilst`- und `©xyz`-Varianten, nicht jedes proprietäre Format.
- BRouter, OpenFreeMap, Nominatim, MapLibre und die exakt fixierte `exifr`-Browserbibliothek bleiben externe Laufzeitabhängigkeiten einer statischen Anwendung.
- Ein echter Android-Gerätelauf und reale große Mediensammlungen sind für die abschließende Leistungsabnahme weiterhin erforderlich.
