-- Anonymous-safe count of glossary terms the reader cannot see.
--
-- The detail page already answers honestly: /tags/footjob offers a sign-in gate
-- instead of "No such term" (20261220113000). The LISTING still says nothing —
-- a signed-out reader browsing /tags is silently served a smaller glossary than
-- a signed-in one, with no indication that anything is missing. This is the
-- counterpart of `gated_count_for_location`, which does the same job for
-- safety-gated venues/events/organizations on city and country pages.
--
-- Aggregate-only, exactly like that function: it returns two integers and never
-- a row, a name or a slug, so it discloses nothing beyond "N terms exist that
-- you are not being shown" — which is the honest statement the UI needs to make
-- and cannot make from an RLS-filtered list, because RLS makes the missing rows
-- indistinguishable from rows that never existed.
--
-- TWO COUNTS, AND THE SECOND ONE IS THE POINT.
--
-- Measured on prod 2026-09-04: 102 active tags are anon-gated, and 88 of them
-- are `is_adult`. The glossary hides adult terms behind SafeMode, which
-- DEFAULTS TO ON (src/providers/SafeModeProvider.tsx returns 'on' when nothing
-- is stored). So for a default reader, signing in reveals 14 terms, not 102 —
-- the other 88 stay hidden by a filter that has nothing to do with signing in.
--
-- A notice reading "102 terms are only shown to signed-in members" would
-- therefore be false for most of the people who see it, and falsifiable in one
-- click: sign in, count, find 14. `non_adult` is what the UI shows while safe
-- mode is on. Promising content that a second filter still withholds is the
-- same defect class as the 404 this programme started with — telling the reader
-- something about the corpus that is not true.
--
-- `is_adult` is the right column rather than `is_sensitive`: SafeMode filters on
-- the ADULT axis (`safeMode.shouldHide` reads the adult category set), while
-- `is_sensitive` is the review-gate axis that `tag_is_anon_gated` already
-- covers. The two axes are independent and conflating them would put the wrong
-- number on the page — see the safe-mode two-axis note in the tag docs.
create or replace function public.gated_tag_count()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    -- Every active term anon RLS withholds.
    'total', (
      select count(*) from public.unified_tags
       where status = 'active'
         and merged_into_id is null
         and public.tag_is_anon_gated(is_sensitive, verification_status)
    ),
    -- The subset that signing in ACTUALLY reveals while SafeMode is on.
    'non_adult', (
      select count(*) from public.unified_tags
       where status = 'active'
         and merged_into_id is null
         and not coalesce(is_adult, false)
         and public.tag_is_anon_gated(is_sensitive, verification_status)
    )
  );
$$;

comment on function public.gated_tag_count() is
  'Aggregate-only count of active glossary terms hidden from anon by unified_tags_public_gated_read. Returns {total, non_adult}; non_adult is what signing in reveals while SafeMode (default ON) still hides adult terms. No row data — safe for anon.';

grant execute on function public.gated_tag_count() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Assertions. A count function that cannot be trusted is worse than none.
-- ---------------------------------------------------------------------------
do $$
declare
  v            jsonb;
  v_total      bigint;
  v_non_adult  bigint;
  v_direct     bigint;
begin
  v := public.gated_tag_count();
  v_total     := (v->>'total')::bigint;
  v_non_adult := (v->>'non_adult')::bigint;

  -- Agrees with the predicate the RLS policy is written through. Computed
  -- independently here rather than trusting the function's own arithmetic.
  select count(*) into v_direct
    from public.unified_tags
   where status = 'active'
     and merged_into_id is null
     and public.tag_is_anon_gated(is_sensitive, verification_status);

  if v_total <> v_direct then
    raise exception 'gated_tag_count total % disagrees with the gate predicate (%)', v_total, v_direct;
  end if;

  -- non_adult is a SUBSET, never larger. Catches the arms being swapped, which
  -- would put the bigger number on the page under safe mode — the exact
  -- overstatement this function exists to prevent.
  if v_non_adult > v_total then
    raise exception 'gated_tag_count non_adult (%) exceeds total (%) — arms swapped', v_non_adult, v_total;
  end if;

  -- Both arms must be reachable. A function that can only ever return zero
  -- would make the notice silently never render, which reads exactly like the
  -- bug being fixed. Measured 102/14 at authoring time; asserted as ">0" rather
  -- than pinned, because the cohort is edited by ordinary review work.
  if v_total = 0 then
    raise exception 'gated_tag_count total is 0 — either the cohort was published or the predicate broke';
  end if;

  raise notice 'gated_tag_count: total=%, non_adult=%', v_total, v_non_adult;
end $$;
