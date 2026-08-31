-- Tag taxonomy v3, PR E: retire the v2 tree.
--
-- Deletes the 10 v2 roots and the 5 stops v3 dissolved, and narrows the
-- is_adult recompute back to the v3 names alone (PR A widened it to the
-- union so a mid-swap re-file could not strip an age gate).
--
-- THE DELETION IS GUARDED, NOT CASCADED. Two FKs make an unguarded delete
-- silently destructive rather than loud:
--   * unified_tags.category_id -> tag_categories ON DELETE SET NULL — a tag
--     still pointing at a deleted category is silently UNCATEGORIZED.
--   * tag_categories.parent_id -> tag_categories ON DELETE CASCADE —
--     deleting a root takes its children with it, so children are deleted
--     explicitly first and each parent is checked for childlessness before
--     its own delete.
-- Hence: assert zero references (id AND text), delete residual junction
-- rows, then children, then parents. Every step raises rather than repairs;
-- a straggler means the re-filing is incomplete and this migration must not
-- paper over it.
--
-- Requires 20261006140100 (deterministic re-filing). It does NOT require the
-- LLM remainder pass: this migration re-files whatever is still on the
-- retired tree itself, using the same old→new map the URL redirects use.
-- The drain refines a line-level filing into a stop, which is an improvement
-- rather than a precondition, and the nightly sweep keeps doing it after the
-- cutover — against one tree instead of two.

set local statement_timeout = '600s';

do $$
declare
  v_retired text[] := array[
    -- v2 roots
    'identity-expression','sexuality-kink','relationships-connection','health-wellness',
    'safety-practices','community-culture','history-heritage','rights-activism',
    'places-travel','support-news',
    -- v2 stops dissolved by v3
    'sexual-roles','body-types-archetypes','care-access','current-affairs','professions-allies'
  ];
  v_ref_id int;
  v_ref_text int;
  v_ref_junction int;
  v_names text[];
  v_orphans int;
begin
  perform set_config('app.actor', 'migration:20261006150000_tag_taxonomy_v2_retire', true);

  select array_agg(name) into v_names from tag_categories where slug = any(v_retired);
  if v_names is null then
    raise notice 'taxonomy v2 retire: nothing to do (already retired)';
    return;
  end if;

  -- ── Re-file whatever still points at the retired tree ──────────────────
  -- Measured before writing this: 380 tags still hold a retired category_id,
  -- and 91% of them are filed on a v2 ROOT rather than a stop — a line-level
  -- filing the bulk LLM runs produced, which never said more than "this tag
  -- belongs to this line". Only 60 sit on the five stops v3 dissolved.
  --
  -- Both are decidable without judgement, so neither needs the LLM pass: the
  -- map below is the SAME 15-entry old→new map that public/_redirects and
  -- src/lib/tags/categorySlugRedirects.ts carry for the URLs. A root maps to
  -- its v3 line, which preserves exactly the information that exists and
  -- invents no stop; a dissolved stop maps to the stop that absorbed it.
  -- Deprecated tags are included deliberately — the FK is ON DELETE SET NULL,
  -- so a row left behind is silently uncategorized whether or not a reader
  -- can see it.
  --
  -- This is why the migration no longer requires the LLM remainder drain to
  -- have run: the drain refines a line-level filing into a stop, which is an
  -- improvement, not a precondition. The nightly sweep keeps doing it after
  -- the cutover, against one tree instead of two.
  create temporary table _v2_remap (tag_id uuid primary key, cat_id uuid, cat_name text) on commit drop;

  -- Source is `category_id` when it is set, and the `category` TEXT name when
  -- it is not. 45 rows carry only the text — all of them deprecated, 42 with
  -- a junction row that also points at a retired stop, i.e. rows whose
  -- denormalized id was already lost before this program. Keying on the id
  -- alone would leave their text naming a category that no longer exists,
  -- which is exactly the `legacy_category_values` state the cutover asserts
  -- against.
  -- `distinct on` because the name arm can match more than one row: v2 and v3
  -- share several stop NAMES, and a tag could otherwise produce two candidate
  -- targets and violate the temp table's primary key.
  insert into _v2_remap (tag_id, cat_id, cat_name)
  select distinct on (u.id) u.id, dst.id, dst.name
  from unified_tags u
  join tag_categories src
    on src.id = u.category_id
    or (u.category_id is null and src.name = u.category and src.level in (0, 1))
  join (values
    ('identity-expression','identity'),
    ('sexuality-kink','sex-kink'),
    ('relationships-connection','relationships-family'),
    ('health-wellness','health'),
    ('safety-practices','safety-consent'),
    ('community-culture','culture-community'),
    ('history-heritage','history-rights'),
    ('rights-activism','history-rights'),
    ('places-travel','places-scene'),
    ('support-news','places-scene'),
    ('sexual-roles','bdsm-power-exchange'),
    ('body-types-archetypes','kink-community'),
    ('care-access','physical-reproductive'),
    ('current-affairs','political-activism'),
    ('professions-allies','support-services')
  ) as m(from_slug, to_slug) on m.from_slug = src.slug
  join tag_categories dst on dst.slug = m.to_slug;

  -- Junction first and standalone, so the is_adult recompute on
  -- tag_category_assignments runs as its own command (27000-safe).
  update tag_category_assignments a
     set is_primary = false
    from _v2_remap r
   where a.tag_id = r.tag_id and a.is_primary;

  insert into tag_category_assignments (tag_id, category_id, is_primary)
  select r.tag_id, r.cat_id, true from _v2_remap r
  on conflict (tag_id, category_id) do update set is_primary = true;

  -- Both mirrors, `category` written explicitly so the column-scoped search
  -- trigger fires and the facet key follows the move.
  update unified_tags u
     set category_id = r.cat_id, category = r.cat_name
    from _v2_remap r
   where u.id = r.tag_id;

  raise notice 'taxonomy v2 retire: re-filed % tags off the retired tree',
    (select count(*) from _v2_remap);

  -- ── Assertions: nothing may still point at the retired tree ────────────
  select count(*) into v_ref_id
  from unified_tags u join tag_categories c on c.id = u.category_id
  where c.slug = any(v_retired);
  if v_ref_id > 0 then
    raise exception 'taxonomy v2 retire: % tags still hold a retired category_id after the remap — a retired slug is missing from the map above', v_ref_id;
  end if;

  -- The TEXT mirror matters as much as the FK: e2e-tag-taxonomy.mjs check #8
  -- (`legacy_category_values == 0`) reads it, and search facets are keyed on
  -- it. A row whose text still names a deleted category is a facet nobody
  -- can reach.
  select count(*) into v_ref_text
  from unified_tags where category is not null and category = any(v_names);
  if v_ref_text > 0 then
    raise exception 'taxonomy v2 retire: % tags still carry a retired category NAME in the text mirror', v_ref_text;
  end if;

  -- Junction rows are allowed to be residue (a non-primary cross-listing on
  -- a retired stop), so they are DELETED rather than asserted — but only for
  -- retired categories, and only after the two assertions above prove no
  -- tag's PRIMARY filing depends on them.
  delete from tag_category_assignments a
  using tag_categories c
  where c.id = a.category_id and c.slug = any(v_retired);
  get diagnostics v_ref_junction = row_count;

  -- ── Delete children first, then each childless parent ──────────────────
  delete from tag_categories where slug = any(v_retired) and level = 1;

  if exists (
    select 1 from tag_categories p
    where p.slug = any(v_retired) and p.level = 0
      and exists (select 1 from tag_categories c where c.parent_id = p.id)) then
    raise exception 'taxonomy v2 retire: refusing to delete a root that still has child categories (the CASCADE would take them silently)';
  end if;

  delete from tag_categories where slug = any(v_retired) and level = 0;

  -- ── Postconditions ─────────────────────────────────────────────────────
  if exists (select 1 from tag_categories where slug = any(v_retired)) then
    raise exception 'taxonomy v2 retire: retired slugs survive the delete';
  end if;

  if (select count(*) from tag_categories where level = 0) <> 8 then
    raise exception 'taxonomy v2 retire: expected exactly 8 lines after retirement, found %',
      (select count(*) from tag_categories where level = 0);
  end if;

  -- No stop may be orphaned by the root deletes.
  select count(*) into v_orphans from tag_categories c
  where c.level = 1 and not exists (select 1 from tag_categories p where p.id = c.parent_id);
  if v_orphans > 0 then
    raise exception 'taxonomy v2 retire: % stops lost their parent', v_orphans;
  end if;

  -- Dangling denorm FK (belt and braces — SET NULL means this cannot happen,
  -- but a value that survives would be invisible everywhere else).
  if exists (
    select 1 from unified_tags u
    where u.category_id is not null
      and not exists (select 1 from tag_categories c where c.id = u.category_id)) then
    raise exception 'taxonomy v2 retire: dangling unified_tags.category_id after delete';
  end if;

  raise notice 'taxonomy v2 retire: removed % categories, % residual junction rows',
    array_length(v_retired, 1), v_ref_junction;
end $$;

-- ── Narrow the adult recompute back to v3 ────────────────────────────────
-- PR A (20261006090100) widened this to the union of both trees so a tag
-- moved mid-swap could not lose its age gate. The v2 names are gone now, so
-- carrying them would only make a future rename look safe when it is not.
-- The parent arm stays: every stop under Sex & Kink is adult by its parent,
-- regardless of what the stop is called.
create or replace function public.unified_tags_recompute_is_adult()
returns trigger
language plpgsql
set search_path to 'public'
as $fn$
declare
  v_tag_id uuid := coalesce(new.tag_id, old.tag_id);
  v_is_adult boolean;
begin
  if v_tag_id is null then return coalesce(new, old); end if;
  select exists (
    select 1 from public.tag_category_assignments tca
    join public.tag_categories tc on tc.id = tca.category_id
    left join public.tag_categories tcp on tcp.id = tc.parent_id
    where tca.tag_id = v_tag_id
      and (tc.name in ('Sex & Kink','Practices & Play','Dynamics & Roles','Fetishes','Gear',
                       'Kink Community & Scenes')
           or tcp.name = 'Sex & Kink')
  ) into v_is_adult;
  update public.unified_tags
     set is_adult = v_is_adult
   where id = v_tag_id and is_adult is distinct from v_is_adult;
  return coalesce(new, old);
end;
$fn$;
