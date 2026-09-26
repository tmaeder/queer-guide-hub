-- Two triage gaps, both latent-but-real, both one branch wide.
--
-- GAP 1 — ONLY `quality-city` FORWARDS THE OUTING-SAFETY CONFIRMATION.
-- `approve_entity_review` raises 42501 `high-risk destination: <field> approval
-- requires explicit confirmation` whenever `_review_risk_blocked` holds, and
-- `triage_action` has taken a `p_confirm` argument since it was written.
-- `TriageDetailPanel` renders the confirm checkbox for all five quality queues.
-- But measured on prod, of the five per-entity wrappers only
-- `approve_city_review` has a `p_confirm` parameter at all:
--     approve_city_review(p_id uuid, p_note text, p_confirm boolean)
--     approve_venue_review(p_id uuid, p_note text)          <- and three more
-- so on venue / village / personality / marketplace the flag is collected from
-- the reviewer, passed into `triage_action`, and then dropped on the floor. A
-- risk-gated row on those four types is un-approvable from the inbox no matter
-- what the reviewer ticks.
--
-- IT IS LATENT TODAY AND THAT IS NOT A REASON TO LEAVE IT. `risk_gate` is set
-- only on `city.safety_notes`, so no live row currently takes the blocked
-- path on the other four. The UI gate is wired for all five, which means the
-- day someone adds a `risk_gate` to a venue or personality field the reviewer
-- gets a checkbox that does nothing and a 42501 they cannot clear.
--
-- THE SIGNATURE IS REPLACED, NOT OVERLOADED. Adding a defaulted third argument
-- alongside the two-argument form would leave two candidates, and PostgREST
-- resolves BY ARGUMENT NAME — a named call then fails 42725 as ambiguous. That
-- is the trap `20350101100000` recorded when it dropped the 1-arg
-- `unmerge_venues`. Checked before dropping: the only callers of these four are
-- `triage_action` and `batch_approve_safe_venue_reviews`, both in-schema, and
-- nothing in src/ or e2e/ calls them (the only hits are generated types).
--
-- GAP 2 — `org-link-review` IS LISTED AND CANNOT BE ACTED ON.
-- It is a registered `triage_sources` row, it is unioned into
-- `get_unified_triage_queue`, its 62 rows render in the inbox — and
-- `triage_action` has no `WHEN` branch for it, so any action falls through to
-- `ELSE RAISE 'unknown queue_type: %'`. The only thing preventing a reviewer
-- from hitting that is a hardcoded map in `TriageDetailPanel.tsx`, which
-- duplicates `triage_sources.capabilities.external_console` rather than reading
-- it. SQL and UI agree by convention, not by construction.
--
-- This does NOT invent an approve path. Adopting an organisation needs a target
-- org chosen from a picker, which the generic panel does not model — that is
-- why the queue is external-console in the first place. What it does is make
-- the refusal EXPLICIT and name where the decision lives, instead of reporting
-- the queue as unknown.

-- ---------------------------------------------------------------------------
-- 1. The four wrappers gain p_confirm, forwarded to approve_entity_review.
-- ---------------------------------------------------------------------------
drop function if exists public.approve_venue_review(uuid, text);
drop function if exists public.approve_village_review(uuid, text);
drop function if exists public.approve_personality_review(uuid, text);
drop function if exists public.approve_marketplace_review(uuid, text);

create or replace function public.approve_venue_review(
  p_id uuid, p_note text default null, p_confirm boolean default false)
returns jsonb language sql security definer set search_path to 'public', 'pg_temp'
as $$ select public.approve_entity_review(p_id, p_note, p_confirm); $$;

create or replace function public.approve_village_review(
  p_id uuid, p_note text default null, p_confirm boolean default false)
returns jsonb language sql security definer set search_path to 'public', 'pg_temp'
as $$ select public.approve_entity_review(p_id, p_note, p_confirm); $$;

create or replace function public.approve_personality_review(
  p_id uuid, p_note text default null, p_confirm boolean default false)
returns jsonb language sql security definer set search_path to 'public', 'pg_temp'
as $$ select public.approve_entity_review(p_id, p_note, p_confirm); $$;

create or replace function public.approve_marketplace_review(
  p_id uuid, p_note text default null, p_confirm boolean default false)
returns jsonb language sql security definer set search_path to 'public', 'pg_temp'
as $$ select public.approve_entity_review(p_id, p_note, p_confirm); $$;

revoke all on function public.approve_venue_review(uuid, text, boolean) from public, anon;
revoke all on function public.approve_village_review(uuid, text, boolean) from public, anon;
revoke all on function public.approve_personality_review(uuid, text, boolean) from public, anon;
revoke all on function public.approve_marketplace_review(uuid, text, boolean) from public, anon;
grant execute on function public.approve_venue_review(uuid, text, boolean) to authenticated, service_role;
grant execute on function public.approve_village_review(uuid, text, boolean) to authenticated, service_role;
grant execute on function public.approve_personality_review(uuid, text, boolean) to authenticated, service_role;
grant execute on function public.approve_marketplace_review(uuid, text, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. triage_action forwards p_confirm on all five, and states the org-link
--    contract instead of falling through to "unknown queue_type".
--
--    This is a token substitution on the deployed definition rather than a
--    restatement of a ~200-line CASE. `20260806140000` did the same thing and
--    left the repo copy wrong for three days, so every edit here asserts its
--    own before-state AND after-state, and the whole thing aborts rather than
--    guessing. The canonical readable body remains 20260801050000.
-- ---------------------------------------------------------------------------
do $patch$
declare
  v_def   text;
  v_new   text;
  v_calls text[] := array['approve_venue_review', 'approve_village_review',
                          'approve_personality_review', 'approve_marketplace_review'];
  v_fn    text;
  v_old   text;
  v_want  text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'triage_action';
  if v_def is null then raise exception 'triage_action not found'; end if;
  v_new := v_def;

  foreach v_fn in array v_calls loop
    v_old  := format('PERFORM %s(p_item_id, v_notes);', v_fn);
    v_want := format('PERFORM %s(p_item_id, v_notes, p_confirm);', v_fn);

    if position(v_want in v_new) > 0 then
      raise notice '% already forwards p_confirm', v_fn;
      continue;
    end if;
    -- Exactly one call site, or refuse. A second one would mean the CASE has
    -- grown a shape this substitution does not understand.
    if (length(v_new) - length(replace(v_new, v_old, ''))) / nullif(length(v_old), 0) <> 1 then
      raise exception 'expected exactly one "%" call site in triage_action, refusing to guess', v_fn;
    end if;
    v_new := replace(v_new, v_old, v_want);
  end loop;

  -- The org-link branch, inserted ahead of the editorial branch. Refuses if the
  -- anchor is not exactly where it is expected.
  if position(E'WHEN ''org-link-review'' THEN' in v_new) = 0 then
    if (length(v_new) - length(replace(v_new, E'WHEN ''editorial'' THEN', '')))
       / nullif(length(E'WHEN ''editorial'' THEN'), 0) <> 1 then
      raise exception 'could not find a unique editorial branch to anchor org-link-review against';
    end if;
    v_new := replace(
      v_new,
      E'WHEN ''editorial'' THEN',
      E'-- Listed in the inbox, decided on the business console: adopting an\n'
      || E'    -- organisation needs a target org picked from a search over other\n'
      || E'    -- orgs, which this generic action cannot model. Stated here so the\n'
      || E'    -- refusal is a contract rather than a fall-through to "unknown\n'
      || E'    -- queue_type", which is what it was until 99991790362096.\n'
      || E'    WHEN ''org-link-review'' THEN\n'
      || E'      RAISE EXCEPTION ''org-link-review is decided on the business console, not the inbox''\n'
      || E'        USING ERRCODE = ''22023'',\n'
      || E'              HINT = ''Open the queue''''s external console and choose the organisation to link.'';\n\n'
      || E'    WHEN ''editorial'' THEN');
  end if;

  if v_new <> v_def then execute v_new; end if;
end $patch$;

-- ---------------------------------------------------------------------------
-- Postconditions. Assert the REACHED STATE, not the number of edits — a
-- re-run legitimately changes nothing and must still pass.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_src  text;
  v_fn   text;
  v_miss text[] := '{}';
begin
  -- All five wrappers now take three arguments.
  foreach v_fn in array array['approve_city_review', 'approve_venue_review',
                              'approve_village_review', 'approve_personality_review',
                              'approve_marketplace_review'] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_fn
         and pg_get_function_identity_arguments(p.oid) = 'p_id uuid, p_note text, p_confirm boolean')
    then v_miss := v_miss || v_fn; end if;
  end loop;
  if cardinality(v_miss) > 0 then
    raise exception 'these approve wrappers do not take p_confirm: %', array_to_string(v_miss, ', ');
  end if;

  -- And no two-argument twin survives to make a named PostgREST call ambiguous.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('approve_venue_review','approve_village_review',
                         'approve_personality_review','approve_marketplace_review')
       and pg_get_function_identity_arguments(p.oid) = 'p_id uuid, p_note text')
  then
    raise exception 'a two-argument approve wrapper survived — a named call would be ambiguous (42725)';
  end if;

  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'triage_action';

  foreach v_fn in array array['approve_venue_review', 'approve_village_review',
                              'approve_personality_review', 'approve_marketplace_review'] loop
    if position(format('PERFORM %s(p_item_id, v_notes, p_confirm);', v_fn) in v_src) = 0 then
      raise exception 'triage_action still drops p_confirm for %', v_fn;
    end if;
  end loop;

  if position('org-link-review' in v_src) = 0 then
    raise exception 'triage_action has no org-link-review branch — an action on it still reports "unknown queue_type"';
  end if;

  raise notice 'triage: p_confirm forwarded on all five quality queues; org-link-review contract stated';
end $verify$;
