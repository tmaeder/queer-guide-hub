-- A gated glossary term must answer "sign in", not "no such thing".
--
-- `unified_tags_public_gated_read` admits anon only when the row is
-- non-sensitive OR its `verification_status` is 'reviewed'/'locked'. Measured
-- on prod 2026-09-03: 101 active tags are sensitive AND unverified — the whole
-- glossary cohort created by 20261211100000 / 20261211100100 / 20261217100000 —
-- and every one of them HARD 404s for a signed-out visitor while rendering
-- normally for a signed-in one. Verified over HTTP: /tags/footjob,
-- /tags/anal-whore, /tags/gag-slut and /tags/spit-slut all return status 404
-- with `<title>Page not found</title>`, against /tags/kink and /tags/fetish
-- (sensitive but reviewed) and /tags/fluffer (not sensitive) at 200.
--
-- The gating DECISION is right: unreviewed machine-written prose about an
-- explicit term should not be public. The RESPONSE SHAPE is the defect — a real
-- term is indistinguishable from a typo, which is the exact confusion the
-- safety layer already solved for venues/events/organizations in criminalising
-- countries (`gated_entity_exists` + GatedDetailFallback, 20260623160002).
-- Tags used none of it. This gives them the same treatment.
--
-- Not urgent today: the anon search-proxy returns 0 hits for these terms and
-- sitemap-tags.xml excludes them, so nothing links a logged-out visitor to the
-- 404. It becomes urgent the moment auto-tagging assigns one of these to a
-- public entity, because the tag chip would then link straight at it.
--
-- ---------------------------------------------------------------------------
-- 1. ONE predicate for "anon cannot read this tag row".
-- ---------------------------------------------------------------------------
-- Until now that rule existed only inside the RLS policy's USING clause. This
-- migration adds a SECOND reader (`gated_entity_exists`) and a THIRD in
-- TypeScript (`tagIsAnonGated` in functions/_lib/detail.ts, which the edge needs
-- because a service-role read bypasses RLS and would otherwise hand a gated
-- term's prose to a crawler). Three copies of one boolean is the drift class
-- this repo keeps paying for, so the policy is restated THROUGH the function
-- rather than beside it. It is `immutable`/`parallel safe` plain SQL so the
-- planner inlines it and the policy's plan is unchanged.
--
-- NULL handling is load-bearing and is why this is not the naive negation of
-- the policy text: `verification_status = any(array['reviewed','locked'])` is
-- NULL, not false, when the column is NULL, so the policy's OR evaluates to
-- NULL and the row is HIDDEN. `coalesce(...,'')` reproduces that; `not in`
-- against a NULL would not.
create or replace function public.tag_is_anon_gated(
  p_is_sensitive boolean,
  p_verification_status text
)
returns boolean
language sql
immutable
parallel safe
as $$
  select coalesce(p_is_sensitive, false)
     and coalesce(p_verification_status, '') not in ('reviewed', 'locked');
$$;

comment on function public.tag_is_anon_gated(boolean, text) is
  'True when a unified_tags row is hidden from anon by unified_tags_public_gated_read (sensitive and not reviewed/locked). Single source of truth for that policy, gated_entity_exists, and the edge renderer.';

grant execute on function public.tag_is_anon_gated(boolean, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Prove the predicate reproduces the LIVE policy before swapping it in.
-- ---------------------------------------------------------------------------
-- Both expressions are evaluated over every row of the real table, so this is
-- an exhaustive equality check, not a sample. `coalesce(<old>, false)` because
-- the old expression is three-valued and a NULL there denies exactly as false
-- does — the comparison must be about the DECISION, not the SQL value.
do $$
declare
  v_disagreements bigint;
begin
  select count(*)
    into v_disagreements
    from public.unified_tags t
   where coalesce(
           (coalesce(t.is_sensitive, false) = false
            or t.verification_status = any (array['reviewed', 'locked'])),
           false
         )
         is distinct from
         (not public.tag_is_anon_gated(t.is_sensitive, t.verification_status));

  if v_disagreements > 0 then
    raise exception
      'tag_is_anon_gated disagrees with unified_tags_public_gated_read on % row(s); refusing to swap the policy',
      v_disagreements;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Restate the policy through the shared predicate. Same rule, one writer.
-- ---------------------------------------------------------------------------
-- The `(select auth.role())` sub-select form is kept verbatim: it is what makes
-- the role lookup an InitPlan evaluated once per query instead of once per row.
drop policy if exists "unified_tags_public_gated_read" on public.unified_tags;

create policy "unified_tags_public_gated_read" on public.unified_tags
  for select
  using (
    (select auth.role()) = 'authenticated'
    or (select auth.role()) = 'service_role'
    or (
      (select auth.role()) = 'anon'
      and not public.tag_is_anon_gated(is_sensitive, verification_status)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. gated_entity_exists: the `tag` branch.
-- ---------------------------------------------------------------------------
-- Restated in full from 20260913141723 (itself the last of five replacements)
-- because CREATE OR REPLACE has no partial form. Only the `tag` branch is new.
--
-- The function's original job was the SAFETY gate (high-risk country); a tag is
-- withheld for a different reason (unreviewed explicit prose). What the two
-- share, and all any caller needs, is "this row exists and anon RLS hides it" —
-- so the branch belongs here rather than in a parallel RPC that detail pages
-- would have to choose between.
--
-- `status = 'active'` is not optional. A merged or deprecated tag keeps its row
-- at its old slug; if this returned true for one, the edge would answer a
-- sign-in gate for a concept that has a live canonical one hop away, and
-- resolveSlugRedirect's 301 would never run. Same filter as tagDetail and
-- fetchTagWithCategories, for the same reason.
create or replace function public.gated_entity_exists(p_entity_type text, p_slug text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case p_entity_type
    when 'venue' then exists (
      select 1 from public.venues
      where slug = p_slug and safety_gated and duplicate_of_id is null and closed_at is null)
    when 'event' then exists (
      select 1 from public.events where slug = p_slug and safety_gated)
    when 'organization' then exists (
      select 1 from public.organizations where slug = p_slug and safety_gated and status = 'active')
    when 'milestone' then exists (
      select 1 from public.milestones
      where slug = p_slug and safety_gated and status = 'published' and duplicate_of_id is null)
    when 'guide' then exists (
      select 1 from public.guides
      where slug = p_slug and safety_gated and status = 'published')
    when 'queer_village' then exists (
      select 1 from public.queer_villages
      where slug = p_slug and safety_gated and duplicate_of_id is null)
    when 'tag' then exists (
      select 1 from public.unified_tags
      where slug = p_slug
        and status = 'active'
        and public.tag_is_anon_gated(is_sensitive, verification_status))
    else false
  end;
$$;

comment on function public.gated_entity_exists(text, text) is
  'Boolean-only: does a row exist at this slug that anon RLS hides — safety-gated (high-risk country) for places, or sensitive-and-unverified for tags? Lets detail pages show a sign-in gate instead of a 404. Returns no row data.';

-- ---------------------------------------------------------------------------
-- 5. Re-assert the thing this migration exists to fix.
-- ---------------------------------------------------------------------------
-- A data-repair migration that does not check its own postcondition is a green
-- deploy with no evidence behind it. The counts are not pinned (the cohort is
-- editable) — what is pinned is that the branch answers the two cases apart.
do $$
declare
  v_gated   bigint;
  v_leaked  bigint;
begin
  select count(*)
    into v_gated
    from public.unified_tags t
   where t.status = 'active'
     and public.tag_is_anon_gated(t.is_sensitive, t.verification_status)
     and public.gated_entity_exists('tag', t.slug);

  if v_gated = 0 then
    raise exception 'gated_entity_exists(''tag'', …) matched no anon-gated tag; the branch is not working';
  end if;

  -- The inverse control. A term anon CAN read must never be reported as gated,
  -- or every unknown slug in the glossary would offer a sign-in gate and the
  -- 404 would stop existing. "Zero gated rows" also passes an empty table,
  -- which is why both halves are asserted.
  select count(*)
    into v_leaked
    from public.unified_tags t
   where t.status = 'active'
     and not public.tag_is_anon_gated(t.is_sensitive, t.verification_status)
     and public.gated_entity_exists('tag', t.slug);

  if v_leaked > 0 then
    raise exception 'gated_entity_exists(''tag'', …) reported % anon-READABLE tag(s) as gated', v_leaked;
  end if;

  raise notice 'gated tags reachable through the sign-in gate: %', v_gated;
end $$;
