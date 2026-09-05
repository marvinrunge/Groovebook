# Groove Setlist

Setlist-PWA für die Bühne. Songs durchblättern, Akkorde und Notizen groß auf
Handy, Tablet oder Laptop, alles direkt bearbeitbar — auch mitten im Gig.

Läuft sofort ohne Login und ohne Firebase: die Daten liegen dann im Browser.
Sobald du die Firebase-Zugänge einträgst, kommen Google-Login, Synchronisation
über alle Geräte und der Serverimport für PDFs dazu. Kein Code muss dafür
geändert werden.

## Loslegen

```bash
npm install
npm start          # http://localhost:4200
```

Produktivbuild mit Service Worker (der Offline-Modus greift erst hier):

```bash
npm run serve:pwa  # http://localhost:8080
```

Auf dem Handy: Seite öffnen → Browsermenü → „Zum Startbildschirm hinzufügen".
Danach startet die App im Vollbild und funktioniert ohne Netz.

## Bedienung auf der Bühne

| Aktion | Handy/Tablet | Tastatur / Fußschalter |
| --- | --- | --- |
| Nächster Song | rechts tippen oder nach links wischen | →, Leertaste, Bild ab |
| Vorheriger Song | links tippen oder nach rechts wischen | ←, Bild auf |
| Schrift größer/kleiner | „Aa" → +/− | +, − |
| Song bearbeiten | ✎ | e |
| Ansicht verlassen | ✕ | Esc |

Die Leiste unten zeigt jeden Song als Strich — ein Tipp springt direkt hin.
Der Bildschirm bleibt an, solange die Bühnenansicht offen ist. Die
Schriftgröße wird gemerkt. Transponieren wirkt nur auf die Anzeige, gespeichert
bleibt das Original.

## Import

Die App liest **.docx, .txt, .md, .csv/.tsv** komplett im Browser — inklusive
Tabellen, Spalte für Spalte. Für dein Google Doc:

> Datei → Herunterladen → Microsoft Word (.docx) → in der App unter „Importieren" auswählen.

Danach kommt eine Vorschau-Tabelle, in der du jede Zeile korrigieren kannst,
bevor sie in die Setlist wandert. Erkannt werden:

- nummerierte Listen (`01. Bad Girls   D G D C   Clean`)
- Tabellen mit Kopfzeile (`Song | Akkorde | Sound`)
- Absätze: erste Zeile Titel, Akkordzeilen und Notizen darunter

**PDF** läuft über die Cloud Function `parseDocument` und braucht ein
eingerichtetes Firebase-Projekt plus Login.

## Firebase einschalten

1. Projekt in der [Firebase-Konsole](https://console.firebase.google.com) anlegen.
2. Authentication → Anmeldemethode → **Google** aktivieren, Domain freigeben.
3. Firestore und Storage anlegen (Region z. B. `europe-west3`).
4. Web-App registrieren und die SDK-Konfiguration nach
   `src/environments/environment.ts` kopieren.
5. Projekt-ID in `.firebaserc` eintragen.

```bash
cd functions && npm install && cd ..
firebase deploy
```

Beim ersten Login bietet die App an, die lokal angelegten Setlisten ins Konto
zu übernehmen. Ab dann synchronisiert Firestore selbst — auch offline, es
schreibt nach, sobald wieder Netz da ist.

### KI-Analyse für unsaubere Dokumente (optional)

Die Funktionen laufen ohne Schlüssel mit der Regel-Erkennung. Wenn du einen
API-Schlüssel hinterlegst, wird er für schwierige Dokumente genutzt:

```bash
firebase functions:secrets:set LLM_API_KEY
```

Der Aufruf steht in `functions/src/index.ts` in `structureWithLlm` und erwartet
eine Anthropic-kompatible Messages-API. Für einen anderen Anbieter tauschst du
nur diese eine Funktion aus.

### Google-Docs-Direktimport

`importGoogleDoc` holt ein Dokument über die Drive-API. Der Login fragt dafür
den Scope `drive.readonly` mit ab; das Token liegt in der Session und wird an
die Function übergeben. Aktivier dazu die Drive-API in der Google Cloud Console
deines Projekts.

## Aufbau

```
src/app/core/       Modelle, Speicher (lokal + Firestore), Parser, Auth, Transponierung
src/app/pages/      Übersicht, Setlist-Editor, Bühnenansicht, Import, Einstellungen
src/app/shell/      Kopfleiste
functions/src/      parseDocument, importGoogleDoc (Parser identisch zum Client)
```

Der Speicher steckt hinter `SetlistRepository`. `LocalRepository` schreibt in
den Browser, `FirestoreRepository` ins Konto — der Store schaltet je nach
Login-Status um, der Rest der App merkt davon nichts.

## Datensicherung

Einstellungen → „Sicherung herunterladen" gibt eine JSON-Datei mit allen
Setlisten. Über „Importieren" kommt sie wieder rein. Mach das, bevor du im
lokalen Modus den Browserspeicher leerst.
