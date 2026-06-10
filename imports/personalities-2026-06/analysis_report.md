# Analysebericht — Arbeitsliste Personen ISO-Datum.xlsx

Quelle: `Arbeitsliste Personen ISO-Datum.xlsx` (Sheet `Arbeitsliste_A4`), erstellt laut Titel 29.05.2026.
Generiert: 2026-06-10T19:07:09+00:00

## Struktur

| | |
|---|---|
| Datenzeilen | **4151** (Titelzeile sagt „1736 Personen" — veraltet) |
| Spalten | 21 (Name, Geb. Datum, Geburtsort, Todestag, Todesort, Beruf, Anmerkungen, Hashtags, Geschlecht (intern), trans/inter (intern), Quelle, Erfasst am, Land (ISO), Berufe (Schlüssel), Meilenstein, Preise, Auszeichnungen, Flags, Partei(en), Geburtsjahr, Todesjahr) |
| Encoding | UTF-8, sauber (xlsx) |
| Nebensheets | `Info` (Hinweise), `AIDS_Check` (12 Beruf-Korrekturen mit per_id — Haupt-Sheet hat KEINE ID-Spalte), `Ort_Check`, `US_CA_Check` |

## Datenqualität

### Pflicht-/Kernfelder fehlend (von 4151)

| Feld | fehlend |
|---|---|
| Name | 0 |
| Geb. Datum | 1462 (davon ~200 mit Geburtsjahr-only) |
| Geburtsort | 814 |
| Beruf | 664 |
| Land (ISO) | 138 |
| Quelle | 2617 |

### Duplikate

- Exakt: **0**
- Fuzzy (normalisiert): **2 Paare**, jeweils typografischer vs. gerader Apostroph:
  - Augusto d’Halmar / Augusto d'Halmar
  - Rosie O’Donnell / Rosie O'Donnell
- Beide Paare bleiben als separate Records im Import (keine Zusammenführung ohne Freigabe), markiert in `unresolved_links.md`.

### Formate

- Geburts-/Todesdatum: 100 % ISO (YYYY-MM-DD), 0 Jahr/Datum-Widersprüche, 0× Tod vor Geburt.
- `Erfasst am` gemischt: 2940× `Altbestand` (kein Datum), Rest ISO-Datum teils mit Suffix („(Recherche international)").
- `Land (ISO)`: 364× `UK` (kein ISO-Code → als `GB` übernommen); 1 Zeile enthielt eine Ortsangabe statt Code (ISO extrahiert, siehe unresolved_links).
- URLs: **0 URLs in der gesamten Liste** → kein HTTP-Check möglich/nötig (siehe failed_urls.md).

### Flags (Quellliste)

| Flag | Zeilen |
|---|---|
| meilenstein | 188 |
| geburtsort_nicht_ermittelbar | 38 |
| suizid_safe_messaging | 26 |
| queerness_nicht_verifizierbar | 25 |
| queerness_umstritten | 24 |
| datumskonflikt | 23 |
| offline_quelle_pruefen | 17 |
| ausschluss | 12 |
| kinderschutz | 11 |
| verbuendete | 7 |
| loeschung_vorgeschlagen | 5 |
| nicht_oeffentlich_geoutet | 3 |
| queerness_zu_pruefen | 2 |

### Prüfmarker

- 275 Zeilen tragen einen datierten `(geprueft 2026-06)`-Marker in den Anmerkungen (`source_checked_marker: true` im Import-JSON).
- Per User-Entscheid (2026-06-10) erhalten **alle** Zeilen `review_status='manually_verified'`, `reviewed_by='Ralf'`, `reviewed_at` aus `Erfasst am` (Altbestand → 2026-05-29).

## Abgleich mit CMS (personalities, 12 515 kanonische Einträge)

| | |
|---|---|
| Namens-Match in DB | **1802** (Upsert auf bestehenden Slug/ID) |
| Neu | **2349** |
| Mehrdeutige Matches (nicht geraten) | 2 → unresolved_links.md |
| Geburtsdatum-Konflikte Liste↔DB | **71** → unresolved_links.md, Import trägt Listenwert + `birth_date_conflict: true` |

## Anreicherung (Vorschläge, `enrichment_verified=false`)

| | |
|---|---|
| Geo-Link Land → country_id | 4013 |
| Geo-Link Geburtsort → city_id | 2062 |
| wikidata_qid gesamt | 2892 (davon 2431 neu via Wikidata-API, Rest aus DB-Match) |
| Wikidata-Lookup-Ausgang | {'matched_dates': 1886, 'ambiguous_dates_0': 308, 'no_candidates': 614, 'matched_label_unique': 545, 'ambiguous_nodates_6': 14, 'ambiguous_dates_2': 22, 'ambiguous_nodates_7': 41, 'ambiguous_nodates_8': 38, 'ambiguous_nodates_3': 38, 'ambiguous_nodates_1': 46, 'ambiguous_nodates_2': 78, 'ambiguous_nodates_4': 30, 'ambiguous_nodates_5': 16, 'no_human': 12} |

Konservative Auflösung: QID nur bei eindeutigem Treffer (P31=Q5 + Geburts-/Todesjahr passt). Keine sensiblen Anreicherungen.

## Gating im Import

- 24 Zeilen mit kinderschutz/ausschluss/loeschung_vorgeschlagen → `visibility='draft'`, `needs_attention=true`, `seo_indexable=false`.
- Weitere Outing-Risiko-Flags (queerness_nicht_verifizierbar/umstritten/zu_pruefen, nicht_oeffentlich_geoutet) → ebenfalls draft+needs_attention. Gesamt draft-gated: **76**.
- Intern-Spalten (Geschlecht, trans/inter) NUR in `sensitivity_flags` (nie Frontend).
