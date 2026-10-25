#!/usr/bin/env python3
"""Read public Overture Places; capture positive contact evidence, never write app data.

Requires duckdb with the official httpfs and spatial extensions. Uses anonymous
public Parquet range reads, not a gated Foursquare download or paid Places API.
"""
import argparse
import datetime
import hashlib
from html import unescape
import ipaddress
import json
import math
import re
import socket
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

STAC = 'https://stac.overturemaps.org'
RELEASE = '2026-10-21.0'
ROW_CAP = 150000


def normalized(value):
    text = ''.join(c for c in unicodedata.normalize('NFKD', value or '').casefold() if not unicodedata.combining(c))
    return ' '.join(''.join(c if c.isalnum() else ' ' for c in text).split())


def distance(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, map(float, [a['latitude'], a['longitude'], b['latitude'], b['longitude']]))
    return 12742000 * math.asin(min(1, math.sqrt(math.sin((lat1-lat2)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon1-lon2)/2)**2)))


def window_contains_radius(venue, bounds):
    west, south, east, north = bounds
    lat, lon = float(venue['latitude']), float(venue['longitude'])
    if not (west < lon < east and south < lat < north):
        return False
    # A fixed longitude margin becomes too small near the poles. Check the
    # actual geographic distance to every window edge before claiming complete
    # identity evidence within the 60-metre matching circle.
    return all(distance(venue, dict(latitude=y, longitude=x)) >= 60
               for x, y in [(west, lat), (east, lat), (lon, south), (lon, north)])


def identity_matches(venue, place):
    name, source_name = normalized(venue['name']), normalized(place.get('names', {}).get('primary'))
    city = normalized(venue.get('city_name'))
    # Only remove the native city as a complete trailing qualifier.
    names = {name}
    if city and name.endswith(' ' + city):
        names.add(name[:-len(city)-1])
    if source_name not in names or not source_name or len(source_name) < 5:
        return False
    addresses = [a for a in place.get('addresses') or [] if a.get('country') == venue['country_code']]
    if not addresses or distance(venue, place) > (60 if venue.get('address') else 30):
        return False
    address = normalized(venue.get('address'))
    if address:
        if not any(len(normalized(a.get('freeform'))) >= 5 and (
            ' ' + address + ' ' in ' ' + normalized(a.get('freeform')) + ' ' or
            ' ' + normalized(a.get('freeform')) + ' ' in ' ' + address + ' '
        ) for a in addresses):
            return False
    return True


def published_phone(place):
    phones = place.get('phones')
    if not isinstance(phones, list) or not phones or any(not isinstance(p, str) for p in phones):
        return None
    # Equivalent punctuation is harmless; distinct published numbers remain
    # ambiguous. The native country codec owns actual normalization.
    values = {}
    for phone in phones:
        if not re.fullmatch(r'[+()\d\s./-]{7,64}', phone) or not 7 <= len(re.sub(r'\D', '', phone)) <= 15:
            return None
        values.setdefault(re.sub(r'[^+\d]', '', phone), phone.strip())
    return next(iter(values.values())) if len(values) == 1 else None


def positive_match(venue, nearby, complete, contact='website'):
    if not complete:
        return None
    # Closed/unknown namesakes still block uniqueness. Do not remove them before
    # counting identities and accidentally select the only readable/open record.
    matches = [p for p in nearby if identity_matches(venue, p)]
    if len(matches) != 1:
        return None
    place = matches[0]
    if place.get('operating_status') != 'open' or (place.get('confidence') or 0) < .9:
        return None
    if not place.get('sources') or any(s.get('license') not in ('CDLA-Permissive-2.0', 'Apache-2.0', 'CC0-1.0') for s in place['sources']):
        return None
    if contact == 'phone':
        return place if published_phone(place) else None
    websites = list(dict.fromkeys(place.get('websites') or []))
    return place if contact == 'website' and len(websites) == 1 else None


def partition_window(venues, bounds):
    """Assign each native identity once, retaining full 60m child margins."""
    west, south, east, north = bounds
    middle_x, middle_y = (west+east)/2, (south+north)/2
    latitude = max(abs(south), abs(north))
    margin_y = .001
    margin_x = max(.001, 75 / (111320 * max(.001, math.cos(math.radians(latitude)))))
    parts = []
    for right in (False, True):
        for upper in (False, True):
            selected = [v for v in venues if (float(v['longitude']) >= middle_x) == right
                        and (float(v['latitude']) >= middle_y) == upper]
            if not selected:
                continue
            child = [max(west, middle_x-margin_x) if right else west, max(south, middle_y-margin_y) if upper else south,
                     east if right else min(east, middle_x+margin_x), north if upper else min(north, middle_y+margin_y)]
            if not all(window_contains_radius(v, child) for v in selected):
                raise ValueError('Child window lost identity neighbourhood coverage')
            parts.append((selected, child))
    return parts


def safe_url(value):
    u = urllib.parse.urlsplit(value)
    if u.scheme not in ('http', 'https') or u.username or u.password or not u.hostname or u.port not in (None, 80, 443):
        raise ValueError('Unsafe URL')
    answers = socket.getaddrinfo(u.hostname, u.port or (443 if u.scheme == 'https' else 80), type=socket.SOCK_STREAM)
    if not answers or any(not ipaddress.ip_address(a[4][0]).is_global for a in answers):
        raise ValueError('Nonpublic destination')
    return value


class PublicRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        safe_url(newurl)
        if urllib.parse.urlsplit(newurl).hostname.removeprefix('www.') != urllib.parse.urlsplit(req.full_url).hostname.removeprefix('www.'):
            raise ValueError('Cross-host redirect requires independent evidence')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def website_identity(venue, place, title, body):
    city_words = set(normalized(venue.get('city_name')).split())
    generic = {'the', 'and', 'at', 'of', 'la', 'le', 'el', 'de', 'der', 'die', 'das', 'ag', 'gmbh', 'ltd', 'inc',
               'bar', 'cafe', 'restaurant', 'hotel', 'lounge', 'club', 'center', 'centre', 'theater', 'theatre', 'gastropub'}
    brand = [word for word in normalized(venue['name']).split() if word not in city_words | generic and len(word) >= 2]
    heading_words = set(normalized(title).split())
    name_match = bool(brand) and all(word in heading_words for word in brand)

    def street(value):
        words = normalized(value).split()
        if venue['country_code'] in ('US', 'CA', 'GB', 'IE', 'AU', 'NZ'):
            expansions = {'st': 'street', 'ave': 'avenue', 'av': 'avenue', 'blvd': 'boulevard', 'rd': 'road', 'dr': 'drive', 'ln': 'lane', 'pl': 'place', 'hwy': 'highway'}
            words = [expansions.get(word, word) for word in words]
        return ' '.join(words)
    # Compare the street line, not a source's duplicated city/state formatting.
    # Keep the source's house number; a city, postcode or suite alone cannot
    # establish ownership of a business website.
    def street_line(value):
        parts = [part.strip() for part in (value or '').split(',')]
        line = parts[0] if parts else ''
        if re.match(r'^(?:suite|unit|floor|room|apt|apartment|level)\b', line, re.I):
            line = parts[1] if len(parts) > 1 else ''
        if (not re.search(r'\d', line) or sum(char.isalpha() for char in normalized(line)) < 3
                or re.match(r'^p[.]?\s*o[.]?\s*box\b', line, re.I)
                or normalized(line) == normalized(venue.get('city_name'))):
            return ''
        return line

    native_address = normalized(venue.get('address'))
    addresses = [a.get('freeform') for a in place.get('addresses') or []
                 if a.get('country') == venue['country_code'] and a.get('freeform')
                 and (not native_address or ' ' + native_address + ' ' in ' ' + normalized(a['freeform']) + ' '
                      or ' ' + normalized(a['freeform']) + ' ' in ' ' + native_address + ' ')]
    lines = [line for value in addresses if (line := street_line(value))]
    address = max(lines, key=len) if lines else street_line(venue.get('address'))
    document = street(unescape(re.sub(r'<[^>]+>', ' ', body)))
    expected = street(address)
    street_match = len(expected) >= 5 and ' ' + expected + ' ' in ' ' + document + ' '
    return {'name_match': name_match, 'street_match': street_match, 'brand_words': brand, 'street_address': address}


def contact_page_urls(root_url, html):
    """Follow only published contact links on the already identified business host."""
    host = urllib.parse.urlsplit(root_url).hostname.removeprefix('www.')
    urls = []
    for match in re.finditer(r"<a\b[^>]*\bhref\s*=\s*[\"']([^\"']+)[\"']", html, re.I):
        try:
            parsed = urllib.parse.urlsplit(urllib.parse.urljoin(root_url, unescape(match[1])))
            if (parsed.scheme not in ('http', 'https') or parsed.username or parsed.password
                    or not parsed.hostname or parsed.hostname.removeprefix('www.') != host
                    or parsed.port not in (None, 80, 443)):
                continue
            if not re.search(r'contact|kontakt|impressum|imprint|about|location|find[-_]?us|ueber[-_]?uns', parsed.path, re.I):
                continue
            url = urllib.parse.urlunsplit(parsed._replace(scheme='https', fragment=''))
            if url.rstrip('/') != root_url.rstrip('/') and url not in urls:
                urls.append(url)
        except ValueError:
            continue
    return urls[:3]


def website_probe(url, venue, place):
    if url.startswith('http://'):
        url = 'https://' + url[7:]
    opener = urllib.request.build_opener(PublicRedirect())

    def read_page(page_url):
        safe_url(page_url)
        with opener.open(urllib.request.Request(page_url, headers={'User-Agent': 'QueerGuide-ContactEvidence/1.0'}), timeout=15) as response:
            body = response.read(500001)
            text = body.decode('utf-8', 'replace')
            title = re.search(r'<title[^>]*>(.*?)</title>', text, re.I | re.S)
            title_text = unescape(title[1]).strip() if title else ''
            identity = website_identity(venue, place, title_text, text)
            page_valid = (response.status == 200 and len(body) > 2000
                          and 'text/html' in response.headers.get('Content-Type', '')
                          and not any(marker in text.lower() for marker in
                                      ('hugedomains.com', 'domain is for sale', 'buy this domain', 'domain has expired')))
            probe = {'status': response.status, 'url': response.url, 'observed_at': now(),
                     'prefix_sha256': hashlib.sha256(body).hexdigest(), 'bytes_read': len(body),
                     'title': title_text or None, 'identity': identity,
                     'usable': identity['name_match'] and identity['street_match'] and page_valid}
            return probe, text, page_valid

    try:
        root, text, valid = read_page(url)
        if root['usable'] or not valid or not root['identity']['name_match']:
            return root
        attempts = []
        for page_url in contact_page_urls(root['url'], text):
            try:
                contact, _, contact_valid = read_page(page_url)
                attempts.append({'url': page_url, 'status': contact['status'],
                                 'street_match': contact['identity']['street_match']})
                if contact_valid and contact['identity']['street_match']:
                    # Keep the contact page's actual title. Brand ownership was
                    # established on its linked same-host homepage; retain both
                    # independent response hashes rather than inventing a title.
                    contact['identity'].update(name_match=True, brand_source_url=root['url'],
                                               brand_title=root['title'], brand_prefix_sha256=root['prefix_sha256'])
                    contact['site_root_probe'] = root
                    contact['contact_attempts'] = attempts
                    contact['usable'] = True
                    return contact
            except Exception as error:
                attempts.append({'url': page_url, 'outcome_unknown': type(error).__name__})
        root['contact_attempts'] = attempts
        return root
    except Exception as error:
        return {'usable': False, 'outcome_unknown': type(error).__name__}


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('candidates')
    parser.add_argument('output')
    parser.add_argument('--bounds', nargs=4, type=float, required=True, metavar=('WEST', 'SOUTH', 'EAST', 'NORTH'))
    parser.add_argument('--collect', action='store_true')
    parser.add_argument('--contact', choices=('website', 'phone'), default='website')
    args = parser.parse_args()
    venues = json.loads(Path(args.candidates).read_text())
    west, south, east, north = args.bounds
    if not (isinstance(venues, list) and 0 < len(venues) <= 2000 and -180 <= west < east <= 180 and -90 <= south < north <= 90 and east-west <= 2 and north-south <= 2):
        raise ValueError('Bounded native candidates and city window required')
    for venue in venues:
        if not window_contains_radius(venue, args.bounds):
            raise ValueError('Window must contain the full matching radius of every venue')
    if not args.collect:
        print(json.dumps({'read_only': True, 'candidates': len(venues), 'bounds': args.bounds, 'release': RELEASE, 'collect': False}))
        return
    def read_stac(url):
        if not url.startswith(STAC + '/'):
            raise ValueError('Unexpected STAC host')
        with urllib.request.urlopen(url, timeout=20) as response:
            return json.loads(response.read(2000000))
    collection_url = f'{STAC}/{RELEASE}/places/place/collection.json'
    collection = read_stac(collection_url)
    items = [read_stac(link['href']) for link in collection['links'] if link['rel'] == 'item']
    assets = [i['assets']['aws']['href'] for i in items if i['bbox'][0] <= east and i['bbox'][2] >= west and i['bbox'][1] <= north and i['bbox'][3] >= south]
    prefix = f'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/{RELEASE}/theme=places/type=place/'
    if not assets or any(not a.startswith(prefix) or not a.endswith('.parquet') for a in assets):
        raise ValueError('Unexpected public release assets')
    import duckdb
    connection = duckdb.connect()
    connection.execute("SET threads=4; SET memory_limit='1GB'; SET http_timeout=30; LOAD httpfs; LOAD spatial;")
    query = '''select to_json(t) from(select id,version,names,confidence,websites,phones,emails,socials,addresses,sources,operating_status,
        ST_X(geometry) longitude,ST_Y(geometry) latitude from read_parquet(?)
        where bbox.xmin between ? and ? and bbox.ymin between ? and ? limit ?)t'''
    # Include records without contacts: their identity can still make a match
    # ambiguous. A contact-only window cannot establish unique identity.
    proofs, windows = [], []
    def scan(selected, bounds, depth=0):
        w, s, e, n = bounds
        rows = [json.loads(r[0]) for r in connection.execute(query, [assets, w, e, s, n, ROW_CAP+1]).fetchall()]
        complete = len(rows) <= ROW_CAP
        if not complete and depth < 3:
            # Never interpret a truncated result as uniqueness. Split the
            # spatial query, including contactless and closed neighbours again.
            del rows
            for child_venues, child_bounds in partition_window(selected, bounds):
                scan(child_venues, child_bounds, depth+1)
            return
        windows.append({'bounds': bounds, 'rows': len(rows), 'complete': complete})
        for venue in selected:
            nearby = [p for p in rows if distance(venue, p) <= 60]
            place = positive_match(venue, nearby, complete, args.contact)
            if not place:
                continue
            payload = json.dumps(nearby, ensure_ascii=False, separators=(',', ':'))
            proof = {**venue, 'venue_id': venue['id'], 'expected_updated_at': venue['updated_at'], 'human_reviewed': False,
                     'place': place, 'website': place['websites'][0] if args.contact == 'website' else None,
                     'phone': published_phone(place) if args.contact == 'phone' else None, 'contact_kind': args.contact,
                     'observed_at': now(), 'release': RELEASE, 'source_url': collection_url, 'assets': assets,
                     'window_complete': complete, 'window_bounds': bounds, 'window_rows': len(rows),
                     'payload_text': payload, 'payload_sha256': hashlib.sha256(payload.encode()).hexdigest(),
                     'website_probe': website_probe(place['websites'][0], venue, place) if args.contact == 'website' else None}
            proofs.append(proof)
    scan(venues, args.bounds)
    complete = all(w['complete'] for w in windows)
    row_count = sum(w['rows'] for w in windows)
    report = {'read_only': True, 'release': RELEASE, 'observed_at': now(), 'assets': assets,
              'bounds': args.bounds, 'rows': row_count, 'complete': complete, 'windows': windows, 'proofs': proofs}
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False))
    print(json.dumps({'read_only': True, 'rows': row_count, 'complete': complete, 'positive': len(proofs), 'usable_websites': sum(bool(p['website_probe'] and p['website_probe']['usable']) for p in proofs), 'published_phones': sum(bool(p['phone']) for p in proofs)}))


if __name__ == '__main__':
    main()
