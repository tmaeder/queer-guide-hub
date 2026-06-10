#!/usr/bin/env python3
"""Fuehrt den Upsert von personalities_import.json in die Prod-DB aus.

- INSERT neue Records (ON CONFLICT (slug) DO NOTHING -> idempotent)
- UPDATE gematchte Records per id (Listenwert gewinnt wo vorhanden, nie NULL-out)
- Stempel-Pass danach (review_status='manually_verified' + enrichment_status),
  weil trg_personalities_auto_approve bei city_id-Aenderung review_status
  auf 'approved' ueberschreibt.
- 10 Neueintraege ohne Person-Marker (birth/death/qid/profession) werden vom
  DB-Gate personalities_require_person_marker abgelehnt -> uebersprungen,
  Liste in skipped_no_marker.json.
- Batches klein halten (search_documents_sync feuert pro Row, DB disk-knapp).
"""
import json, os, re, subprocess, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = 'xqeacpakadqfxjxjcewc'
BATCH = 250
IMPORT_KEY = 'import_arbeitsliste_2026_06'
AMBIGUOUS = {'Luka Dimic', 'Robert Garcia'}
APOSTROPHE_NEW = {"Augusto d'Halmar", "Rosie O'Donnell"}  # gerade-Apostroph-Variante = Neuanlage


def token():
    raw = subprocess.check_output(['security', 'find-generic-password', '-s', 'Supabase CLI', '-w']).decode().strip()
    raw = raw.removeprefix('go-keyring-base64:')
    import base64
    return base64.b64decode(raw).decode()


TOKEN = token()


def run_sql(sql):
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{PROJECT}/database/query',
        data=json.dumps({'query': sql}).encode(),
        headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json',
                 'User-Agent': 'Mozilla/5.0'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:2000]
        raise RuntimeError(f'HTTP {e.code}: {body}\nSQL head: {sql[:300]}')


def q(v):
    if v is None:
        return 'NULL'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def qj(obj):
    return 'NULL::jsonb' if obj is None else q(json.dumps(obj, ensure_ascii=False)) + '::jsonb'


def qarr(arr):
    if not arr:
        return 'NULL::text[]'
    return 'ARRAY[' + ','.join(q(a) for a in arr) + ']::text[]'


def import_meta(r):
    return {IMPORT_KEY: {k: v for k, v in {
        'reviewed_by': r['reviewed_by'], 'reviewed_at': r['reviewed_at'],
        'review_status': 'manually_verified',
        'source_checked_marker': r['source_checked_marker'],
        'notes': r['internal_notes'],
        'birth_year_only': r['birth_year_only'], 'death_year_only': r['death_year_only'],
        'birth_date_conflict': r['birth_date_conflict'] or None,
        'enrichment': r['enrichment'],
        'needs_merge_review': r.get('needs_merge_review'),
        'matched_by_qid': r.get('matched_by_qid'),
        'possible_duplicate_of': r.get('possible_duplicate_of'),
    }.items() if v is not None}}


def main():
    dry = '--dry-run' in sys.argv
    imp = json.load(open(os.path.join(HERE, 'personalities_import.json')))
    countries = {c['code']: c['name'] for c in json.load(open('/tmp/db_countries.json'))}
    recs = imp['records']

    for r in recs:  # Sonderfaelle: nicht raten -> draft + Merge-Review durch Ralf
        if not r['existing_id'] and (r['name'] in AMBIGUOUS or r['name'] in APOSTROPHE_NEW):
            r['visibility'] = 'draft'
            r['needs_attention'] = True
            r['needs_merge_review'] = True

    # Live-Maps: slug/qid sind UNIQUE -> "neue" Rows mit bereits vergebener QID
    # sind in Wahrheit bestehende Personen unter Namensvariante -> UPDATE statt INSERT
    live = run_sql('SELECT id, slug, wikidata_qid FROM personalities')
    slug_to_id = {p['slug']: p['id'] for p in live}
    qid_to_id = {p['wikidata_qid']: p['id'] for p in live if p['wikidata_qid']}

    inserts, updates, skipped = [], [], []
    batch_qids = set()
    for r in recs:
        if not r['existing_id'] and r['slug'] in slug_to_id:
            r['existing_id'] = slug_to_id[r['slug']]  # bereits importiert (Teillauf) -> idempotent update
        if not r['existing_id'] and r['wikidata_qid'] and r['wikidata_qid'] in qid_to_id:
            r['existing_id'] = qid_to_id[r['wikidata_qid']]
            r['matched_by_qid'] = True  # Namensvariante; name NICHT ueberschreiben
        if r['existing_id'] and r['wikidata_qid']:
            owner = qid_to_id.get(r['wikidata_qid'])
            if owner and owner != r['existing_id']:
                r['possible_duplicate_of'] = owner  # zwei DB-Rows, gleiche Person -> Ralf
                r['wikidata_qid'] = None
        if not r['existing_id'] and r['wikidata_qid']:
            if r['wikidata_qid'] in batch_qids:
                r['needs_merge_review'] = True
                r['wikidata_qid'] = None  # zweite Listen-Zeile, gleiche QID
            else:
                batch_qids.add(r['wikidata_qid'])
        if r['existing_id']:
            updates.append(r)
        elif r['birth_date'] or r['death_date'] or r['wikidata_qid'] or (r['profession'] or '').strip():
            inserts.append(r)
        else:
            skipped.append({'name': r['name'], 'slug': r['slug'], 'reason': 'kein Person-Marker (DB-Gate)'})
    print(f"reclassified by slug/qid: {sum(1 for r in updates if r.get('matched_by_qid'))} qid-matches, "
          f"{sum(1 for r in recs if r.get('possible_duplicate_of'))} possible-dups, "
          f"{sum(1 for r in recs if r.get('needs_merge_review'))} merge-review", flush=True)

    # Identitaets-Sanity: finale Geburt/Tod-Kombination muss konsistent sein.
    # Faengt Falsch-Matches wie billy-porter (DB=Fussballer +1946, Liste=Schauspieler *1969).
    upd_ids = [r['existing_id'] for r in updates]
    live_dates = {}
    for i in range(0, len(upd_ids), 400):
        chunk = ','.join(f"'{x}'" for x in upd_ids[i:i + 400])
        for p in run_sql(f'SELECT id, birth_date, death_date, name FROM personalities WHERE id IN ({chunk})'):
            live_dates[p['id']] = p
    mismatches = []
    ok_updates = []
    for r in updates:
        p = live_dates.get(r['existing_id'], {})
        fb = r['birth_date'] or p.get('birth_date')
        fd = r['death_date'] or p.get('death_date')
        if fb and fd and fb > fd:
            mismatches.append({'list_name': r['name'], 'slug': r['slug'], 'db_id': r['existing_id'],
                               'db_name': p.get('name'), 'db_birth': p.get('birth_date'),
                               'db_death': p.get('death_date'), 'list_birth': r['birth_date'],
                               'list_death': r['death_date'],
                               'reason': 'finale Geburt>Tod -> vermutlich andere Person hinter dem Slug'})
        else:
            ok_updates.append(r)
    updates = ok_updates
    json.dump(mismatches, open(os.path.join(HERE, 'identity_mismatches.json'), 'w'), ensure_ascii=False, indent=1)
    print(f'identity mismatches skipped: {len(mismatches)}', flush=True)
    json.dump(skipped, open(os.path.join(HERE, 'skipped_no_marker.json'), 'w'), ensure_ascii=False, indent=1)
    print(f'inserts={len(inserts)} updates={len(updates)} skipped={len(skipped)} dry={dry}', flush=True)

    # ---- INSERT-Batches ----
    ins_cols = ('name, slug, birth_date, death_date, birth_place, death_place, is_living, '
                'profession, nationality, country_id, city_id, tags, achievements, fields, '
                'lgbti_connection_source, wikidata_qid, sensitivity_flags, visibility, '
                'needs_attention, seo_indexable, review_status, enrichment_status')
    for i in range(0, len(inserts), BATCH):
        rows = []
        for r in inserts[i:i + BATCH]:
            rows.append('(' + ','.join([
                q(r['name']), q(r['slug']),
                q(r['birth_date']) + '::date' if r['birth_date'] else 'NULL',
                q(r['death_date']) + '::date' if r['death_date'] else 'NULL',
                q(r['birth_place']), q(r['death_place']),
                'false' if not r['is_living'] else 'true',
                q(r['profession']), q(countries.get(r['nationality'])),
                q(r['country_id']) + '::uuid' if r['country_id'] else 'NULL',
                q(r['city_id']) + '::uuid' if r['city_id'] else 'NULL',
                qarr(r['tags']), qj(r['achievements']), qj(r['fields']),
                q(r['lgbti_connection_source']), q(r['wikidata_qid']),
                qj(r['sensitivity_flags']),
                q('draft'),
                'true' if r['needs_attention'] else 'false',
                'false',
                q('manually_verified'), qj(import_meta(r)),
            ]) + ')')
        sql = f'INSERT INTO personalities ({ins_cols}) VALUES\n' + ',\n'.join(rows) + '\nON CONFLICT (slug) DO NOTHING;'
        if not dry:
            run_sql(sql)
            print(f'insert batch {i // BATCH + 1}/{(len(inserts) - 1) // BATCH + 1}', flush=True)
            time.sleep(1.5)

    # ---- UPDATE-Batches (Listenwert gewinnt wo vorhanden, kein NULL-out) ----
    for i in range(0, len(updates), BATCH):
        rows = []
        for r in updates[i:i + BATCH]:
            gated = r['visibility'] == 'draft'
            rows.append('(' + ','.join([
                q(r['existing_id']) + '::uuid',
                (q(r['birth_date']) + '::date') if r['birth_date'] else 'NULL::date',
                (q(r['death_date']) + '::date') if r['death_date'] else 'NULL::date',
                q(r['birth_place']), q(r['death_place']),
                q(r['profession']), q(countries.get(r['nationality'])),
                q(r['country_id']) + '::uuid' if r['country_id'] else 'NULL::uuid',
                q(r['city_id']) + '::uuid' if r['city_id'] else 'NULL::uuid',
                qarr(r['tags']), qj(r['achievements']), qj(r['fields']),
                q(r['lgbti_connection_source']),
                q(r['wikidata_qid']) if r['wikidata_qid'] else 'NULL',
                qj(r['sensitivity_flags']),
                'true' if gated else 'false',
                'true' if r['seo_indexable'] is False else 'false',
            ]) + ')')
        sql = f'''UPDATE personalities p SET
  birth_date = COALESCE(v.birth_date, p.birth_date),
  death_date = COALESCE(v.death_date, p.death_date),
  birth_place = COALESCE(v.birth_place, p.birth_place),
  death_place = COALESCE(v.death_place, p.death_place),
  profession = COALESCE(v.profession, p.profession),
  nationality = COALESCE(v.nationality, p.nationality),
  country_id = COALESCE(v.country_id, p.country_id),
  city_id = COALESCE(v.city_id, p.city_id),
  tags = CASE WHEN v.tags IS NULL THEN p.tags ELSE
    (SELECT array_agg(DISTINCT t) FROM unnest(COALESCE(p.tags,'{{}}'::text[]) || v.tags) t) END,
  achievements = COALESCE(p.achievements, v.achievements),
  fields = COALESCE(p.fields,'{{}}'::jsonb) || COALESCE(v.fields,'{{}}'::jsonb),
  lgbti_connection_source = COALESCE(v.lgbti_connection_source, p.lgbti_connection_source),
  wikidata_qid = CASE WHEN p.wikidata_qid IS NULL AND v.wikidata_qid IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM personalities x WHERE x.wikidata_qid = v.wikidata_qid AND x.id <> p.id)
    THEN v.wikidata_qid ELSE p.wikidata_qid END,
  sensitivity_flags = COALESCE(p.sensitivity_flags,'{{}}'::jsonb) || COALESCE(v.sensitivity_flags,'{{}}'::jsonb),
  visibility = CASE WHEN v.gated THEN 'draft' ELSE p.visibility END,
  needs_attention = CASE WHEN v.gated THEN true ELSE p.needs_attention END,
  seo_indexable = CASE WHEN v.noindex THEN false ELSE p.seo_indexable END,
  updated_at = now()
FROM (VALUES\n{",".join(rows)}\n) AS v(id, birth_date, death_date, birth_place, death_place, profession, nationality, country_id, city_id, tags, achievements, fields, lgbti_connection_source, wikidata_qid, sensitivity_flags, gated, noindex)
WHERE p.id = v.id;'''
        if not dry:
            run_sql(sql)
            print(f'update batch {i // BATCH + 1}/{(len(updates) - 1) // BATCH + 1}', flush=True)
            time.sleep(1.5)

    # ---- Stempel-Pass (nach auto_approve_on_city_link) ----
    for i in range(0, len(updates), BATCH):
        rows = [f"({q(r['existing_id'])}::uuid, {qj(import_meta(r))})" for r in updates[i:i + BATCH]]
        sql = f'''UPDATE personalities p SET
  review_status = 'manually_verified',
  enrichment_status = COALESCE(p.enrichment_status,'{{}}'::jsonb) || v.meta
FROM (VALUES\n{",".join(rows)}\n) AS v(id, meta)
WHERE p.id = v.id;'''
        if not dry:
            run_sql(sql)
            print(f'stamp batch {i // BATCH + 1}/{(len(updates) - 1) // BATCH + 1}', flush=True)
            time.sleep(1.0)

    print('IMPORT DONE', flush=True)


if __name__ == '__main__':
    main()
