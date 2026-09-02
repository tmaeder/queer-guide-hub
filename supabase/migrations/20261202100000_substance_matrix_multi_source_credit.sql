-- `substance_interaction_matrix()` credited every cell to TripSit.
--
-- WHAT WAS WRONG
--
-- The RPC built its envelope with two literals — `'source', 'tripsit'` and
-- `'source_url', 'https://combo.tripsit.me/'` — and `/tags/interactions`
-- renders them as "Interaction data researched and published by TripSit" under
-- the whole grid. But the table is multi-source, and the RPC returns every
-- cell: measured on prod 2026-08-30 and re-measured 2026-09-02, 421 rows are
-- `tripsit`, 48 are `eve&rave Substanzhandbuch` and 7 are `FDA label`, and all
-- 476 come back. So the page denied two sources their credit and attributed 55
-- safety claims to an organisation that never published them.
--
-- `20260909172000`, which created this table, states the rule this violated:
-- "ATTRIBUTION IS A COLUMN, NOT A FOOTNOTE ... keeping provenance on the row
-- means a future second source can be added without guessing where each claim
-- came from". The row-level path already honours it — `get_substance_interactions`
-- returns `source`/`source_url` per row and the per-tag band builds its credit
-- from them, which is why `/tags/methamphetamine` correctly reads "eve&rave
-- Substanzhandbuch". Only the whole-grid envelope was still guessing.
--
-- WHAT REPLACES THEM
--
-- A `sources` array of the distinct `(source, source_url)` pairs actually
-- present among the cells being returned. Two things about it are deliberate:
--
--  * IT IS COMPUTED OVER THE CELLS, NOT OVER THE TABLE. The cell list is
--    already filtered to pairs whose BOTH endpoints are active tags, so a
--    source whose only rows sit behind a deprecated tag must not be credited
--    for a grid that does not show them. Sharing one CTE is what keeps the
--    credit and the grid from being able to disagree.
--
--  * IT IS DEDUPED BY SOURCE NAME, NOT BY URL. The seven FDA rows cite four
--    different DailyMed documents (sildenafil/Viagra, tadalafil/Cialis and
--    vardenafil/Levitra each share a label; avanafil has its own), so a
--    URL-keyed dedup emits "FDA label, FDA label, FDA label, FDA label" — the
--    exact defect `SubstanceInteractions.tsx` already shipped and fixed once.
--    A credit line names WHO produced the data, so one entry per name is the
--    whole point. The representative URL is the one covering the most cells,
--    ties broken by the url text so the output is deterministic rather than
--    dependent on scan order.
--
-- The scalar `source` / `source_url` keys are KEPT for one release. Nothing in
-- the repo reads them any more after this change, but the RPC is anon-callable
-- and a cached SPA bundle deployed before this migration lands still renders
-- the old footer from them; removing them in the same change would make that
-- window render a credit with no link at all.

create or replace function public.substance_interaction_matrix()
returns jsonb language sql stable security definer set search_path = public as $$
  with involved as (
    select distinct t.id, t.slug, t.name
      from public.unified_tags t
      join public.substance_interactions i on i.tag_a_id = t.id or i.tag_b_id = t.id
     where t.status = 'active'
  ),
  cells as (
    select i.*
      from public.substance_interactions i
      join involved ia on ia.id = i.tag_a_id
      join involved ib on ib.id = i.tag_b_id
  ),
  -- One row per (name, url) so the representative url can be chosen by weight.
  src_urls as (
    select c.source, c.source_url, count(*) as n
      from cells c
     where nullif(btrim(c.source), '') is not null
       and nullif(btrim(c.source_url), '') is not null
     group by 1, 2
  ),
  src as (
    select u.source,
           (array_agg(u.source_url order by u.n desc, u.source_url))[1] as source_url,
           sum(u.n) as n
      from src_urls u
     group by u.source
  )
  select jsonb_build_object(
    'axis', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'slug', slug, 'name', name)
                                       order by name) from involved), '[]'::jsonb),
    'cells', coalesce((select jsonb_agg(jsonb_build_object(
                'a', c.tag_a_id, 'b', c.tag_b_id, 'status', c.status,
                'severity', public.substance_interaction_rank(c.status),
                'note', c.note))
              from cells c), '[]'::jsonb),
    -- Most-cited source first, so the grid's dominant contributor leads the line.
    'sources', coalesce((select jsonb_agg(jsonb_build_object(
                'source', s.source, 'source_url', s.source_url)
                order by s.n desc, s.source)
              from src s), '[]'::jsonb),
    -- Deprecated, kept for one release: see the header.
    'source', 'tripsit',
    'source_url', 'https://combo.tripsit.me/'
  );
$$;

revoke all on function public.substance_interaction_matrix() from public;
grant execute on function public.substance_interaction_matrix() to anon, authenticated, service_role;

comment on function public.substance_interaction_matrix() is
  'Whole interaction grid in one round trip. `sources` lists the distinct (source, source_url) pairs present among the returned cells, deduped by source NAME; the scalar source/source_url keys are deprecated.';

do $verify$
declare
  v jsonb;
  v_names text[];
  v_expected text[];
begin
  v := public.substance_interaction_matrix();

  -- The grid must not have changed shape. The refactor moved the cell list into
  -- a CTE, so this is what proves the join was preserved rather than rewritten.
  if jsonb_array_length(v->'cells') <> (
       select count(*) from public.substance_interactions i
        join public.unified_tags a on a.id = i.tag_a_id and a.status = 'active'
        join public.unified_tags b on b.id = i.tag_b_id and b.status = 'active')
  then
    raise exception 'substance_interaction_matrix: cell count changed';
  end if;

  -- Every source among those cells is named exactly once.
  select array_agg(x->>'source' order by x->>'source')
    into v_names
    from jsonb_array_elements(v->'sources') x;

  select array_agg(distinct i.source order by i.source)
    into v_expected
    from public.substance_interactions i
    join public.unified_tags a on a.id = i.tag_a_id and a.status = 'active'
    join public.unified_tags b on b.id = i.tag_b_id and b.status = 'active';

  if v_names is distinct from v_expected then
    raise exception 'substance_interaction_matrix: sources % do not match the cells %',
      v_names, v_expected;
  end if;

  -- And each carries a usable link. A credit with no destination is not a credit.
  if exists (select 1 from jsonb_array_elements(v->'sources') x
              where nullif(btrim(x->>'source_url'), '') is null) then
    raise exception 'substance_interaction_matrix: a source came back with no url';
  end if;
end
$verify$;
