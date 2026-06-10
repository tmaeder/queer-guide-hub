#!/usr/bin/env python3
"""Arbeitsliste Personen ISO-Datum.xlsx -> personalities_import.json + Berichte.

Read-only gegenueber Produktion: liest lokale DB-Snapshots (/tmp/db_*.json),
schreibt nur Dateien in dieses Verzeichnis. Idempotent & reproduzierbar.
"""
import json, re, unicodedata, collections, datetime, os, sys
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
XLSX = os.path.join(HERE, '..', '..', 'Arbeitsliste Personen ISO-Datum.xlsx')
OUT = HERE
LIST_CREATED = '2026-05-29'  # "erstellt am 29.05.2026" (Altbestand-Fallback fuer reviewed_at)

DATE_RE = re.compile(r'^(\d{4}-\d{2}-\d{2})')
EXCLUDE_FLAGS = {'kinderschutz', 'ausschluss', 'loeschung_vorgeschlagen'}
OUTING_FLAGS = {'queerness_nicht_verifizierbar', 'queerness_umstritten',
                'nicht_oeffentlich_geoutet', 'queerness_zu_pruefen'}


def norm(s):
    s = unicodedata.normalize('NFKD', (s or '').lower()).replace('’', "'")
    return re.sub(r'[^a-z0-9 ]', '', s).strip()


def slugify(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    s = re.sub(r'[^a-zA-Z0-9]+', '-', s.lower()).strip('-')
    return s or 'unnamed'


def split_semi(v):
    return [p.strip() for p in str(v).split(';') if p.strip()] if v else []


def load_rows():
    wb = openpyxl.load_workbook(XLSX, data_only=True, read_only=True)
    ws = wb['Arbeitsliste_A4']
    rows = list(ws.iter_rows(values_only=True))
    header = rows[3]
    cols = {n: i for i, n in enumerate(header) if n}
    data = [r for r in rows[4:] if r[0] not in (None, 'Name')]
    return cols, data


# Liste nutzt deutsche Exonyme, cities-Tabelle englische Namen
CITY_ALIASES = {
    'koln': 'cologne', 'mexikostadt': 'mexico city', 'mexikostadt mexikostadt': 'mexico city',
    'breslau': 'wroclaw', 'warschau': 'warsaw', 'mailand': 'milan', 'rom': 'rome',
    'neapel': 'naples', 'venedig': 'venice', 'florenz': 'florence', 'genf': 'geneva',
    'brussel': 'brussels', 'kopenhagen': 'copenhagen', 'lissabon': 'lisbon',
    'moskau': 'moscow', 'sankt petersburg': 'saint petersburg', 'prag': 'prague',
    'athen': 'athens', 'bukarest': 'bucharest', 'belgrad': 'belgrade', 'kairo': 'cairo',
    'havanna': 'havana', 'tokio': 'tokyo', 'peking': 'beijing', 'nizza': 'nice',
    'antwerpen': 'antwerp', 'den haag': 'the hague', 'krakau': 'krakow',
    'danzig': 'gdansk', 'stettin': 'szczecin', 'nurnberg': 'nuremberg',
    'hannover': 'hanover', 'zurich': 'zurich', 'sevilla': 'seville', 'turin': 'turin',
}


def parse_place(place):
    """'Tampa (FL, US)' -> ('Tampa', 'US'); 'Basel (CH)' -> ('Basel', 'CH')."""
    if not place:
        return None, None
    m = re.match(r'^(.*?)\s*\(([^)]*)\)\s*$', str(place).strip())
    if not m:
        return str(place).strip(), None
    city = m.group(1).strip() or None
    parts = [p.strip() for p in m.group(2).split(',')]
    cc = parts[-1] if parts and re.match(r'^[A-Z]{2}$', parts[-1]) else None
    return city, cc


def main():
    cols, data = load_rows()
    g = lambda r, n: r[cols[n]]

    db = json.load(open('/tmp/db_personalities.json'))
    countries = json.load(open('/tmp/db_countries.json'))
    cities = json.load(open('/tmp/db_cities.json'))
    qids = {p['id']: p['wikidata_qid'] for p in json.load(open('/tmp/db_qids.json'))}
    wikidata_cache = {}
    cache_path = os.path.join(OUT, 'wikidata_cache.json')
    if os.path.exists(cache_path):
        wikidata_cache = json.load(open(cache_path))

    dbmap = collections.defaultdict(list)
    for p in db:
        dbmap[norm(p['name'])].append(p)
    db_slugs = {p['slug'] for p in db}
    country_by_code = {c['code']: c for c in countries}
    cities_by_country = collections.defaultdict(dict)
    for c in cities:
        cities_by_country[c['country_id']][norm(c['name'])] = c

    records, unresolved, conflicts, dup_candidates = [], [], [], []
    seen_slugs = {}
    seen_norm = collections.defaultdict(list)

    for idx, r in enumerate(data):
        name = str(g(r, 'Name')).strip()
        nkey = norm(name)
        seen_norm[nkey].append(name)

        flags = set(split_semi(g(r, 'Flags')))
        anm = g(r, 'Anmerkungen / Unklarheiten')
        birth = g(r, 'Geb. Datum')
        death = g(r, 'Todestag')
        byear = g(r, 'Geburtsjahr')
        dyear = g(r, 'Todesjahr')
        land = str(g(r, 'Land (ISO)')).strip() if g(r, 'Land (ISO)') else None
        if land == 'UK':
            land = 'GB'  # Liste nutzt UK, ISO-3166 ist GB
        elif land and not re.match(r'^[A-Z]{2}$', land):
            m = re.search(r'\(([A-Z]{2})\)\s*$', land)  # z.B. 'Weinfeld, Landkreis Roth (DE)'
            if m:
                unresolved.append({'row': idx + 5, 'name': name,
                                   'reason': f'Land-Spalte enthielt Ortsangabe, ISO extrahiert: {land} -> {m.group(1)}'})
                land = m.group(1)

        # --- DB-Match (name_normalized, Tiebreaker Geburtsdatum) ---
        hits = dbmap.get(nkey, [])
        match, match_note = None, None
        if len(hits) == 1:
            match = hits[0]
        elif len(hits) > 1:
            bd_hits = [h for h in hits if birth and h['birth_date'] == str(birth)]
            if len(bd_hits) == 1:
                match, match_note = bd_hits[0], 'disambiguated_by_birth_date'
            else:
                unresolved.append({'row': idx + 5, 'name': name, 'reason': 'mehrdeutiger DB-Match',
                                   'candidates': [{'id': h['id'], 'slug': h['slug'], 'birth_date': h['birth_date']} for h in hits]})
        if match and birth and match['birth_date'] and str(birth) != match['birth_date']:
            conflicts.append({'row': idx + 5, 'name': name, 'list_birth_date': str(birth),
                              'db_birth_date': match['birth_date'], 'db_id': match['id']})

        # --- Slug (Upsert-Key) ---
        slug = None
        if match:
            slug = match['slug']
            if slug in seen_slugs:
                # Apostroph-Variantenpaar matcht denselben DB-Eintrag -> zweite
                # Zeile als eigener (neuer) Record fuehren, Duplikat-Klaerung bei Ralf
                match, wikidata_qid = None, None
                slug = slugify(name)
        if not match:
            if slug is None:
                slug = slugify(name)
            if slug in seen_slugs or slug in db_slugs:
                suffix = str(int(byear)) if byear else 'neu'
                slug = f'{slug}-{suffix}'
            n = 2
            base = slug
            while slug in seen_slugs:
                slug = f'{base}-{n}'; n += 1
        seen_slugs[slug] = name

        # --- Geo-Links ---
        country_id = None
        if land and land in country_by_code:
            country_id = country_by_code[land]['id']
        elif land:
            unresolved.append({'row': idx + 5, 'name': name, 'reason': f'Land-ISO unbekannt: {land}'})
        bp_city, bp_cc = parse_place(g(r, 'Geburtsort'))
        birth_city_id = None
        cc = bp_cc or land
        if cc == 'UK':
            cc = 'GB'
        if bp_city and cc and cc in country_by_code:
            pool = cities_by_country[country_by_code[cc]['id']]
            cand = norm(bp_city)
            variants = [cand, cand.split(',')[0].strip() if ',' in bp_city else None,
                        norm(bp_city.split(',')[0])]
            variants += [CITY_ALIASES.get(v) for v in list(variants) if v]
            hit = next((pool[v] for v in variants if v and v in pool), None)
            if hit:
                birth_city_id = hit['id']
            else:
                unresolved.append({'row': idx + 5, 'name': name,
                                   'reason': f'Geburtsort-Stadt nicht in cities: {bp_city} ({cc})'})

        # --- Tags / Achievements ---
        tags = split_semi(g(r, 'Berufe (Schlüssel)')) + [t.lstrip('#') for t in split_semi(g(r, 'Hashtags'))]
        if 'meilenstein' in flags:
            tags.append('milestone')
        tags = sorted(set(t.lower() for t in tags))
        achievements = []
        if g(r, 'Meilenstein'):
            achievements.append({'type': 'milestone', 'text': str(g(r, 'Meilenstein')).strip()})
        for key in split_semi(g(r, 'Preise (Schlüssel)')):
            achievements.append({'type': 'award', 'key': key})
        if g(r, 'Auszeichnungen (Detail)'):
            achievements.append({'type': 'award_detail', 'text': str(g(r, 'Auszeichnungen (Detail)')).strip()})

        # --- Sensitivity / Sichtbarkeit ---
        sens = {}
        if g(r, 'Geschlecht (intern)'):
            sens['gender_internal'] = str(g(r, 'Geschlecht (intern)'))
        if g(r, 'trans/inter (intern)'):
            sens['trans_inter_internal'] = str(g(r, 'trans/inter (intern)'))
        if flags:
            sens['list_flags'] = sorted(flags)
        excluded = bool(flags & EXCLUDE_FLAGS)
        outing_risk = bool(flags & OUTING_FLAGS)
        draft = excluded or outing_risk

        # --- Review-Stempel (User-Entscheid: alle Zeilen) ---
        ea = str(g(r, 'Erfasst am') or '')
        m = DATE_RE.match(ea)
        reviewed_at = m.group(1) if m else LIST_CREATED
        source_checked = bool(anm and re.search(r'gepr(ue|ü)ft 20\d\d', str(anm), re.I))

        # --- Wikidata (Cache aus enrich-Lauf; DB-QID hat Vorrang) ---
        wikidata_qid, enr = None, []
        db_skip = bool(match and str(qids.get(match['id'], '')).startswith('SKIP_'))
        if match and match['id'] in qids and not db_skip:
            wikidata_qid = qids[match['id']]
        elif db_skip:
            pass  # DB-Resolver hat bewusst uebersprungen -> nicht neu aufloesen
        elif nkey in wikidata_cache and wikidata_cache[nkey].get('qid'):
            wikidata_qid = wikidata_cache[nkey]['qid']
            enr.append({'field': 'wikidata_qid', 'enrichment_source': 'wikidata',
                        'enrichment_verified': False})
        if country_id:
            enr.append({'field': 'country_id', 'enrichment_source': 'geo-link', 'enrichment_verified': False})
        if birth_city_id:
            enr.append({'field': 'city_id', 'enrichment_source': 'geo-link', 'enrichment_verified': False})

        is_living = not (death or dyear)
        rec = {
            'slug': slug,
            'existing_id': match['id'] if match else None,
            'name': name,
            'birth_date': str(birth) if birth else None,
            'birth_year_only': int(byear) if (byear and not birth) else None,
            'death_date': str(death) if death else None,
            'death_year_only': int(dyear) if (dyear and not death) else None,
            'birth_place': str(g(r, 'Geburtsort')).strip() if g(r, 'Geburtsort') else None,
            'death_place': str(g(r, 'Todesort')).strip() if g(r, 'Todesort') else None,
            'is_living': is_living,
            'profession': str(g(r, 'Beruf')).strip() if g(r, 'Beruf') else None,
            'nationality': land,
            'country_id': country_id,
            'city_id': birth_city_id,
            'tags': tags or None,
            'achievements': achievements or None,
            'fields': {'parties': split_semi(g(r, 'Partei(en)'))} if g(r, 'Partei(en)') else None,
            'lgbti_connection_source': str(g(r, 'Quelle')).strip() if g(r, 'Quelle') else None,
            'wikidata_qid': wikidata_qid,
            'sensitivity_flags': sens or None,
            'visibility': 'draft' if draft else None,
            'needs_attention': True if draft else None,
            'seo_indexable': False if excluded else None,
            'review_status': 'manually_verified',
            'reviewed_by': 'Ralf',
            'reviewed_at': reviewed_at,
            'source_checked_marker': source_checked,
            'internal_notes': str(anm).strip() if anm else None,
            'birth_date_conflict': bool(match and birth and match['birth_date'] and str(birth) != match['birth_date']),
            'enrichment': enr or None,
            'enrichment_verified': False if enr else None,
        }
        records.append(rec)

    for k, names in seen_norm.items():
        if len(names) > 1:
            dup_candidates.append(names)

    # ---- Selbstchecks ----
    assert len(records) == len(data), f'{len(records)} != {len(data)}'
    assert len(seen_slugs) == len(records), 'slugs nicht eindeutig'
    for rec in records:
        for f in ('birth_date', 'death_date', 'reviewed_at'):
            v = rec[f]
            assert v is None or re.match(r'^\d{4}-\d{2}-\d{2}$', v), (rec['name'], f, v)
    n_excluded = sum(1 for rec in records if rec['seo_indexable'] is False)
    assert all(rec['visibility'] == 'draft' for rec in records if rec['seo_indexable'] is False)

    meta = {
        'source_file': 'Arbeitsliste Personen ISO-Datum.xlsx',
        'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
        'upsert_key': 'slug',
        'counts': {
            'records': len(records),
            'matched_existing': sum(1 for r in records if r['existing_id']),
            'new': sum(1 for r in records if not r['existing_id']),
            'draft_gated': sum(1 for r in records if r['visibility'] == 'draft'),
            'exclusion_flagged': n_excluded,
            'birth_date_conflicts': len(conflicts),
            'unresolved': len(unresolved),
            'wikidata_qid_set': sum(1 for r in records if r['wikidata_qid']),
            'wikidata_from_enrichment': sum(1 for r in records if r['enrichment'] and any(e['field'] == 'wikidata_qid' for e in r['enrichment'])),
        },
    }
    json.dump({'meta': meta, 'records': records}, open(os.path.join(OUT, 'personalities_import.json'), 'w'),
              ensure_ascii=False, indent=1)
    json.dump({'unresolved': unresolved, 'conflicts': conflicts, 'duplicate_candidates': dup_candidates},
              open(os.path.join(OUT, '_issues.json'), 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(meta['counts'], indent=2))

    # Ziel-Liste fuer Wikidata-Enrichment (ohne QID, nicht ausgeschlossen)
    targets = [{'key': norm(r['name']), 'name': r['name'],
                'birth_year': int(r['birth_date'][:4]) if r['birth_date'] else r['birth_year_only'],
                'death_year': int(r['death_date'][:4]) if r['death_date'] else r['death_year_only']}
               for r in records if not r['wikidata_qid']]
    json.dump(targets, open(os.path.join(OUT, 'wikidata_targets.json'), 'w'), ensure_ascii=False)
    print('wikidata targets:', len(targets))


if __name__ == '__main__':
    main()
