#!/usr/bin/env python3
"""Wikidata-QID-Aufloesung fuer wikidata_targets.json -> wikidata_cache.json.

Konservativ: nur eindeutige Treffer (P31=Q5 Mensch + Geburts-/Todesjahr passt,
oder exakter Label-Match wenn keine Jahresdaten vorhanden -> dann nur bei genau
1 Human-Kandidaten). Resumable: Cache wird alle 50 Eintraege geschrieben.
~3 req/s, hoeflicher User-Agent.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'wikidata_cache.json')
TARGETS = os.path.join(HERE, 'wikidata_targets.json')
UA = 'queer.guide data import (tmaeder@me.com)'
API = 'https://www.wikidata.org/w/api.php'


def api(params):
    params = dict(params, format='json')
    url = API + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.load(resp)
        except Exception as e:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))


def year_of(claims, prop):
    for c in claims.get(prop, []):
        try:
            t = c['mainsnak']['datavalue']['value']['time']
            m = re.match(r'^[+-](\d{4})', t)
            if m:
                return int(m.group(1))
        except (KeyError, TypeError):
            continue
    return None


def resolve(name, birth_year, death_year):
    found = api({'action': 'wbsearchentities', 'search': name, 'language': 'de',
                 'uselang': 'de', 'type': 'item', 'limit': 8})
    cands = found.get('search', [])
    if not cands:
        found = api({'action': 'wbsearchentities', 'search': name, 'language': 'en',
                     'type': 'item', 'limit': 8})
        cands = found.get('search', [])
    if not cands:
        return None, 'no_candidates'
    ids = [c['id'] for c in cands]
    ents = api({'action': 'wbgetentities', 'ids': '|'.join(ids),
                'props': 'claims|labels', 'languages': 'de|en'})
    humans = []
    for qid in ids:
        ent = ents.get('entities', {}).get(qid, {})
        claims = ent.get('claims', {})
        is_human = any(
            c.get('mainsnak', {}).get('datavalue', {}).get('value', {}).get('id') == 'Q5'
            for c in claims.get('P31', []))
        if not is_human:
            continue
        humans.append({'qid': qid, 'by': year_of(claims, 'P569'), 'dy': year_of(claims, 'P570'),
                       'labels': {l['value'].lower() for l in ent.get('labels', {}).values()}})
    if not humans:
        return None, 'no_human'
    if birth_year or death_year:
        hits = [h for h in humans
                if (birth_year is None or h['by'] == birth_year)
                and (death_year is None or h['dy'] == death_year)]
        if len(hits) == 1:
            return hits[0]['qid'], 'matched_dates'
        return None, f'ambiguous_dates_{len(hits)}'
    exact = [h for h in humans if name.lower() in h['labels']]
    if len(exact) == 1 and len(humans) == 1:
        return exact[0]['qid'], 'matched_label_unique'
    return None, f'ambiguous_nodates_{len(humans)}'


def main():
    targets = json.load(open(TARGETS))
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    todo = [t for t in targets if t['key'] not in cache]
    print(f'targets {len(targets)}, cached {len(targets) - len(todo)}, todo {len(todo)}', flush=True)
    done = 0
    for t in todo:
        try:
            qid, reason = resolve(t['name'], t['birth_year'], t['death_year'])
        except Exception as e:
            qid, reason = None, f'error:{e}'
        cache[t['key']] = {'qid': qid, 'reason': reason, 'name': t['name']}
        done += 1
        if done % 50 == 0:
            json.dump(cache, open(CACHE, 'w'), ensure_ascii=False)
            print(f'{done}/{len(todo)} resolved={sum(1 for v in cache.values() if v["qid"])}', flush=True)
        time.sleep(0.35)
    json.dump(cache, open(CACHE, 'w'), ensure_ascii=False)
    print('DONE', len(cache), 'resolved', sum(1 for v in cache.values() if v['qid']), flush=True)


if __name__ == '__main__':
    main()
