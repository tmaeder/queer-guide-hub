# Was ist ein Meilenstein? — Definition & Aufnahmekriterien

**Zweck:** Verbindlich festhalten, was bei uns als „Meilenstein" gilt und wann einer aufgenommen wird.
Gleicher Inhalt als Info-Karte in der Milestone-Ansicht des Tools (`MilestoneInfo`). Erweiterbar —
Anpassungen jederzeit möglich (siehe „Ausblick").

## Definition

**Ein Meilenstein ist ein datiertes, bedeutsames, belegtes Ereignis der queeren Geschichte und
LGBTQ+-Rechte** — z. B. ein Gesetz, ein Gerichtsurteil, ein Aufstand, eine Entpathologisierung oder ein
Akt der Verfolgung. Meilensteine sind mit Personen verknüpfbar und bekommen eine Wertung.

## Aufnahmekriterien (verbindlich)

1. **Exaktes Tagesdatum** (`YYYY-MM-DD`) **+ mindestens eine Quelle.** Ist nur Jahr oder Monat sicher
   belegbar → **nicht aufnehmen**, nichts raten. (Abgeleitete Daten, z. B. nach einer Vacatio-legis-Regel,
   nur mit klarem Hinweis im Text.)
2. **Bei Gesetzen zählt das Inkrafttreten** — nicht Unterschrift, Parlamentsbeschluss oder erste Zeremonie.
   Wenn beides bekannt/relevant ist, im Text nennen.
3. **Nationale Ebene.** Nur regional/kommunale Regelungen (z. B. einzelne US-Bundesstaaten, Gemeinden)
   sind **kein** Länder-Meilenstein.
4. **Belegbarkeit vor Vollständigkeit.** Lieber ein Land offen lassen als ein unbelegtes Datum aufnehmen.

## Felder je Meilenstein

`title` · `date` (+ optional `date_end`) · Ort (`city`/`region`/`country`) · `description` ·
`sources[]` · `category` · `significance` (1–5) · `impact` (positive/neutral/negative) ·
`linked_persons[]` · `checked`.

## Wichtigkeit (`significance`) — Richtwerte

- **5** — welthistorisch / weltweit erste (z. B. Stonewall, erste Ehe/erste eingetragene Partnerschaft weltweit)
- **4** — national sehr bedeutend, oder erster Fall auf einem Kontinent
- **3** — wichtig (Standard für die meisten Länder-Gesetze)
- **2** — lokal/spezifisch bedeutsam
- **1** — Randnotiz

## Richtung (`impact`)

`positive` = Fortschritt · `neutral` = neutral · `negative` = Rückschritt/Verfolgung.

## Kategorien (bisher genutzt)

Aufstand / Bewegung · Gesetz / Gleichstellung · Recht / Entkriminalisierung ·
Recht / Kriminalisierung · Entpathologisierung · Verfolgung / Zerstörung.
(Gerichtsurteile laufen derzeit unter „Gesetz / Gleichstellung" — bei Bedarf eigene Kategorie.)

## Ausblick (im Hinterkopf behalten)

- **Erweiterbar:** neue Themen/Kategorien jederzeit ergänzbar; diese Definition dann mit anpassen.
- **News:** Wenn wir später aktuelle News aufnehmen, prüfen, ob ein News-Ereignis die Meilenstein-Kriterien
  erfüllt (datiert, belegt, bedeutsam) → dann als Meilenstein; sonst bleibt es News. News kann Quelle für
  Meilensteine sein.
- **Datenhaltung:** Meilensteine liegen aktuell lokal im Tool (Seed + localStorage). Geplant: Umzug in eine
  `milestones`-Tabelle in der Live-DB + N:M-Verknüpfung zu `personalities`.
