#!/usr/bin/env python3
"""Verify curated public source candidates; never infer an edition date.

Produces a reviewable evidence manifest. It performs no database writes.
Only reviewed candidates belong in the input; text matching is a transport/content
check, not an automatic entity resolver. Failed checks remain explicit.
"""
import argparse
import concurrent.futures
import datetime
import hashlib
import html.parser
import ipaddress
import json
import re
import socket
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def public_url(url):
    p = urllib.parse.urlsplit(url)
    if p.scheme != 'https' or not p.hostname or p.username or p.password or p.port not in (None, 443):
        raise ValueError('Only public HTTPS sources without credentials are allowed')
    addresses = socket.getaddrinfo(p.hostname, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('Non-public destination')
    return url


class Redirects(urllib.request.HTTPRedirectHandler):
    max_redirections = 4

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        public_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class Text(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag in ('script', 'style') and self.hidden:
            self.hidden -= 1

    def handle_data(self, text):
        if not self.hidden:
            self.parts.append(text)


def normalized(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s.casefold()) if not unicodedata.combining(c))


def verify(row):
    out = dict(row, checked_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
    try:
        url = public_url(row['candidate_url'])
        request = urllib.request.Request(url, headers={'User-Agent': 'QueerGuide-EvidenceAudit/1.0', 'Accept': 'text/html'})
        with urllib.request.build_opener(Redirects()).open(request, timeout=15) as response:
            if 'html' not in response.headers.get('Content-Type', ''):
                raise ValueError('Not an HTML page')
            raw = response.read(1_000_001)
            truncated = len(raw) > 1_000_000
            raw = raw[:1_000_000]
            parser = Text()
            parser.feed(raw.decode('utf-8', errors='replace'))
            text = ' '.join(' '.join(parser.parts).split())
            term = row['identity_term']
            pos = normalized(text).find(normalized(term))
            if pos < 0:
                raise ValueError('Reviewed identity term absent from live page')
            # Store a short attributable quote, not an entire third-party page.
            quote = ' '.join(text[max(0, pos-30):pos+200].split()[:12])
            if re.search(r'just a moment|verify you are human|access denied', text[:300], re.I):
                raise ValueError('Challenge page, not source evidence')
            out.update(status='verified', source_url=response.url, http_status=response.status,
                       evidence_quote=quote, content_sha256=hashlib.sha256(raw).hexdigest(),
                       content_truncated=truncated, scope='series_identity', dates_confirmed=False)
    except (urllib.error.URLError, ValueError, OSError) as exc:
        out.update(status='unverified', error=str(exc)[:200])
    return out


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('manifest', type=Path)
    args.add_argument('output', type=Path)
    ns = args.parse_args()
    rows = json.loads(ns.manifest.read_text())
    previous = json.loads(ns.output.read_text()) if ns.output.exists() else []
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=24)
    cache = {(r['candidate_url'],r['identity_term']):r for r in previous
             if r.get('status') == 'verified' and datetime.datetime.fromisoformat(r['checked_at']) > cutoff}
    # Deduplicate shared organizer pages before fetching; keep edition records separate.
    unique = {(r['candidate_url'], r['identity_term']): r for r in rows}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        checked = list(cache.values()) + list(pool.map(verify, [r for k,r in unique.items() if k not in cache]))
    by_url = {(r['candidate_url'], r['identity_term']): r for r in checked}
    results = [dict(r, **{k:v for k,v in by_url[(r['candidate_url'],r['identity_term'])].items()
                         if k not in r}) for r in rows]
    ns.output.write_text(json.dumps(results, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'records':len(results),'verified':sum(r['status']=='verified' for r in results),
                      'unverified':[{k:r.get(k) for k in ('id','title','candidate_url','error')}
                                    for r in results if r['status']!='verified']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
