-- DRIFT RECOVERY. THIS MIGRATION RAN AS A NO-OP AND THE REPO FILE EXISTS SO THE
-- APPLIED VERSION IS NOT ORPHANED. It is not the repair its original header
-- claimed to be, and that header is deliberately not preserved: it asserted
-- these three events had "red-lit every PR in the repo", which is false.
--
-- WHAT HAPPENED. On 2026-09-30 three events were measured on same-name cities in
-- the wrong country and this file was written and applied direct to prod at
-- 17:21 to repair them. The premise was never checked against the artifact the
-- gate reads. `city_quality_scorecard` is `served_from_snapshot`, and the 04:20
-- snapshot ALREADY read 0 for both CITY_LINK_NAMESAKE and
-- CITY_LINK_COUNTRY_MISMATCH -- so those codes were never the gate failure, and
-- the rows were already repaired before this ran:
--
--   * run_event_city_link quarantined the three mislinked events on its own at
--     03:05 (recorded in 99991790714809's own baseline revision), and
--   * 99991790714809_city_link_namesake_country_repair and
--     99991790718808_hong_kong_event_country_hk had already landed the same two
--     corrections this file contains.
--
-- Both statements below are content-guarded (`and country = 'CN'`,
-- `and city_id is not null`), so on 2026-09-30 they matched ZERO rows, and the
-- postconditions passed because they assert END STATE rather than rows touched.
-- That combination is exactly why the apply looked successful and proved
-- nothing: a no-op and a repair are indistinguishable from a green apply.
--
-- THE STATEMENTS ARE KEPT RATHER THAN EMPTIED so a rebuild-from-zero reaches the
-- same end state regardless of which of the three files runs first -- this one
-- sorts BELOW both siblings, so on a rebuild it performs the repair and they
-- no-op, which is the mirror of what happened live. They are idempotent in both
-- directions.
--
-- THE TWO CORPUS-WIDE POSTCONDITIONS ARE REMOVED. The applied version asserted
-- CITY_LINK_NAMESAKE = 0 and CITY_LINK_COUNTRY_MISMATCH = 0 across the whole
-- corpus. That is wrong inside a migration: on a rebuild-from-zero the corpus at
-- this point in history is not the corpus those invariants were measured
-- against, and a RAISE here aborts `db push` for EVERY migration queued behind
-- it -- the repo-wide blast radius 20810101100100 already caused once. The
-- invariants belong to the gate, which measures them live; what a migration may
-- assert is what IT changed. The three row-scoped checks below are kept.
--
-- The version sorts below the 9999... block because MCP apply_migration stamps
-- its own call timestamp. That is correct for an MCP-applied file and must not
-- be "corrected": check-migration-versions.mjs:317 exempts an already-applied
-- version from the ordering rule precisely for this recovery.

-- 1. Hong Kong -- correct the country, keep the link. The city link is CORRECT
-- (c701d52b is the real Hong Kong). What was wrong is the COUNTRY stamp: the
-- upstream JSON-LD says "country": "CN" and the importer took it verbatim, so
-- the event was safety-gated on mainland China's jurisdiction rather than HK's.
update public.events
   set country = 'HK',
       country_id = (select id from public.countries where code = 'HK')
 where id = '8f5bca16-bd5b-4bef-9481-e9c53fa94537'
   and country = 'CN';

-- 2/3. Burgdorf + Cambridge -- detach and quarantine. "CSD Burgdorf" is
-- Burgdorf, Lower Saxony DE (CSD is the German pride name) and the only Burgdorf
-- row we hold is the Swiss one; "tri-Pride 2027" is Cambridge, Ontario and we
-- hold only GB and US. No city row is minted: a null city_id is recoverable, a
-- wrong one is not, and `cities` holds at most one row per (name, country).
update public.events e
   set city_id = null,
       needs_attention = true,
       enrichment_status = coalesce(e.enrichment_status, '{}'::jsonb)
         || jsonb_build_object('event_city_link', jsonb_build_object(
              'blocked', v.reason,
              'at', now(),
              'by', 'city_link_namesake_quarantine',
              'detached_city_id', e.city_id,
              'needs_city', v.needs_city))
  from (values
    ('ca2f0b94-8b00-4955-86a3-9b33142cc3c5'::uuid,
     'namesake_wrong_country: event country DE, linked city was Burgdorf CH',
     'Burgdorf, Lower Saxony, DE'),
    ('e2ca4bd7-6a04-41a1-a651-245eb04d466b'::uuid,
     'namesake_wrong_country: event country CA, linked city was Cambridge GB',
     'Cambridge, Ontario, CA')
  ) as v(id, reason, needs_city)
 where e.id = v.id
   and e.city_id is not null;

do $verify$
declare
  v_hk_city text;
  v_hk_country text;
  v_stamped int;
  v_still_linked int;
begin
  -- P1: Hong Kong reached the intended state AND KEPT ITS LINK. A "fix" that
  -- detached it would satisfy P2 below and be wrong, so both halves are asserted.
  select e.country, c.slug into v_hk_country, v_hk_city
    from public.events e left join public.cities c on c.id = e.city_id
   where e.id = '8f5bca16-bd5b-4bef-9481-e9c53fa94537';
  if v_hk_country is distinct from 'HK' then
    raise exception 'P1 hong kong country is %, expected HK', v_hk_country;
  end if;
  if v_hk_city is distinct from 'hong-kong-hk-2hvf2' then
    raise exception 'P1 hong kong city link is %, expected hong-kong-hk-2hvf2', v_hk_city;
  end if;

  -- P2: the other two are detached.
  select count(*) into v_still_linked from public.events
   where id in ('ca2f0b94-8b00-4955-86a3-9b33142cc3c5','e2ca4bd7-6a04-41a1-a651-245eb04d466b')
     and city_id is not null;
  if v_still_linked <> 0 then
    raise exception 'P2 % of 2 quarantined events still carry a city_id', v_still_linked;
  end if;

  -- P3: and they are QUARANTINED, not merely detached. Without a stamp under
  -- this key both linkers re-resolve them by name within the hour and the
  -- detach silently undoes itself. Either this file or 99991790714809 may have
  -- written the stamp -- the assertion is on the STATE, not on the writer.
  select count(*) into v_stamped from public.events
   where id in ('ca2f0b94-8b00-4955-86a3-9b33142cc3c5','e2ca4bd7-6a04-41a1-a651-245eb04d466b')
     and coalesce(enrichment_status,'{}'::jsonb) -> 'event_city_link' ? 'blocked';
  if v_stamped <> 2 then
    raise exception 'P3 % of 2 quarantined events carry a blocked stamp', v_stamped;
  end if;
end
$verify$;
