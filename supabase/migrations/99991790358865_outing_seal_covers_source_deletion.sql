-- The outing seal watched one of the two doors. Deleting the last source is the other.
--
-- `99991789842467` sealed `person_outing_guard` with a BEFORE trigger on `personalities`,
-- and its own entry named the residue: the gate accepts EITHER a well-formed
-- `wikidata_qid` OR a non-`SKIP_` `personality_sources` row, so removing the LAST source
-- row breaches it without touching `personalities` at all — and a trigger on
-- `personalities` cannot see that. It was recorded as accepted under-reach on the belief
-- that nothing deletes source rows.
--
-- THAT BELIEF WAS WRONG, AND THE DELETER PERFORMS THE BREACHING SEQUENCE EXACTLY.
-- `scripts/data-quality/verify-personality-wikidata.mjs` does this on a namesake conflict:
--
--     update public.personalities set wikidata_qid = 'SKIP_' || gen_random_uuid() ... ;
--     delete from public.personality_sources
--      where personality_id = ... and source_slug = 'wikidata';
--
-- The order is what defeats the existing seal. At UPDATE time the source row is still
-- there, so the BEFORE trigger sees provenance and correctly allows the write; the DELETE
-- then removes the last source and fires nothing. A `SKIP_` sentinel does not satisfy the
-- gate's `^Q[0-9]+$`, so the row is left published, living, asserting a positive identity
-- label, with nothing behind it. That is the same shape as the 2026-09-19 incident — a
-- correct repair removing an identifier — one table over.
--
-- MEASURED 2026-09-25: 16,253 source rows, 5,206 of them `wikidata`, and **2 live rows**
-- rest on the sources arm alone (`jay-johnson`, `little-demon`, both `wikidata_qid IS
-- NULL`). Deleting either one's last source publishes an unsourced identity claim today.
-- The script has NO cron — it is operator-run, which is precisely the situation that
-- produced the original incident, not a reason to discount it.
--
-- STATEMENT-LEVEL WITH A TRANSITION TABLE, not FOR EACH ROW. The deleter above is
-- per-person, but `erq_cascade_delete` and the merge cores remove sources in bulk, and a
-- row-level trigger would re-evaluate the same parent once per deleted row. `REFERENCING
-- OLD TABLE` gives the whole set in one pass and lets the UPDATE touch each affected
-- parent exactly once — which matters because `personalities` carries 19 triggers,
-- including the search-document sync.
--
-- IT DEMOTES, IT DOES NOT RAISE, mirroring `personalities_enforce_outing_guard`. A
-- correct repair that removes a wrong source must still be able to land; what it may not
-- do is leave the page published. Raising here would also make the merge cores and the
-- review-queue cascade fail on rows they are entitled to clean up.
--
-- THE UPDATE RE-ENTERS THE EXISTING SEAL, WHICH IS WHY THE PREDICATE IS RESTATED RATHER
-- THAN TRUSTED. Writing `visibility := 'draft'` fires the BEFORE trigger on
-- `personalities`; that trigger's branch is not taken for a row it is already demoting, so
-- there is no recursion, and the demotion is idempotent. The `where` clause below is the
-- gate's predicate verbatim so the two cannot drift apart silently — `pipeline_hygiene`
-- has no sentinel for "the seal and the gate disagree", and a restated predicate that
-- drifts is worse than none.

create or replace function public.personality_sources_enforce_outing_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- Only the parents whose sources actually changed, evaluated against the state the
  -- statement left behind. A person who still has provenance is not touched.
  update public.personalities p
     set visibility      = 'draft',
         seo_indexable   = false,
         needs_attention = true,
         updated_at      = now()
   where p.id in (select distinct o.personality_id from old_sources o)
     and p.duplicate_of_id is null
     and p.is_living
     and (p.visibility = 'public' or p.seo_indexable)
     and p.lgbti_connection in ('community_member', 'ally', 'activist', 'representation')
     and not (coalesce(p.wikidata_qid, '') ~ '^Q[0-9]+$')
     and not exists (
       select 1 from public.personality_sources s
       where s.personality_id = p.id
         and coalesce(s.source_entity_id, '') !~ '^SKIP_'
     );
  return null;
end;
$function$;

comment on function public.personality_sources_enforce_outing_guard() is
  'Closes the second door on person_outing_guard: deleting the last non-SKIP_ source row leaves a published living person asserting a positive LGBTI identity with no provenance, and a trigger on personalities cannot see it. Demotes to draft rather than raising, so a correct repair can still land.';

drop trigger if exists trg_personality_sources_outing_guard on public.personality_sources;
create trigger trg_personality_sources_outing_guard
after delete on public.personality_sources
referencing old table as old_sources
for each statement
execute function public.personality_sources_enforce_outing_guard();

do $verify$
declare
  v_fn       int;
  v_trg      int;
  v_gate     int;
  v_victim   uuid;
  v_vis      text;
  v_indexed  boolean;
  v_attn     boolean;
  v_control  text;
  v_before   text;
begin
  select count(*) into v_fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'personality_sources_enforce_outing_guard';
  if v_fn <> 1 then raise exception 'postcondition failed: function not installed (%)', v_fn; end if;

  select count(*) into v_trg from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'personality_sources'
     and t.tgname = 'trg_personality_sources_outing_guard' and not t.tgisinternal;
  if v_trg <> 1 then raise exception 'postcondition failed: trigger not attached (%)', v_trg; end if;

  -- The gate must still read 0 after installing this. An installed seal that arrives to a
  -- breached corpus is not a seal, it is a silent baseline.
  select failing into v_gate from public.trust_safety_gate_status() where gate = 'person_outing_guard';
  if v_gate is null then raise exception 'postcondition failed: no person_outing_guard row'; end if;
  if v_gate <> 0 then raise exception 'postcondition failed: person_outing_guard reads %', v_gate; end if;

  -- BEHAVIOURAL PROOF, not a structural one. Asserting the trigger exists passes against a
  -- body that does nothing. This deletes a real row's last source inside this transaction,
  -- reads the parent back, and undoes it. Without the trigger the parent stays published,
  -- which is the exact exposure being closed.
  select p.id into v_victim
    from public.personalities p
   where p.duplicate_of_id is null and p.is_living
     and (p.visibility = 'public' or p.seo_indexable)
     and p.lgbti_connection in ('community_member', 'ally', 'activist', 'representation')
     and not (coalesce(p.wikidata_qid, '') ~ '^Q[0-9]+$')
     and exists (select 1 from public.personality_sources s
                 where s.personality_id = p.id and coalesce(s.source_entity_id, '') !~ '^SKIP_')
   limit 1;

  if v_victim is null then
    -- Nothing rests on the sources arm today, so the seal cannot be exercised here. Say so
    -- rather than passing silently: a green postcondition that tested nothing is how a
    -- guard reaches production unproven.
    raise notice 'no row rests on the sources arm; behavioural proof SKIPPED (structural checks passed)';
  else
    -- THE PROBE RUNS INSIDE A SUBTRANSACTION THAT ALWAYS ROLLS BACK, and that is not
    -- fastidiousness — a hand-written restore CANNOT put this row back. Measured on prod
    -- against `jay-johnson`: re-inserting the sources and writing `visibility='public'`
    -- re-enters `enforce_personality_public_gate()`, which fires on any
    -- draft -> public transition and applies eleven publication criteria (image, bio
    -- length, a `personality_claim_sources` row backing the LGBTI claim, …). It refused,
    -- correctly, and the row came back `draft/false`. A restore that quietly leaves a
    -- published person unpublished is a worse outcome than not probing at all.
    --
    -- A plpgsql BEGIN/EXCEPTION block is a subtransaction, so the RAISE below discards the
    -- DELETE and the trigger's UPDATE together. Variables are not transactional, so the
    -- values read inside survive for the assertion outside.
    select p.visibility || '/' || p.seo_indexable || '/' || p.needs_attention || '/' || count(s.*)::text
      into v_before
      from public.personalities p
      left join public.personality_sources s on s.personality_id = p.id
     where p.id = v_victim
     group by p.visibility, p.seo_indexable, p.needs_attention;

    begin
      delete from public.personality_sources where personality_id = v_victim;
      select visibility, seo_indexable, needs_attention
        into v_vis, v_indexed, v_attn
        from public.personalities where id = v_victim;
      raise exception using errcode = 'RB001', message = 'seal_probe_rollback';
    exception when sqlstate 'RB001' then
      null;  -- everything the probe wrote is now undone
    end;

    if v_vis <> 'draft' or v_indexed or not v_attn then
      raise exception 'behavioural proof FAILED: after deleting the last source the parent reads %/%/attn:% (expected draft/false/true)',
        v_vis, v_indexed, v_attn;
    end if;

    -- The rollback is asserted against the SNAPSHOT taken before the probe, never against
    -- an assumed "public/true". The gate's reach is `visibility='public' OR seo_indexable`,
    -- and both rows resting on the sources arm today are `draft` with `seo_indexable=true`
    -- — draft but still served to crawlers, which is exactly why the predicate carries that
    -- OR. An assertion that hardcoded `public` would fail on a correct rollback, and did.
    select p.visibility || '/' || p.seo_indexable || '/' || p.needs_attention || '/' || count(s.*)::text
      into v_control
      from public.personalities p
      left join public.personality_sources s on s.personality_id = p.id
     where p.id = v_victim
     group by p.visibility, p.seo_indexable, p.needs_attention;
    if v_control is distinct from v_before then
      raise exception 'probe rollback FAILED: row left at %, was % before the probe', v_control, v_before;
    end if;

    raise notice 'behavioural proof PASSED, probe rolled back cleanly (% -> %)', v_victim, v_control;
  end if;

  select failing into v_gate from public.trust_safety_gate_status() where gate = 'person_outing_guard';
  if v_gate <> 0 then raise exception 'postcondition failed: gate reads % after the probe', v_gate; end if;
end
$verify$;
