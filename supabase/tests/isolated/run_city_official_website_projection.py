#!/usr/bin/env python3
"""Verify the prepared public city URL projection without widening private data."""
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
PG = Path(os.environ.get("PG_BINDIR", "/opt/homebrew/opt/postgresql@17/bin"))
baseline = (ROOT / "supabase/tests/fixtures/jev-public-record-city-website-baseline.sql").read_text()
# A matching key list in a comment must not inflate the code-anchor count.
baseline = baseline.replace("AS $function$\n", "AS $function$\n-- Previous keys: 'body','content','website','source_url'\n", 1)
patch = (ROOT / "supabase/migrations/99991795038043_review_city_official_website_projection.sql").read_text()
schema = r"""
create schema api_private;
create function api_private.jev_source_urls(j jsonb)returns jsonb language sql as $$select j$$;
create temp table input as select '{"id":"city-id","name":"Example municipality","official_website":"https://municipality.example/","website":"https://example.org/","private_email":"DO_NOT_EXPORT","api_key":"DO_NOT_EXPORT","phone":"DO_NOT_EXPORT"}'::jsonb j;
"""
before = r"""
create temp table projected_before as select api_private.jev_public_record(j)j from input;
do $$begin
 if exists(select 1 from projected_before where j?'official_website')then raise exception 'Old omission not reproduced';end if;
end$$;
create temp table function_before as select proowner,proacl,proconfig,prosecdef from pg_proc where oid='api_private.jev_public_record(jsonb)'::regprocedure;
"""
checks = r"""
do $$declare result jsonb;begin
 select api_private.jev_public_record(j)into result from input;
 if result->>'official_website'<>'https://municipality.example/'then raise exception 'Official public locator lost';end if;
 if result-'official_website'is distinct from(select j from projected_before)then raise exception 'Other projection fields changed';end if;
 if result?|array['private_email','api_key','phone']then raise exception 'Private field exported';end if;
 if api_private.jev_public_record(null)is not null or api_private.jev_public_record('[]')is not null then raise exception 'Invalid record behavior changed';end if;
 if length(api_private.jev_public_record(jsonb_build_object('official_website',repeat('x',19000)))->>'official_website')<>18000 then raise exception 'String bound changed';end if;
 if exists(select 1 from function_before b cross join pg_proc p where p.oid='api_private.jev_public_record(jsonb)'::regprocedure and row(p.proowner,p.proacl,p.proconfig,p.prosecdef)is distinct from row(b.proowner,b.proacl,b.proconfig,b.prosecdef))then raise exception 'Function security changed';end if;
end$$;
"""
with tempfile.TemporaryDirectory(prefix="qg-city-url-") as tmp:
    data = str(Path(tmp) / "data")
    subprocess.run([str(PG / "initdb"), "-D", data, "-A", "trust", "--no-locale"], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([str(PG / "pg_ctl"), "-D", data, "-l", str(Path(tmp) / "postgres.log"), "-o", f"-k {tmp} -p 55494 -c listen_addresses=", "-w", "start"], check=True, stdout=subprocess.DEVNULL)
    try:
        result = subprocess.run([str(PG / "psql"), "-X", "-h", tmp, "-p", "55494", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], input=schema + baseline + before + patch + patch + checks, text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError(result.stderr)
    finally:
        subprocess.run([str(PG / "pg_ctl"), "-D", data, "-m", "fast", "-w", "stop"], check=True, stdout=subprocess.DEVNULL)
print("PASS: old city URL omission reproduced; only official public locator added; private fields, bounds, null handling, security and idempotence preserved")
