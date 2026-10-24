#!/usr/bin/env python3
"""Capture individual public AccessDenied responses; never write app data."""
import argparse
import concurrent.futures
import datetime
import hashlib
import json
import re
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

URL = re.compile(r'^https://gaycities-featured-images-production\.s3\.amazonaws\.com/events/(?:t/sm/|originals/)?[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def probe(row):
    result = dict(row)
    url = row.get('image_url', '')
    if not isinstance(url, str) or not URL.fullmatch(url):
        return {**result, 'usable_denial': False, 'reason': 'unsupported_registered_url'}
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'QueerGuide-SourceArtworkAudit/1.0', 'Accept': 'image/*,application/xml'})
        try:
            response = urllib.request.build_opener(NoRedirect).open(request, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            body = response.read(8193)
            mime = response.headers.get('Content-Type', '').split(';')[0].strip().lower()
            result.update(status=response.status, mime_type=mime, byte_size=len(body),
                          observed_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
        if response.status != 403 or mime != 'application/xml' or not 0 < len(body) <= 8192:
            return {**result, 'usable_denial': False, 'reason': 'not_verified_access_denied'}
        text = body.decode('utf-8')
        if ET.fromstring(text).findtext('Code') != 'AccessDenied':
            return {**result, 'usable_denial': False, 'reason': 'different_xml_error'}
        return {**result, 'usable_denial': True, 'response_body': text,
                'response_sha256': hashlib.sha256(body).hexdigest(), 'human_reviewed': False}
    except (OSError, ValueError, ET.ParseError) as error:
        return {**result, 'usable_denial': False, 'reason': type(error).__name__}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('candidates')
    parser.add_argument('output')
    parser.add_argument('--collect', action='store_true')
    args = parser.parse_args()
    rows = json.loads(Path(args.candidates).read_text())
    if not isinstance(rows, list) or len(rows) > 1000:
        raise ValueError('At most one thousand native candidates required')
    path = Path(args.output)
    if path.exists():
        raise ValueError('Use a fresh evidence path')
    if not args.collect:
        print(json.dumps({'read_only': True, 'candidates': len(rows), 'collect': False}))
        return
    proofs = []
    path.parent.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for future in concurrent.futures.as_completed([pool.submit(probe, row) for row in rows]):
            proofs.append(future.result())
            if len(proofs) % 25 == 0 or len(proofs) == len(rows):
                temporary = path.with_suffix(path.suffix + '.tmp')
                temporary.write_text(json.dumps({'read_only': True, 'proofs': proofs, 'complete': len(proofs) == len(rows)}))
                temporary.replace(path)
                print(json.dumps({'examined': len(proofs), 'usable_denials': sum(p.get('usable_denial') is True for p in proofs)}), flush=True)

if __name__ == '__main__':
    main()
