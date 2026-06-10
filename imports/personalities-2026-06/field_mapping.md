# Field-Mapping — Arbeitsliste → personalities

Zieltabelle: `personalities` (Schema: `src/integrations/supabase/types.ts:11202`).
Upsert-Key: `slug` (+ `existing_id` wenn DB-Match). Generator: `transform.py`.

| Quellfeld | Zielfeld | Transformation |
|---|---|---|
| Name | `name` | trim; Original behalten (Apostroph-Normalisierung nur fürs Matching) |
| — | `slug` | DB-Match → bestehender Slug; sonst kebab-case(Name), Kollision → `-<geburtsjahr>`-Suffix |
| — | `existing_id` | personalities.id bei eindeutigem Namens-Match (Tiebreaker Geburtsdatum) |
| Geb. Datum | `birth_date` | ISO direkt; Jahr-only NICHT als Fake-Datum |
| Geburtsjahr (ohne Datum) | `birth_year_only` | Import-JSON-Feld; DB hat keine Spalte — Importer-Entscheid (z.B. fields jsonb) |
| Todestag / Todesjahr | `death_date` / `death_year_only` | analog |
| — | `is_living` | true wenn weder Todestag noch Todesjahr |
| Geburtsort / Todesort | `birth_place` / `death_place` | Text direkt |
| Beruf | `profession` | direkt (laut Info-Sheet bereits profession_de der Hauptdatenbank) |
| Berufe (Schlüssel) | `tags` | split `;`, lowercase, dedupe |
| Hashtags | `tags` | split `;`, `#` strippen, mergen |
| Flags: meilenstein | `tags` += `milestone` | |
| Meilenstein | `achievements[]` | `{type:'milestone', text}` |
| Preise (Schlüssel) | `achievements[]` | `{type:'award', key}` je Eintrag |
| Auszeichnungen (Detail) | `achievements[]` | `{type:'award_detail', text}` |
| Partei(en) | `fields.parties` | split `;` |
| Quelle | `lgbti_connection_source` | Text direkt |
| Land (ISO) | `nationality` + `country_id` | `UK`→`GB`; ISO2 → countries.code (Geo-Link, enrichment) |
| Geburtsort (Stadt) | `city_id` | country-scoped Match gegen cities (Komma-Split + Exonym-Aliasse Köln→Cologne usw.); kein Treffer → unresolved_links.md, kein Raten |
| Anmerkungen / Unklarheiten | `internal_notes` | NICHT in bio/description (interne Review-Notizen); Importer → `enrichment_status.import_notes` |
| Geschlecht (intern) | `sensitivity_flags.gender_internal` | nie Frontend |
| trans/inter (intern) | `sensitivity_flags.trans_inter_internal` | nie Frontend |
| Flags | `sensitivity_flags.list_flags` + Gating | s.u. |
| Erfasst am | `reviewed_at` | ISO-Präfix; `Altbestand` → `2026-05-29` (Listenerstellung) |
| — | `review_status` | `manually_verified` (alle Zeilen, User-Entscheid 2026-06-10) |
| — | `reviewed_by` | `"Ralf"` — Auflösung auf CMS-User-ID beim Import |
| Anmerkungen `(geprueft 20XX)` | `source_checked_marker` | bool, 275 Zeilen |
| — (Wikidata-API) | `wikidata_qid` | DB-QID hat Vorrang; sonst konservativer Lookup (P31=Q5 + Jahres-Match); `enrichment_source:'wikidata'`, `enrichment_verified:false` |

## Gating (Flags → Sichtbarkeit)

| Flag | Wirkung |
|---|---|
| kinderschutz, ausschluss, loeschung_vorgeschlagen | `visibility='draft'`, `needs_attention=true`, `seo_indexable=false` |
| queerness_nicht_verifizierbar, queerness_umstritten, queerness_zu_pruefen, nicht_oeffentlich_geoutet | `visibility='draft'`, `needs_attention=true` (Outing-Schutz) |
| suizid_safe_messaging, offline_quelle_pruefen, verbuendete, datumskonflikt, geburtsort_nicht_ermittelbar | nur `sensitivity_flags.list_flags` |

## Nicht direkt abbildbare Felder

- `reviewed_by`/`reviewed_at`: keine DB-Spalten — Importer-Konvention `enrichment_status.review = {by, at, status}`; Spalte `review_status` erhält `manually_verified`.
- `birth_year_only`/`death_year_only`: keine DB-Spalten — keine Fake-Daten in `birth_date`; Importer-Entscheid.
- AIDS_Check-Sheet (12 Korrekturen): bereits in Spalte `Beruf` eingearbeitet (laut Info-Sheet), keine separate Behandlung.
