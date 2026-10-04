-- guides route metadata — a guide can BE a route, and says so explicitly
--
-- `is_route` IS THE OPT-IN, AND THAT IS THE WHOLE SHAPE OF THIS MIGRATION.
-- `NOT NULL DEFAULT false` means every one of the 14 existing guides is
-- unaffected and NO public surface changes on deploy: `/guides/:slug` renders a
-- route block only when the flag is on, and nothing turns it on but a human.
-- Measured before writing: 14 guides (6 guide / 7 list / 1 quest), 106 picks,
-- 0 orphaned, pick entity types {event, marketplace, venue}.
--
-- COORDINATES ARE DELIBERATELY NOT DENORMALISED ONTO `guide_picks`, and this is
-- the one decision here that is a safety property rather than a preference.
-- `fetchPickEntities` (src/lib/guidePickAdapters.ts) resolves each target under
-- THE TARGET'S OWN RLS, which is why a safety-gated venue renders absent
-- instead of leaking. `guide_picks_public_read` embeds the GUIDE's predicate,
-- not the venue's — so copying a venue's latitude into this table would move a
-- gated venue's location across its own gate. Resolve live, every time.
--
-- `position` ALREADY ORDERS STOPS and `is_orphaned` ALREADY TOMBSTONES a
-- deleted target. Nothing else is added to `guide_picks` beyond the two notes,
-- and that is a decision rather than an omission.
--
-- WHAT IS NOT IN THE TRIGGER'S COLUMN LIST, and why. `route_distance_km`,
-- `route_duration_min` and `route_notes_md` carry NO index value, so listing
-- them would re-fire the indexer for nothing — the same reasoning that already
-- keeps `pick_count` and `updated_at` out of `trg_search_documents_guide`
-- while `pick_count` IS in the facets. Verified against the live trigger
-- definition rather than a repo file.
--
-- THE INDEXER IS PATCHED, NOT RESTATED. `search_documents_index_guides` is
-- live-md5 `baa22be0cbe1b0c9fc4c1b36f886897d` and this file performs a string
-- insert into `pg_get_functiondef()`'s output. A `CREATE OR REPLACE` built from
-- the newest repo file silently reverts whatever else has been patched into it
-- since — the trap `99991790719601` recorded for `tag_hygiene_stats`.
--
-- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS. Every ADD COLUMN is
-- `IF NOT EXISTS` and every constraint is guarded on `pg_constraint`, so a
-- concurrent session that lands part of this first costs a no-op rather than
-- aborting `db push` for the whole repo.

-- ── 1. guides: the route columns ─────────────────────────────────────────────

alter table public.guides
  add column if not exists is_route boolean not null default false,
  add column if not exists route_kind text,
  add column if not exists route_distance_km numeric,
  add column if not exists route_duration_min integer,
  add column if not exists route_notes_md text;

comment on column public.guides.is_route is
  'Opt-in: this guide is a ROUTE and draws on the map. Default false, so no '
  'existing guide changes behaviour. Flipped by a human after '
  'src/lib/guideRouteChecks.ts publishBlockers() is empty.';
comment on column public.guides.route_kind is
  'walk|cycle|transit|drive|mixed. Aligned to tripLegs.TransportMode plus '
  '"mixed". Required when is_route — see guides_route_kind_when_route.';
comment on column public.guides.route_distance_km is
  'EDITOR-STATED, never computed. This platform does not route: tripLegs.ts '
  'rules journey planning permanently out of scope because the '
  'origin/destination/time triple IS the sensitive query.';
comment on column public.guides.route_duration_min is
  'EDITOR-STATED, never computed. See route_distance_km.';
comment on column public.guides.route_notes_md is
  'Free prose for the route as a whole (where to start, what to book). '
  'Per-stop copy lives on guide_picks.';

-- `route_kind` vocabulary. NOT VALID is deliberate and costs nothing here:
-- every existing row has route_kind NULL, which the CHECK permits, so the
-- constraint is satisfiable by the whole corpus today — but a NOT VALID
-- constraint also cannot be defeated by a row this migration has not seen.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'guides_route_kind_known'
  ) then
    alter table public.guides
      add constraint guides_route_kind_known
      check (route_kind is null or route_kind in ('walk','cycle','transit','drive','mixed'));
  end if;
end $$;

-- A route MUST state its kind. Satisfiable by every existing row (all
-- is_route=false), so it can be added validated rather than NOT VALID.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'guides_route_kind_when_route'
  ) then
    alter table public.guides
      add constraint guides_route_kind_when_route
      check (not is_route or route_kind is not null);
  end if;
end $$;

-- Non-negative, because an editor-stated figure is still a figure. Separate
-- constraints so a violation names which one.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'guides_route_distance_nonneg') then
    alter table public.guides
      add constraint guides_route_distance_nonneg
      check (route_distance_km is null or route_distance_km >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'guides_route_duration_nonneg') then
    alter table public.guides
      add constraint guides_route_duration_nonneg
      check (route_duration_min is null or route_duration_min >= 0);
  end if;
end $$;

-- ── 2. guide_picks: per-stop access and safety notes ─────────────────────────

alter table public.guide_picks
  add column if not exists access_note text,
  add column if not exists safety_note text;

comment on column public.guide_picks.access_note is
  'Per-stop accessibility prose, written by the editor. NOT a controlled '
  'vocabulary and NOT venues.accessibility_attributes — that column is '
  'measured per venue and governed by _shared/accessibility-vocab.ts. This is '
  'route-specific ("the lift is round the back"), so it must not be mistaken '
  'for a venue-level access claim.';
comment on column public.guide_picks.safety_note is
  'Per-stop safety prose for THIS route. A gated target already self-filters '
  'through its own RLS; this is for what a reader should know on the way.';

-- ── 3. the search facet ──────────────────────────────────────────────────────
--
-- PATCHED into the live definition. `is_route` is emitted through
-- `nullif(g.is_route, false)` so `jsonb_strip_nulls` removes it for every
-- non-route: a facet present on all 14 rows reading `false` is noise, while an
-- absent key means "not a route" and a present one means "is". `route_kind` is
-- already stripped when null.
do $patch$
declare
  v_src text;
  v_new text;
  v_needle text := '''pick_count'', g.pick_count,';
  v_add   text := '''pick_count'', g.pick_count,'
               || E'\n      ''is_route'', nullif(g.is_route, false),'
               || E'\n      ''route_kind'', g.route_kind,';
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'search_documents_index_guides';

  if v_src is null then
    raise exception 'search_documents_index_guides is absent — refusing to invent it';
  end if;

  -- Already patched (a concurrent session, or a re-run): no-op rather than
  -- inserting the keys twice.
  if position('''is_route''' in v_src) > 0 then
    raise notice 'indexer already emits is_route — leaving it alone';
    return;
  end if;

  if position(v_needle in v_src) = 0 then
    raise exception
      'the pick_count facet anchor is gone from search_documents_index_guides — '
      'the function was rewritten and this patch cannot be applied blind';
  end if;

  v_new := replace(v_src, v_needle, v_add);
  if v_new = v_src then
    raise exception 'facet patch produced no change';
  end if;
  execute v_new;
end $patch$;

-- ── 4. the sync trigger's column list ────────────────────────────────────────
--
-- Recreated with `is_route, route_kind` APPENDED and the three prose/number
-- columns deliberately absent (see the header). Read off the live
-- `pg_get_triggerdef` rather than copied from a migration file.

drop trigger if exists trg_search_documents_guide on public.guides;
create trigger trg_search_documents_guide
  after insert or delete or update of
    status, format, slug, title, dek, intro_md, category, primary_entity_type,
    city_id, audience_tags, hero_image_path, is_featured, safety_gated,
    starts_at, ends_at, is_route, route_kind
  on public.guides
  for each row execute function search_documents_sync('guide');

-- ── 5. backfill the facet ────────────────────────────────────────────────────
--
-- Every published guide is re-indexed once so the new keys exist on rows that
-- will not be edited again. Cheap: 14 rows.
select public.search_documents_index_guides(null);

-- ── 6. postconditions ────────────────────────────────────────────────────────
--
-- Counts the REACHED state positively. A check that counts rows in a BAD state
-- returns zero for a column that was never added, which is exactly what the
-- softened preconditions above now let through.
do $verify$
declare
  v_cols int;
  v_pick_cols int;
  v_cons int;
  v_trgdef text;
  v_src text;
  v_facet_rows int;
  v_published int;
begin
  select count(*) into v_cols
  from information_schema.columns
  where table_schema='public' and table_name='guides'
    and column_name in ('is_route','route_kind','route_distance_km',
                        'route_duration_min','route_notes_md');
  if v_cols <> 5 then
    raise exception 'P1 failed: expected 5 route columns on guides, found %', v_cols;
  end if;

  select count(*) into v_pick_cols
  from information_schema.columns
  where table_schema='public' and table_name='guide_picks'
    and column_name in ('access_note','safety_note');
  if v_pick_cols <> 2 then
    raise exception 'P2 failed: expected 2 note columns on guide_picks, found %', v_pick_cols;
  end if;

  select count(*) into v_cons
  from pg_constraint
  where conname in ('guides_route_kind_known','guides_route_kind_when_route',
                    'guides_route_distance_nonneg','guides_route_duration_nonneg');
  if v_cons <> 4 then
    raise exception 'P3 failed: expected 4 route constraints, found %', v_cons;
  end if;

  -- The flag must default OFF on every existing row, or this migration has
  -- changed a public surface it promised not to touch.
  if exists (select 1 from public.guides where is_route) then
    raise exception
      'P4 failed: a guide is already flagged is_route — this migration must '
      'change no public surface on deploy';
  end if;

  -- The trigger fires on the two index-bearing columns and NOT on the three
  -- that carry no index value. Both halves, because "it mentions is_route" is
  -- equally true of a trigger that fires on every column.
  select pg_get_triggerdef(t.oid) into v_trgdef
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='guides' and t.tgname='trg_search_documents_guide';
  if v_trgdef is null then
    raise exception 'P5 failed: trg_search_documents_guide is absent';
  end if;
  if position('is_route' in v_trgdef) = 0 or position('route_kind' in v_trgdef) = 0 then
    raise exception 'P5 failed: the trigger does not fire on is_route/route_kind: %', v_trgdef;
  end if;
  if position('route_notes_md' in v_trgdef) > 0
     or position('route_distance_km' in v_trgdef) > 0
     or position('route_duration_min' in v_trgdef) > 0 then
    raise exception
      'P6 failed: the trigger fires on a prose/number route column, which '
      're-indexes for no index value: %', v_trgdef;
  end if;

  -- The indexer emits the facet.
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='search_documents_index_guides';
  if position('''is_route''' in v_src) = 0 or position('''route_kind''' in v_src) = 0 then
    raise exception 'P7 failed: the indexer does not emit the route facets';
  end if;
  -- And it emits is_route through nullif, so a non-route carries no key.
  if position('nullif(g.is_route, false)' in v_src) = 0 then
    raise exception
      'P8 failed: is_route is not emitted through nullif(…, false), so every '
      'non-route guide would carry a false facet';
  end if;

  -- The backfill ran and the facet is ABSENT on the non-routes, which is the
  -- nullif working rather than the key being missing. Asserted against the
  -- published count so "0 rows carry it" cannot pass on an empty index.
  select count(*) into v_published from public.guides where status='published';
  select count(*) into v_facet_rows
  from public.search_documents
  where entity_type='guide' and facets ? 'is_route';
  if v_published = 0 then
    raise exception 'P9 failed: no published guides, so the facet check measured nothing';
  end if;
  if v_facet_rows <> 0 then
    raise exception
      'P9 failed: % guide documents carry an is_route facet while no guide is '
      'a route — nullif is not stripping it', v_facet_rows;
  end if;

  raise notice 'guides route metadata: 5 cols, 2 pick cols, 4 constraints, facet patched, % published guides re-indexed', v_published;
end $verify$;

-- RLS: unchanged. The new columns inherit `guides_public_read` /
-- `guide_picks_public_read`, and no new table means no new anon GRANT — this
-- project's own trap, where a newly created relation picks up the public
-- schema's default privileges. Asserted below rather than assumed.
do $grants$
declare
  v_anon boolean;
begin
  select has_column_privilege('anon', 'public.guides', 'is_route', 'SELECT') into v_anon;
  if not v_anon then
    raise exception
      'P10 failed: anon cannot read guides.is_route, so /guides/:slug would '
      'render no route block for a signed-out reader';
  end if;
end $grants$;
