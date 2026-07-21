# Person-DB

Eigenständiges Werkzeug zum **Nachschlagen, Durchsuchen und (später) Verwalten**
der öffentlichen LGBTQ+-Personen (`personalities`) von Queer.guide.

**Meilensteine** werden nicht mehr hier gepflegt: die Kuration lebt jetzt als
eigener Content-Type in der Live-`milestones`-Tabelle mit Admin-CMS unter
`/admin/content/milestones` (Seed eingefroren als
`scripts/data-quality/milestone-seed.json`).

Steht **neben** der Hauptseite: eigener Ordner, eigenes `package.json`, eigener
Dev-Server. Ist **nicht** Teil des Haupt-Build/Deploy von queer.guide.

## Starten

```bash
cd tools/person-db
npm install
npm run dev
```

→ http://localhost:5199

## Was v1 kann (live-safe, read-only)

**Dashboard (Startseite) — Aktivität + Personen-Check + Statistik:**
- **Oben** (`src/ActivityPanel.tsx`): „Neu aufgenommen" (letzte nach `created_at`) +
  „Zu bearbeiten" (needs_attention).
- Kohorte-Kacheln.
- **Statistik** (`src/HomeStats.tsx`): Balken „Personen nach Status" + **Top-12-Länder**
  (Flagge), **Länder-Abdeckung** (x/250 + Fortschritt + fehlende-Liste), plus eine
  **interaktive Weltkarte** (`src/WorldMap.tsx`, react-simple-maps + world-atlas +
  i18n-iso-countries; Choropleth nach Personen/Land). Hover-Tooltip zeigt
  **Flagge + Land + Personen** — z.B. „🇩🇪 Germany — 881 Personen". Länder-Counts
  client-seitig aggregiert (paginiert), Flaggen aus `countries.code`.

**„New"-Menü** (`src/NewMenu.tsx`) auf der Liste: Erfassungsart wählen —
Manuell erfassen · **Foto-Upload** (aktiv auf Liste) · Link-Import · Listen-Import
(CSV, soon). Manuell öffnet die leere Maske. Foto-Upload: Bild wählen → neue Person
mit dem Foto als Vorschau (lokale data-URL, **kein Storage-Upload in v1**) → Rest
manuell. Speichern bleibt read-only-gated; echte Persistenz + KI-Extraktion = v2.
- Kachel-Übersicht mit Live-Zahlen pro **Check-Kohorte** (needs_attention,
  Review offen, kein Geburtsdatum/Bild/Text/LGBTI-Bezug/Beruf, Entwürfe,
  öffentlich, Duplikate).
- Klick auf eine Kachel → Liste ist auf genau diese Kohorte gefiltert.
- Zeigt, wie viele Personen du lokal als **geprüft** markiert hast.

**Liste + Upcoming — gleiches Design, umschaltbare Ansicht** (`src/ViewToggle.tsx`):
- **Geteilt** = Liste links + Detail-Panel rechts (Klick auf Person → Detail lädt).
- **Liste** = ausführliche Ansicht über volle Breite (größere Zeilen, Status-Pill +
  ⋯-Menü je Zeile: Bearbeiten/PDF/geprüft).

**Liste (Nav):** Alle Live-Personen **alphabetisch**. Filter: Beruf · Land · Sichtbarkeit ·
Review-Status. **Upcoming:** Filter Name/Beruf-Suche · Anlass (Geburtstag/Todestag).
Beide: **Anzeigen 25/50/100** + **More**.

**Länderflaggen:** Beim Land/Nationalität wird eine Emoji-Flagge vorangestellt
(`src/lib/flags.ts`, Name→ISO, ~100 Länder DE+EN; unbekannt → nur Name). Sichtbar
bei Personen (Liste + Detail).

**Aktionen-Menü (⋯) im Detail:** Edit · PDF · Send to… (soon) · Mark checked ·
Check via AI (soon). **Upcoming** hat je Zeile rechts ein ⋯-Menü (Bearbeiten → lädt volle Person in die
Edit-Maske · Auf queer.guide öffnen · geprüft/Send to soon); die Zeile selbst ist
nicht klickbar.
- **PDF** erzeugt ein Personen-Datenblatt (jsPDF, `src/lib/pdf.ts`) — v1 einfaches
  Text-Layout; das eigentliche Datenblatt-Design folgt.
- **Send to…** (soon): später an andere User im System (Rückfragen klären).
- **Check via AI** (soon): KI-Gegencheck (KI-Bein der Visums-Struktur).

**Bearbeitungsmaske:**
- `✎ Bearbeiten`-Button im Detail-Bereich → Formular mit allen editierbaren
  Feldern (Basis / Details / LGBTQ+ / Links & Medien / Status),
  vorbefüllt aus den Live-Daten (`src/PersonEditForm.tsx`).
- **Speichern ist in v1 (read-only) deaktiviert** — Maske ist Vorschau. Für v2:
  `READ_ONLY=false` + Admin-Login + `onSave → supabase.from('personalities')
  .update(...)`. RLS verlangt admin-Rolle bzw. created_by=self.

**Cohort-Listen-Ansicht (vom Dashboard):**
- **Suche** nach Name oder Beruf; zusätzliche Filter (Sichtbarkeit,
  Review-Status, needs_attention) legen sich über die Kohorte.
- **Detail-Ansicht** aller Felder.
- **Geprüft markieren** pro Person (grüner ✓ in der Liste). Rein lokal.
  `geprüfte ausblenden` blendet erledigte aus → schnelles Durcharbeiten.
- **Tastatur:** `n`/`j` nächste, `p`/`k` vorige, `c` geprüft-Umschalten.
- **Notizen & Tags** pro Person — **nur lokal im Browser** (`localStorage`),
  niemals in der DB. Blauer Punkt in der Liste = hat Notiz.
- **Export** der angezeigten Personen als **CSV** oder **JSON**
  (inkl. lokaler Notizen/Tags).

## Live-Sicherheit

- Verbindet über den **öffentlichen anon-Key** (RLS-geschützt, identisch mit dem
  in der Haupt-App fest hinterlegten Key).
- v1 macht **ausschließlich Lesezugriffe**. Kein Login, kein `INSERT`/`UPDATE`.
- `READ_ONLY = true` in [`src/config.ts`](src/config.ts) ist der harte Schalter.
- Notizen/Tags sind rein lokal → **null Effekt auf die Live-Seite**.

Anschauen und Exportieren kann also nichts an queer.guide verändern.

## Datenlage (Stand 2026-07-14)

- 15.832 Personen — 2.192 `public`, 13.640 `draft`.
- `review_status`: pending 7.109 · manually_verified 4.100 · archived 2.952 · approved 1.671.
- 8.775 mit Bild.

## v2 — Verwalten (geplant, noch aus)

Bearbeiten braucht **Admin-Login** (Supabase Auth). RLS erlaubt `UPDATE` nur für
`has_role_jwt('admin')` bzw. den Ersteller; `INSERT` läuft teils über die
Edge-Function `stage-personality` (Staging-Pipeline), teils direkt.

Roadmap:
1. Login-Screen (Supabase Auth, admin).
2. `READ_ONLY = false` → Feld-Editor im Detail-Panel (direktes `update` wie der
   CMS-Editor der Hauptseite, `src/hooks/useCMSEditor.tsx`).
3. Neue Person anlegen (über `stage-personality`).

## Feld-Referenz (erlaubte Werte, aus der Live-DB)

- `visibility`: `public` · `draft` · `private`
- `verification_status`: `pending` · `verified` · `disputed`
- `review_status`: `pending` · `manually_verified` · `approved` · `archived`
- `cause_of_death`: natural · illness · hiv_aids · suicide · homicide ·
  accident · overdose · execution · unknown · other

## Konfiguration überschreiben (optional)

`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` als Env-Var setzen, sonst greifen
die Defaults in `src/config.ts`.
