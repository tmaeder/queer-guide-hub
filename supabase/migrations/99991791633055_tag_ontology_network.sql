-- get_tag_ontology_network — the curated ontology as a NETWORK, not a line.
--
-- WHY THIS EXISTS AND WHY ONE HOP WAS NOT ENOUGH, measured on prod 2026-10-09:
--   1,314 active tags carry any curated relation, and 804 of them (61%) carry
--   EXACTLY ONE 1-hop neighbour. Drawn as a network, those are two dots and a
--   stick. Widen to two hops — siblings (other children of a shared parent)
--   and grandparents — and the same neighbourhoods go avg 2.13 -> 8.77,
--   median 5, p95 28, max 56. The second hop is what makes a network view
--   worth drawing at all; it is not a garnish on the first.
--
-- THE SHAPE IS "ONE LINE PER PARENT", and that is a correctness fix as well as
-- a design one. `get_tag_ontology` returns `broader` as a flat list, and
-- TagInterchange drew it as consecutive stops on one line — so `cis-man`
-- published "Cisgender -> Male -> Cis Man", asserting Male is narrower than
-- Cisgender. It is not; both are parents. Measured, 184 of the 1,000 tags
-- with a parent have two or more and were publishing that false chain.
-- Here each parent is its own LINE, so parallel parents cannot read as a
-- sequence, and the tag is the interchange where those lines meet.
--
-- `is_adult` IS RETURNED AND THE OLD RPC NEVER RETURNED IT. `useTagOntology`
-- normalises a missing key to false and its comment calls that a legacy
-- response shape — but the live `get_tag_ontology` has no `is_adult` arm at
-- all, so Safe mode has only ever filtered this surface by ADULT_CATEGORY_NAMES
-- and an adult tag in a non-adult category was never hidden. Shipping the flag
-- hides MORE in Safe mode, which is the documented intent of that filter.
--
-- REVIEW STATUS SEMANTICS ARE COPIED EXACTLY, NOT SIMPLIFIED: `broader` edges
-- (and therefore sibling and grandparent edges, which are broader edges one
-- hop out) display at ('auto','approved'); `related` displays at 'approved'
-- ONLY. 20261012090300 narrowed related deliberately after the relation
-- verifier measured ~29% precision at confidence 1.000, and widening it here
-- would quietly republish 120 unreviewed co-occurrence rows.
--
-- Siblings are CAPPED at 8 per line with the pre-cap total returned beside
-- them, so the UI can link the overflow to the parent instead of printing a
-- 31-stop line. p95 line length is 10 and only 15 lines exceed 12, so the cap
-- truncates the tail and nothing else. They are ordered by usage DESC so a
-- truncated line keeps the stops a reader is most likely to want.

create or replace function public.get_tag_ontology_network(p_tag_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
with rel as (
  select r.source_tag_id, r.target_tag_id, r.confidence
  from public.tag_relations r
  where r.relation_type = 'broader'
    and r.review_status in ('auto', 'approved')
),
parents as (
  select t.id, t.slug, t.name, t.category, t.is_adult, r.confidence
  from rel r
  join public.unified_tags t on t.id = r.target_tag_id
  where r.source_tag_id = p_tag_id and t.status = 'active'
),
lines as (
  select
    p.id, p.slug, p.name, p.category, p.is_adult, p.confidence,
    -- grandparents: the line's upstream terminus
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'slug', g.slug, 'name', g.name,
               'category', g.category, 'is_adult', g.is_adult) order by g.name)
      from rel r2
      join public.unified_tags g on g.id = r2.target_tag_id
      where r2.source_tag_id = p.id and g.status = 'active'
    ), '[]'::jsonb) as upstream,
    -- siblings: the other stops on this line, most-used first, capped
    coalesce((
      select jsonb_agg(s.obj order by s.usage_count desc, s.name)
      from (
        select jsonb_build_object(
                 'id', c.id, 'slug', c.slug, 'name', c.name,
                 'category', c.category, 'is_adult', c.is_adult) as obj,
               c.usage_count, c.name
        from rel r3
        join public.unified_tags c on c.id = r3.source_tag_id
        where r3.target_tag_id = p.id and c.status = 'active' and c.id <> p_tag_id
        order by c.usage_count desc, c.name
        limit 8
      ) s
    ), '[]'::jsonb) as stops,
    (
      select count(*)
      from rel r4
      join public.unified_tags c on c.id = r4.source_tag_id
      where r4.target_tag_id = p.id and c.status = 'active' and c.id <> p_tag_id
    ) as stop_total
  from parents p
)
select jsonb_build_object(
  'lines', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', l.id, 'slug', l.slug, 'name', l.name,
             'category', l.category, 'is_adult', l.is_adult,
             'upstream', l.upstream, 'stops', l.stops, 'stop_total', l.stop_total)
           order by l.stop_total desc, l.name)
    from lines l
  ), '[]'::jsonb),
  -- this tag's own children: the line continuing past the interchange
  'narrower', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', t.id, 'slug', t.slug, 'name', t.name,
             'category', t.category, 'is_adult', t.is_adult) order by t.name)
    from rel r
    join public.unified_tags t on t.id = r.source_tag_id
    where r.target_tag_id = p_tag_id and t.status = 'active'
  ), '[]'::jsonb),
  -- interchange chips. 'approved' ONLY — see the header.
  'related', coalesce((
    select jsonb_agg(x.obj order by (x.obj->>'confidence')::numeric desc)
    from (
      select distinct on (other) jsonb_build_object(
               'id', t.id, 'slug', t.slug, 'name', t.name,
               'category', t.category, 'is_adult', t.is_adult,
               'confidence', r.confidence) as obj,
             t.id as other
      from public.tag_relations r
      join public.unified_tags t
        on t.id = case when r.source_tag_id = p_tag_id then r.target_tag_id else r.source_tag_id end
      where r.relation_type = 'related'
        and (r.source_tag_id = p_tag_id or r.target_tag_id = p_tag_id)
        and t.status = 'active'
        and r.review_status = 'approved'
      order by other, r.confidence desc
    ) x
  ), '[]'::jsonb)
);
$function$;

comment on function public.get_tag_ontology_network(uuid) is
  'Two-hop curated tag ontology shaped as transit lines (one line per parent, '
  'siblings as its other stops, grandparents as its upstream terminus). '
  'Reads tag_relations only - never the get_similar_tags embedding pool, which '
  'was measured display-unclean and is a candidate signal, not a display source.';

revoke all on function public.get_tag_ontology_network(uuid) from public;
grant execute on function public.get_tag_ontology_network(uuid) to anon, authenticated, service_role;

do $verify$
declare
  v_cis uuid;
  v_out jsonb;
  v_lines jsonb;
  v_bad int;
begin
  -- P1: anon must reach it, and PUBLIC must not hold a leftover grant.
  if not has_function_privilege('anon', 'public.get_tag_ontology_network(uuid)', 'EXECUTE') then
    raise exception 'P1 failed: anon cannot execute get_tag_ontology_network';
  end if;
  if has_function_privilege('public', 'public.get_tag_ontology_network(uuid)', 'EXECUTE') then
    raise exception 'P1 failed: PUBLIC still holds EXECUTE on get_tag_ontology_network';
  end if;

  select id into v_cis from public.unified_tags where slug = 'cis-man' and status = 'active';
  if v_cis is null then
    -- The corpus moved; the shape checks below need a live multi-parent row and
    -- aborting db push for the whole repo over a renamed tag is not worth it.
    raise notice 'P2 skipped: cis-man not present';
    return;
  end if;

  v_out := public.get_tag_ontology_network(v_cis);
  v_lines := v_out -> 'lines';

  -- P2: the defect this migration exists to fix. cis-man has TWO parents and
  -- they must arrive as two separate lines, never as one list a caller can
  -- render as a chain.
  if jsonb_array_length(v_lines) < 2 then
    raise exception 'P2 failed: cis-man returned % line(s), expected its parents as separate lines',
      jsonb_array_length(v_lines);
  end if;

  -- P3: the second hop is the whole point. At least one line must carry a
  -- sibling or an upstream terminus, or this returns what the 1-hop RPC did.
  select count(*) into v_bad
  from jsonb_array_elements(v_lines) l
  where jsonb_array_length(l -> 'stops') > 0 or jsonb_array_length(l -> 'upstream') > 0;
  if v_bad = 0 then
    raise exception 'P3 failed: no line carries a sibling or a grandparent - second hop is empty';
  end if;

  -- P4: every node carries is_adult, which the 1-hop RPC never returned and
  -- Safe mode reads. A missing key normalises to false, i.e. silently unsafe.
  select count(*) into v_bad
  from jsonb_array_elements(v_lines) l
  where not (l ? 'is_adult')
     or exists (select 1 from jsonb_array_elements(l -> 'stops') s where not (s ? 'is_adult'))
     or exists (select 1 from jsonb_array_elements(l -> 'upstream') u where not (u ? 'is_adult'));
  if v_bad > 0 then
    raise exception 'P4 failed: % line(s) carry a node with no is_adult key', v_bad;
  end if;

  -- P5: the cap is real and its pre-cap total is reported, or the UI cannot
  -- tell a short line from a truncated one.
  select count(*) into v_bad
  from jsonb_array_elements(v_lines) l
  where jsonb_array_length(l -> 'stops') > 8 or not (l ? 'stop_total');
  if v_bad > 0 then
    raise exception 'P5 failed: % line(s) exceed the 8-stop cap or omit stop_total', v_bad;
  end if;
end
$verify$;
