# Import-Ergebnis — Arbeitsliste → personalities (Prod, 2026-06-10)

Ausgeführt mit expliziter Freigabe. Skript: `do_import.py` (idempotent, gebatcht à 250, Management-API).
Pre-Image-Backup der Update-Ziele: `/tmp/preimage_personalities_update_targets.json` (1802 Rows).

## Zahlen (DB-verifiziert)

| | |
|---|---|
| personalities gesamt | 12 619 → **14 928** (+2309 neu, alle `visibility='draft'`, `seo_indexable=false`) |
| Gestempelt (`enrichment_status.import_arbeitsliste_2026_06` + `review_status='manually_verified'`, reviewed_by Ralf) | **4 137** |
| Updates auf Bestand | 1 882 geplant, 1 davon übersprungen (Identitäts-Mismatch), 3 Doppel-Ziele (zwei Listen-Zeilen → gleiche DB-Row) |
| Public unverändert | 408 Import-berührte public (waren vorher public); kein Eintrag wurde publiziert |
| Outing-/Ausschluss-Gating | 76 draft+needs_attention, 24 davon zusätzlich noindex |
| search_documents (personality) | 1 073 = public-Bestand, konsistent (drafts nicht indexiert) |
| Enrichment-Queue | ~2 300 geo-link/embedding-Jobs enqueued (normaler Pipeline-Pfad, Worker arbeiten ab) |

## Während des Imports gefundene Probleme (von DB-Gates abgefangen)

1. **`wikidata_qid` ist UNIQUE** → 27 „neue" Listen-Personen waren Namensvarianten bestehender DB-Rows (z.B. dt. vs. engl. Transliteration). Per QID reklassifiziert → UPDATE statt Duplikat-INSERT.
2. **Identitäts-Mismatch `billy-porter`**: DB-Row ist ein englischer Fußballer (1905–1946, Q4913178), Liste meint den US-Schauspieler (*1969). Update übersprungen (`identity_mismatches.json`). **Die DB-Row ist eine vorbestehende Chimäre** (Fußballer-QID/Daten + Schauspieler-Tags + nationality United States, public!) — separater Fix nötig.
3. **10 Neueinträge ohne Person-Marker** (kein Datum/QID/Beruf) vom DB-Gate `personalities_require_person_marker` abgelehnt → `skipped_no_marker.json` (mehrere davon ohnehin ausschluss-geflaggt).

## Offen für Ralf

- **20 mögliche DB-interne Duplikate** (gleiche QID auf zwei Rows; Listen-Row trägt `possible_duplicate_of` in `enrichment_status`): u.a. Tschaikowski, Nurejew, Djagilew, Eddie Izzard, Hunter Schafer, David Kato, Del Martin, Frank Kameny. → `/admin/duplicates`-artige Merge-Entscheide.
- **4 Merge-Reviews** (`needs_merge_review`): Augusto d'Halmar (Apostroph-Paar), Rosie O'Donnell (dito), Luka Dimic, Robert Garcia (mehrdeutig).
- **1 Identitäts-Mismatch**: Billy Porter (Schauspieler fehlt in DB; Fußballer-Row aufräumen).
- **10 übersprungene** marker-lose Zeilen (`skipped_no_marker.json`).
- **71 Geburtsdatum-Konflikte**: Listenwert wurde geschrieben (User-Entscheid), `birth_date_conflict:true` im Stempel; Liste in `unresolved_links.md`.
- ~1190 Geburtsorte ohne city_id (unresolved_links.md) — der enqueued `geo-link-content`-Workflow versucht sie zusätzlich automatisch.

## Reproduzierbarkeit / Rollback

- Re-Run: `python3 do_import.py` (idempotent: Slug-Konflikte übersprungen, Updates konvergent).
- Rollback Updates: Pre-Images in `/tmp/preimage_personalities_update_targets.json`.
- Rollback Inserts: `DELETE FROM personalities WHERE enrichment_status ? 'import_arbeitsliste_2026_06' AND created_at > '2026-06-10T19:00Z'` (alle draft, nichts referenziert sie bisher).
