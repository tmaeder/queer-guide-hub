#!/usr/bin/env python3
"""Compare real production classifier functions before/after execution-only patch."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[3]
PG = Path(os.environ.get('PG_BIN', '/opt/homebrew/opt/postgresql@17/bin'))
with tempfile.TemporaryDirectory(prefix='jev-taxonomy-pg-') as tmp:
    data, sock = Path(tmp) / 'data', Path(tmp) / 'sock'
    sock.mkdir()
    subprocess.run([str(PG / 'initdb'), '-D', str(data), '-A', 'trust', '--no-locale', '--encoding=UTF8'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([str(PG / 'pg_ctl'), '-D', str(data), '-l', str(Path(tmp) / 'pg.log'), '-o', f'-k {sock} -p 55442 -h ""', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    def sql(query):
        r = subprocess.run([str(PG / 'psql'), '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', str(sock), '-p', '55442', 'postgres'], input="set statement_timeout='90s';\n" + query, text=True, capture_output=True, timeout=100)
        if r.returncode:
            raise AssertionError(r.stderr)
        return r.stdout.strip()
    try:
        sql('set check_function_bodies=false;\n' + (ROOT / 'supabase/tests/fixtures/jev_marketplace_taxonomy_baseline.sql').read_text())
        cases = [
            (None, None), ('', ''), ('accessories', 'Rainbow cotton tote'), ('underwear', 'Cotton briefs'), ('books', 'Pride memoir'), ('tops', 'Cotton tee'),
            ('Swimwear', 'Swim briefs'), ('underwear and swimwear', 'Bikini string thong'), ('art', 'Print slip dress'), ('gift cards', 'Gift card'),
            ('accessories', 'Packing strap'), ('sex toys', 'FTM packer with panty'), ('grooming', 'Toy cleaner'), ('apparel', 'Cotton socks'),
            ('jewelry', 'Cuff ring'), ('bondage', 'Thumb cuffs'), ('lingerie', 'Wrap cuff'), ('apparel', 'Cycling kit'),
        ]
        for group, title in [
            ('outerwear', 'Winter hoodie'), ('bottoms', 'Denim jeans'), ('accessories', 'Rainbow pins'), ('jewelry', 'Silver earrings'),
            ('swimwear', 'One piece swimsuit'), ('books', 'Queer graphic novel'), ('books', 'Poetry collection'), ('art', 'Postcards'),
            ('grooming', 'Body soap'), ('grooming', 'Skin cream'), ('sex toys', 'Oral toy'), ('anal toys', 'Prostate toy'),
            ('dildos', 'Fantasy dildo'), ('vibrators', 'App controlled vibrator'), ('safer sex', 'Douching kit'), ('bondage', 'Shibari rope'),
            ('fetish gear', 'Leather gloves'), ('other', 'Unclassified item'), ('services', 'Coaching session'), ('apparel', 'Robe'),
        ]:
            for suffix in ['', ' - LIMITED EDITION', " - l'été"]:
                cases.append((group, title + suffix))
        payload = json.dumps([{'id': i, 'subcategory': s, 'title': t} for i, (s, t) in enumerate(cases)]).replace("'", "''")
        sql(f"create table inputs as select * from jsonb_to_recordset('{payload}'::jsonb) as t(id integer,subcategory text,title text);")
        evaluation = "select id,public.marketplace_subcategory_group(subcategory,title) as category_group,public.marketplace_subcategory_fine(subcategory,title) as fine from inputs"
        start = time.monotonic()
        sql('create table baseline as ' + evaluation)
        before_ms = (time.monotonic() - start) * 1000
        migration = (ROOT / 'supabase/migrations/20261029222136_marketplace_taxonomy_evaluate_once.sql').read_text()
        sql(migration)
        sql(migration)  # no repeated wrapping on retry
        start = time.monotonic()
        sql('create table optimized as ' + evaluation)
        after_ms = (time.monotonic() - start) * 1000
        mismatches = int(sql('select count(*) from baseline b full join optimized o using(id) where b.category_group is distinct from o.category_group or b.fine is distinct from o.fine;'))
        assert mismatches == 0, 'Execution optimization changed taxonomy semantics'
        assert json.loads(sql("select jsonb_agg(jsonb_build_object('group',category_group,'fine',fine) order by id) from optimized where id between 2 and 5;")) == [
            {'group': 'accessories', 'fine': 'bags'}, {'group': 'underwear', 'fine': 'briefs'}, {'group': 'books', 'fine': 'memoir'}, {'group': 'tops', 'fine': 't_shirts'},
        ]
        # Do not enforce machine-dependent timing in CI; retain measured evidence.
        print(json.dumps({'passed': True, 'cases': len(cases), 'semantic_mismatches': mismatches, 'baseline_ms': round(before_ms, 2), 'optimized_ms': round(after_ms, 2)}))
    finally:
        subprocess.run([str(PG / 'pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
