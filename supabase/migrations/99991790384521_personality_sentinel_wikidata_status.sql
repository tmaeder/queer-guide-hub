-- The wrong-entity sentinel outlived the convention it was guarding.
--
-- `99991789855974` added `personality_wikidata_signals()` with a zero-invariant
-- `sentinel_lost`: a row disposed wrong-entity whose `wikidata_qid` is no longer
-- a `SKIP_<uuid>` sentinel. That was right for the model at the time --
-- `personality-refresh` wrote `SKIP_` itself and re-resolved by name whenever the
-- column was NULL, so a null recorded no decision and put the row back into
-- resolution forever.
--
-- THAT MODEL HAS BEEN RETIRED, COMPLETELY AND CORRECTLY, and the sentinel is now
-- the stale artifact. `personality_editorial_backlog_complete` (99991790059731),
-- batch `personality-qid-sentinel-v1`, reason "workflow state or malformed value
-- is not a Wikidata identifier", cleared every `SKIP_` in the table. Verified
-- before writing this, rather than assumed from the migration name:
--
--   * `SKIP_` values remaining corpus-wide:                      0
--   * `personality-refresh/index.ts` still writing `SKIP_`:      no
--   * `_shared/personality-contract.ts` maps `/^SKIP_/i`
--     to `wikidata_status='not_found'`                           yes
--   * the 125 rows this sentinel watches, by status:             125 not_found
--   * prior values preserved in
--     `private.personality_remediation_audit`                    125 rows
--
-- So the decision the `SKIP_` prefix used to carry is still recorded -- it moved
-- to a typed column. `wikidata_qid` now holds a real Q-id or NULL and nothing
-- else, and `personality-refresh` reads `wikidata_status` before deciding whether
-- to resolve, so a `not_found` row is not re-probed. That is strictly better than
-- overloading the identifier column, which is what the original sentinel encoded.
--
-- The invariant therefore moves rather than relaxes. It still asserts that a
-- disposed row RECORDS ITS DECISION; it just reads the column that now holds it:
--
--   before  wikidata_qid IS NULL OR wikidata_qid !~ '^SKIP_'
--   after   wikidata_qid IS NOT NULL OR wikidata_status IS DISTINCT FROM 'not_found'
--
-- Both halves are load-bearing. A row that re-acquires a Q-id is caught by
-- `qid_regressed` already, but a row that ends up with a Q-id AND a stale
-- `not_found` is incoherent and is caught here; a row that loses `not_found`
-- without gaining an identifier has silently dropped the decision and re-enters
-- resolution, which is the original failure this guard exists for.
--
-- `qid_regressed` and `retracted_text_back` are unchanged and still read 0.
-- Nothing else about the function moves.
--
-- Left deliberately alone: the 125 rows are NOT converted back. Their decision is
-- intact under the new model and re-asserting the old one would be reverting a
-- sibling's complete, better-designed change on the strength of my own guard
-- having gone stale.

create or replace function public.personality_wikidata_signals()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_rows          int;
  v_disp          int;
  v_unverified    int;
  v_regressed     int;
  v_sentinel_lost int;
  v_text_back     int;
  v_examples      jsonb;
begin
  select count(*) into v_rows
    from public.personalities where wikidata_qid ~ '^Q[0-9]+$';

  select count(*) into v_disp
    from public.personalities where enrichment_status ? 'wrong_entity_candidate';

  select count(*) into v_unverified
    from public.personalities
   where wikidata_qid ~ '^Q[0-9]+$'
     and (visibility = 'public' or seo_indexable)
     and not (enrichment_status ? 'wrong_entity_candidate');

  -- The refuted identifier is back on the row it was cleared from.
  -- Scoped to `state='confirmed'`: `wrong_entity_candidate` is a shared key whose
  -- other producers legitimately keep a Q-id while flagging a CANDIDATE.
  select count(*) into v_regressed
    from public.personalities
   where enrichment_status -> 'wrong_entity_candidate' ->> 'state' = 'confirmed'
     and enrichment_status -> 'wrong_entity_candidate' ->> 'qid' is not null
     and wikidata_qid = enrichment_status -> 'wrong_entity_candidate' ->> 'qid';

  -- A disposed row stopped recording its decision. Reads `wikidata_status`, the
  -- column that now holds it; the `SKIP_` prefix this used to look for no longer
  -- exists anywhere in the table.
  select count(*) into v_sentinel_lost
    from public.personalities
   where enrichment_status -> 'wrong_entity_candidate' ->> 'state' = 'confirmed'
     and (wikidata_qid is not null
          or wikidata_status is distinct from 'not_found');

  -- The retracted biography returned verbatim.
  select count(*) into v_text_back
    from public.personalities
   where enrichment_status -> 'wrong_entity_description_retracted' ->> 'from' is not null
     and description is not null
     and description = enrichment_status -> 'wrong_entity_description_retracted' ->> 'from';

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_examples from (
    select jsonb_build_object('slug', slug, 'qid', wikidata_qid,
             'status', wikidata_status,
             'was', enrichment_status -> 'wrong_entity_candidate' ->> 'label') x
      from public.personalities
     where enrichment_status -> 'wrong_entity_candidate' ->> 'state' = 'confirmed'
       and (
            wikidata_qid = enrichment_status -> 'wrong_entity_candidate' ->> 'qid'
         or wikidata_qid is not null
         or wikidata_status is distinct from 'not_found'
       )
     limit 10
  ) s;

  return jsonb_build_object(
    'probe_ok',             true,
    'rows_with_qid',        v_rows,
    'dispositioned',        v_disp,
    'unverified_reachable', v_unverified,
    'qid_regressed',        v_regressed,
    'sentinel_lost',        v_sentinel_lost,
    'retracted_text_back',  v_text_back,
    'examples',             v_examples
  );
end $fn$;

revoke all on function public.personality_wikidata_signals() from public, anon, authenticated;
grant execute on function public.personality_wikidata_signals() to service_role;

comment on function public.personality_wikidata_signals() is
  'Watches the personality wrong-entity repairs (99970101100100, 99991789833562, 99991789840157) for regression. SQL cannot re-derive P31, so this checks a refuted identifier coming back, a disposed row losing its recorded decision (wikidata_status=not_found since 99991790059731 retired the SKIP_ overload), and a retracted biography returning -- all zero-invariants. unverified_reachable is a work-list size and is reported, never gated. service_role only.';

do $verify$
declare v jsonb;
begin
  v := public.personality_wikidata_signals();

  if (v ->> 'probe_ok') is distinct from 'true' then
    raise exception 'personality_wikidata_signals: probe did not report ok';
  end if;

  -- All three invariants must be clean, which is the point: the sentinel was red
  -- on correct data before this change and is being returned to zero, not muted.
  if (v ->> 'qid_regressed')::int <> 0 then
    raise exception 'personality_wikidata_signals: % row(s) carry a refuted qid: %',
      v ->> 'qid_regressed', v ->> 'examples';
  end if;
  if (v ->> 'sentinel_lost')::int <> 0 then
    raise exception 'personality_wikidata_signals: % disposed row(s) do not record a decision: %',
      v ->> 'sentinel_lost', v ->> 'examples';
  end if;
  if (v ->> 'retracted_text_back')::int <> 0 then
    raise exception 'personality_wikidata_signals: % retracted biograph(ies) returned',
      v ->> 'retracted_text_back';
  end if;

  -- POSITIVE CONTROLS. All three counts above are zero on an empty table, on a
  -- revoked grant, and on a function that returns a literal.
  if (v ->> 'rows_with_qid')::int < 1000 then
    raise exception 'personality_wikidata_signals: only % rows with a Q-id -- the probe is not reading the corpus',
      v ->> 'rows_with_qid';
  end if;
  if (v ->> 'dispositioned')::int < 100 then
    raise exception 'personality_wikidata_signals: only % dispositioned rows', v ->> 'dispositioned';
  end if;

  -- And the new convention is actually in force, so this file cannot go green by
  -- checking a column nothing populates.
  if (select count(*) from public.personalities where wikidata_status = 'not_found') < 100 then
    raise exception 'personality_wikidata_signals: wikidata_status is not populated -- check the predicate';
  end if;

  raise notice 'personality_wikidata_signals OK: % with qid, % dispositioned, % unverified reachable',
    v ->> 'rows_with_qid', v ->> 'dispositioned', v ->> 'unverified_reachable';
end $verify$;
