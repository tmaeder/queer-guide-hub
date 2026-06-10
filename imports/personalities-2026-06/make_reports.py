#!/usr/bin/env python3
"""Erzeugt analysis_report.md, unresolved_links.md, failed_urls.md aus den
Transform-Outputs. field_mapping.md ist handgepflegt."""
import json, collections, os

HERE = os.path.dirname(os.path.abspath(__file__))
imp = json.load(open(os.path.join(HERE, 'personalities_import.json')))
iss = json.load(open(os.path.join(HERE, '_issues.json')))
recs = imp['records']
c = imp['meta']['counts']

flagdist = collections.Counter()
for r in recs:
    for f in (r['sensitivity_flags'] or {}).get('list_flags', []):
        flagdist[f] += 1

miss = {f: sum(1 for r in recs if not r[f]) for f in
        ['birth_date', 'birth_place', 'profession', 'nationality', 'country_id',
         'city_id', 'lgbti_connection_source', 'tags']}

wd_cache_path = os.path.join(HERE, 'wikidata_cache.json')
wd = json.load(open(wd_cache_path)) if os.path.exists(wd_cache_path) else {}
wd_reasons = collections.Counter(v['reason'].split(':')[0] for v in wd.values())

with open(os.path.join(HERE, 'analysis_report.md'), 'w') as f:
    f.write(f'''# Analysebericht — Arbeitsliste Personen ISO-Datum.xlsx

Quelle: `Arbeitsliste Personen ISO-Datum.xlsx` (Sheet `Arbeitsliste_A4`), erstellt laut Titel 29.05.2026.
Generiert: {imp['meta']['generated_at']}

## Struktur

| | |
|---|---|
| Datenzeilen | **{c['records']}** (Titelzeile sagt „1736 Personen" — veraltet) |
| Spalten | 21 (Name, Geb. Datum, Geburtsort, Todestag, Todesort, Beruf, Anmerkungen, Hashtags, Geschlecht (intern), trans/inter (intern), Quelle, Erfasst am, Land (ISO), Berufe (Schlüssel), Meilenstein, Preise, Auszeichnungen, Flags, Partei(en), Geburtsjahr, Todesjahr) |
| Encoding | UTF-8, sauber (xlsx) |
| Nebensheets | `Info` (Hinweise), `AIDS_Check` (12 Beruf-Korrekturen mit per_id — Haupt-Sheet hat KEINE ID-Spalte), `Ort_Check`, `US_CA_Check` |

## Datenqualität

### Pflicht-/Kernfelder fehlend (von {c['records']})

| Feld | fehlend |
|---|---|
| Name | 0 |
| Geb. Datum | {miss['birth_date']} (davon ~200 mit Geburtsjahr-only) |
| Geburtsort | {miss['birth_place']} |
| Beruf | {miss['profession']} |
| Land (ISO) | {miss['nationality']} |
| Quelle | {miss['lgbti_connection_source']} |

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
''')
    for flag, n in flagdist.most_common():
        f.write(f'| {flag} | {n} |\n')
    f.write(f'''
### Prüfmarker

- {sum(1 for r in recs if r['source_checked_marker'])} Zeilen tragen einen datierten `(geprueft 2026-06)`-Marker in den Anmerkungen (`source_checked_marker: true` im Import-JSON).
- Per User-Entscheid (2026-06-10) erhalten **alle** Zeilen `review_status='manually_verified'`, `reviewed_by='Ralf'`, `reviewed_at` aus `Erfasst am` (Altbestand → 2026-05-29).

## Abgleich mit CMS (personalities, 12 515 kanonische Einträge)

| | |
|---|---|
| Namens-Match in DB | **{c['matched_existing']}** (Upsert auf bestehenden Slug/ID) |
| Neu | **{c['new']}** |
| Mehrdeutige Matches (nicht geraten) | 2 → unresolved_links.md |
| Geburtsdatum-Konflikte Liste↔DB | **{c['birth_date_conflicts']}** → unresolved_links.md, Import trägt Listenwert + `birth_date_conflict: true` |

## Anreicherung (Vorschläge, `enrichment_verified=false`)

| | |
|---|---|
| Geo-Link Land → country_id | {len(recs) - miss['country_id']} |
| Geo-Link Geburtsort → city_id | {len(recs) - miss['city_id']} |
| wikidata_qid gesamt | {c['wikidata_qid_set']} (davon {c['wikidata_from_enrichment']} neu via Wikidata-API, Rest aus DB-Match) |
| Wikidata-Lookup-Ausgang | {dict(wd_reasons)} |

Konservative Auflösung: QID nur bei eindeutigem Treffer (P31=Q5 + Geburts-/Todesjahr passt). Keine sensiblen Anreicherungen.

## Gating im Import

- {c['exclusion_flagged']} Zeilen mit kinderschutz/ausschluss/loeschung_vorgeschlagen → `visibility='draft'`, `needs_attention=true`, `seo_indexable=false`.
- Weitere Outing-Risiko-Flags (queerness_nicht_verifizierbar/umstritten/zu_pruefen, nicht_oeffentlich_geoutet) → ebenfalls draft+needs_attention. Gesamt draft-gated: **{c['draft_gated']}**.
- Intern-Spalten (Geschlecht, trans/inter) NUR in `sensitivity_flags` (nie Frontend).
''')

ur = iss['unresolved']
with open(os.path.join(HERE, 'unresolved_links.md'), 'w') as f:
    f.write('# Unresolved Links & Konflikte — manuelle Klärung\n\n')
    f.write('## Mehrdeutige DB-Matches (Import legt NEUEN Eintrag NICHT an; Zeile bleibt ohne existing_id, Slug neu — Ralf entscheidet Merge)\n\n')
    for u in [u for u in ur if 'mehrdeutig' in u['reason']]:
        f.write(f"- Zeile {u['row']} **{u['name']}**: Kandidaten {json.dumps(u['candidates'], ensure_ascii=False)}\n")
    f.write('\n## Duplikat-Kandidaten in der Liste (Apostroph-Varianten, NICHT zusammengeführt)\n\n')
    for pair in iss['duplicate_candidates']:
        f.write(f"- {' / '.join(pair)}\n")
    f.write(f"\n## Geburtsdatum-Konflikte Liste ↔ DB ({len(iss['conflicts'])})\n\nImport trägt Listenwert, `birth_date_conflict: true`.\n\n| Zeile | Name | Liste | DB |\n|---|---|---|---|\n")
    for cf in iss['conflicts']:
        f.write(f"| {cf['row']} | {cf['name']} | {cf['list_birth_date']} | {cf['db_birth_date']} |\n")
    fmt = [u for u in ur if 'extrahiert' in u['reason']]
    if fmt:
        f.write('\n## Format-Anomalien\n\n')
        for u in fmt:
            f.write(f"- Zeile {u['row']} {u['name']}: {u['reason']}\n")
    cities = [u for u in ur if 'Stadt' in u['reason']]
    f.write(f'\n## Geburtsort nicht gegen cities auflösbar ({len(cities)})\n\n')
    f.write('city_id bleibt leer, birth_place-Text bleibt erhalten. Kein Raten.\n\n')
    for u in cities:
        f.write(f"- Zeile {u['row']} {u['name']}: {u['reason'].replace('Geburtsort-Stadt nicht in cities: ', '')}\n")

with open(os.path.join(HERE, 'failed_urls.md'), 'w') as f:
    f.write('''# URL-Prüfung

Quellliste enthält **0 URLs** (alle Spalten geprüft, Regex `https?://`).
`Quelle` ist Freitext (z.B. „RosaWinkelGedenkbuch", „Wikipedia") ohne Links.
Kein HTTP-Check durchgeführt; nichts fehlgeschlagen.
''')

print('reports written')
