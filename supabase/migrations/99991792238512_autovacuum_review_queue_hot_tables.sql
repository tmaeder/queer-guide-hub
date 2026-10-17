-- Per-table autovacuum cadence for the two tables whose stale visibility map was the
-- single biggest cost in get_admin_review_queue(), measured 2026-10-17.
--
-- WHAT THIS IS THE DURABLE FORM OF. A manual `VACUUM (ANALYZE)` on these two tables took
-- the dominant union branch from 71,103 blocks / 220,896 heap fetches / 12,667 ms to
-- 24,761 / 0 / 212 ms -- 2.9x fewer blocks and 60x faster, from maintenance alone, and it
-- is what took the RPC off authenticated's 8s ceiling (`decisions` 9,372 ms -> ~2,500 ms,
-- i.e. signed-in admins had been getting 500s on /admin). That win decays as dead tuples
-- rebuild, so this is the setting that keeps it rather than a one-shot.
--
-- THE MECHANISM IS AN INDEX-ONLY SCAN LOSING ITS VISIBILITY MAP, not bloat in general.
-- `admin_review_src_business_quality` reads entity_quality_findings through
-- entity_quality_findings_admin_review_cover_idx and organizations through
-- organizations_pkey. An index-only scan has to visit the heap for every row whose page is
-- not marked all-visible, so the scan degrades from "read the index" to "read the index AND
-- 220,896 heap pages" as soon as a few percent of pages go unmarked. UPDATE clears those
-- bits; only VACUUM restores them.
--
-- WHY THE DEFAULT IS TOO LATE, with the arithmetic rather than an assertion. Default
-- autovacuum fires at 50 + 0.2 * reltuples, and measured on prod today:
--     entity_quality_findings   940,597 rows   default 188,169   this file 19,812
--     organizations             100,226 rows   default  20,095   this file  3,005
-- Both tables were sitting in exactly the gap those numbers describe when this was
-- written -- 59,248 and 12,045 dead tuples respectively, above the tight threshold and
-- below the default, with autovacuum correctly declining to run while the map rotted.
-- entity_quality_findings has taken 1,066,464 updates and 0 inserts, so the churn is
-- entirely the kind that clears visibility bits.
--
-- 0.02 AND NOT 0.05, AND THE REPO ALREADY DECIDED THIS. Twelve tables carry these options.
-- Nine use 0.05/1000; `events` and `marketplace_listings` -- the large hot ones -- use
-- 0.02/1000. The tie-breaker is measured rather than aesthetic: `venues` ALREADY carries
-- 0.05/1000 and still degraded badly enough this morning to need a manual vacuum
-- (24,167 blocks -> 147). For a table an index-only scan depends on, 0.05 is not enough.
--
-- TOTAL VACUUM WORK IS ROUGHLY UNCHANGED, which is what makes this safe on a
-- disk-constrained instance: the same dead tuples get collected either way, just in more
-- frequent smaller runs instead of one large one. A vacuum with an intact map only visits
-- pages that need it, so the smaller runs are individually cheap -- and keeping the map
-- intact is the entire point.
--
-- `venues` IS DELIBERATELY NOT INCLUDED. Re-measured at write time it holds 20 dead tuples
-- against 31 updates, so its 0.05 is working and its 94.6% all-visible is the residue of
-- this morning's manual vacuum rather than live churn. Tightening a table that is not
-- degrading would be a change with no measurement behind it.
--
-- NO SENTINEL, and that is a deliberate omission rather than an oversight. The obvious one
-- is wrong: `relallvisible` is a planner ESTIMATE refreshed only by vacuum, and it read
-- 100.0% on entity_quality_findings while that scan was doing 220,896 heap fetches -- so a
-- check on it would have passed throughout the incident it exists to catch. The honest
-- instrument is `Heap Fetches` in a real plan, which is too expensive for a health poll.
-- A settings-presence check is possible but needs a new definer function to reach pg_class
-- through PostgREST, and would watch 2 of the 14 tables that carry these options while the
-- other 12 go unwatched. A general "large table with no autovacuum reloptions" invariant is
-- the right shape and is its own change, because it would flag tables this file does not own.
--
-- Reversible in one statement: `alter table ... reset (autovacuum_vacuum_scale_factor,
-- autovacuum_vacuum_threshold);` returns each table to the cluster default.

alter table public.entity_quality_findings
  set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 1000);

alter table public.organizations
  set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 1000);

do $verify$
declare
  r          record;
  v_missing  text[] := '{}';
  v_expected text[] := array['autovacuum_vacuum_scale_factor=0.02', 'autovacuum_vacuum_threshold=1000'];
begin
  -- P1: both tables carry BOTH options. Setting one without the other is the silent
  -- half-fix: a scale factor with no floor still waits ~19k rows on a small table, and a
  -- floor with no scale factor does nothing at all on a large one.
  for r in
    select c.relname, c.reloptions
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public'
       and c.relname in ('entity_quality_findings', 'organizations')
  loop
    if r.reloptions is null or not (r.reloptions @> v_expected) then
      v_missing := v_missing || format('%s=%s', r.relname, coalesce(r.reloptions::text, 'NULL'));
    end if;
  end loop;
  if cardinality(v_missing) > 0 then
    raise exception 'P1 failed: expected % on both tables, got: %',
      v_expected, array_to_string(v_missing, '; ');
  end if;

  -- P2: both tables were actually FOUND. P1 iterates, so a renamed or dropped table makes
  -- the loop body never run and leaves v_missing empty -- P1 would pass over a table that
  -- does not exist. This is the positive control for that.
  if (select count(*) from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
       where ns.nspname = 'public'
         and c.relname in ('entity_quality_findings', 'organizations')) <> 2 then
    raise exception 'P2 failed: expected exactly 2 target tables in public, found %',
      (select count(*) from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
        where ns.nspname = 'public'
          and c.relname in ('entity_quality_findings', 'organizations'));
  end if;

  -- P3: the new threshold is genuinely below the default for both, or the change buys
  -- nothing. Asserted as a RELATION rather than a pinned number, because reltuples moves
  -- with the corpus and a literal would fail on correct code the next time ingest runs.
  for r in
    select c.relname,
           1000 + 0.02 * c.reltuples as new_threshold,
           50   + 0.2  * c.reltuples as default_threshold
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public'
       and c.relname in ('entity_quality_findings', 'organizations')
  loop
    if not (r.new_threshold < r.default_threshold) then
      raise exception 'P3 failed: on % the new threshold (%) is not below the default (%) -- '
        'the table is too small for this setting to help and it should not carry it',
        r.relname, round(r.new_threshold), round(r.default_threshold);
    end if;
  end loop;

  -- P4: the cover index this exists to protect is still there and VALID. Without it the
  -- scan is not index-only, the visibility map is irrelevant, and this whole change is
  -- cargo cult.
  if not exists (
    select 1 from pg_index i
      join pg_class ic on ic.oid = i.indexrelid
      join pg_class tc on tc.oid = i.indrelid
      join pg_namespace ns on ns.oid = tc.relnamespace
     where ns.nspname = 'public'
       and tc.relname = 'entity_quality_findings'
       and ic.relname = 'entity_quality_findings_admin_review_cover_idx'
       and i.indisvalid
  ) then
    raise exception 'P4 failed: entity_quality_findings_admin_review_cover_idx is missing or '
      'INVALID -- the index-only scan this setting protects does not exist';
  end if;

  raise notice 'P1-P4 passed';
end $verify$;
