-- Kink & feature filters, part 1: the registry and the sync.
--
-- Spec: docs/superpowers/specs/2026-11-22-kink-feature-filters-design.md
-- Plan: docs/superpowers/plans/2026-11-22-kink-feature-filters.md
--
-- Every filter term IS a unified_tags row. `kink_filter_terms` only marks which
-- tags are filters, their group (feature | kink), order, and the venue amenity
-- that means the same thing.
--
-- The filter column stays the `tags` text array on events and venues — that is
-- what useEvents / useVenues / rpc_venues_ranked already filter on with `&&`.
-- Two triggers keep the other representations in step with it:
--   * kink_amenity_to_tags (BEFORE, venues): an amenity that maps to a registry
--     tag puts the tag slug in `tags`. Measured before this file: amenity
--     `darkroom` on 181 live venues, tag `darkroom` on 0 — two systems that never
--     met.
--   * kink_tags_sync_assignments (AFTER, events + venues): registry slugs that
--     enter or leave `tags` are mirrored into unified_tag_assignments, so tag
--     pages (get_tag_linked_content reads assignments) list the same rows the
--     filters return. Only registry tags are touched; it deletes an assignment
--     only for a slug that was in OLD.tags and is not in NEW.tags, so an
--     assignment that never had an array entry is never removed by this trigger.
--
-- Measured before writing the sync (prod, 2026-11-22), registry seeds:
-- arrays and assignments agree everywhere except 10 venue rows that carry the
-- assignment without the array entry (cruising 1, leather 5, sauna 2,
-- steam-room 2). The backfill ADDS the slug to those arrays rather than
-- deleting the assignment: the assignment was a positive claim by some writer.
--
-- Not done here, deliberately:
--   * cruising-area is NOT merged into cruising. merge_tag_concept is overloaded
--     in two schemas and the duplicate is harmless; the amenity `cruising-area`
--     simply maps to tag `cruising`.
--   * `socks` is not seeded: its row is the generic sense ("Footwear worn under
--     shoes"). The fetish sense is the new `sneakers` tag.
--   * get_tag_linked_content's VENUE ordering is unchanged; only events move to
--     upcoming-first (they listed the most recent PAST date first).

-- log_unified_tag_change() refuses an undeclared (system:%) actor touching a
-- human_reviewed tag; inserting a tag recomputes is_adult on its category
-- neighbours through unified_tags_recompute_is_adult(), which hits that guard.
select set_config('app.actor', 'migration:99991795359027_kink_filter_terms', true);

-- ---------------------------------------------------------------------------
-- A. Tags the vocabulary is missing.
--
-- Two "missing" terms were not missing, and the dry run is what showed it:
--   * `sling` is an alias of `sex-swing` ("Suspended harness for supported sex
--     positions") — the same object. The registry uses sex-swing and labels
--     the chip "Sling". The alias stays `auto`: an APPROVED alias is also an
--     auto-tagging rule, and "sling" tags every sling bag in the shop.
--   * `naked-party` is an `auto` multilingual alias of `nudist-party`, whose
--     own definition is "Non-sexual party where guests are nude". A naked night
--     at a cruise club is the opposite sense, and the alias is not a
--     translation of anything, so it is deleted and the term gets its own row.
-- ---------------------------------------------------------------------------
delete from public.tag_aliases a
 using public.unified_tags t
 where t.id = a.canonical_tag_id and t.slug = 'nudist-party'
   and a.alias_slug = 'naked-party' and a.review_status = 'auto';

create temporary table _kink_new_tags (
  slug text primary key, name text not null, cat text not null,
  descr text not null, summ text not null,
  adult boolean not null, sensitive boolean not null
) on commit drop;

insert into _kink_new_tags values
('private-cabins','Private Cabins','safe-spaces',
 'Small lockable rooms in a sauna or club, rented or used by the hour, for privacy away from the open areas.',
 'Lockable private rooms in a sauna or club.', true, true),
('dress-code','Dress Code','events-scene',
 'A party or venue rule about what to wear — leather, rubber, uniform, underwear only, or naked. At fetish parties the dress code is often enforced at the door.',
 'A party or venue rule about what to wear, often enforced at the door.', false, false),
('naked-party','Naked Party','events-scene',
 'A party where guests are naked, usually after leaving clothes in a cloakroom or locker. Distinct from naturist venues: the setting is a club night, not a beach or resort.',
 'A party where guests are naked; clothes go in the cloakroom.', true, true),
('underwear-party','Underwear Party','events-scene',
 'A party where the dress code is underwear, jockstraps or swimwear, with clothes checked at the door.',
 'A party with an underwear-only dress code.', true, true),
('sneakers','Sneakers','fetishes-interests',
 'A fetish for sneakers and sports socks, and the parties and groups built around it. Usually shortened to "sneaks" or "sox".',
 'A fetish for sneakers and sports socks.', true, true);

insert into public.unified_tags (
  name, slug, description, short_description, category_id, category,
  status, seo_indexable, human_reviewed, is_adult, is_sensitive, usage_count,
  publication_role
)
select n.name, n.slug, n.descr, n.summ, c.id, c.name,
       'active', false, true, n.adult, n.sensitive, 0, 'utility'
from _kink_new_tags n
join public.tag_categories c on c.slug = n.cat
where not exists (select 1 from public.unified_tags t where t.slug = n.slug)
  and not exists (select 1 from public.tag_aliases a where a.alias_slug = n.slug);

insert into public.tag_category_assignments (tag_id, category_id, is_primary)
select t.id, c.id, true
from _kink_new_tags n
join public.unified_tags t on t.slug = n.slug
join public.tag_categories c on c.slug = n.cat
where not exists (
  select 1 from public.tag_category_assignments x where x.tag_id = t.id and x.is_primary
);

-- ---------------------------------------------------------------------------
-- B. The registry.
-- ---------------------------------------------------------------------------
create table if not exists public.kink_filter_terms (
  tag_id uuid primary key references public.unified_tags(id) on delete cascade,
  term_group text not null check (term_group in ('feature','kink')),
  sort int not null default 100,
  amenity_slug text references public.amenities(slug),
  applies_to text[] not null default '{events,venues}'
    check (cardinality(applies_to) > 0 and applies_to <@ '{events,venues}'::text[]),
  public_without_18 boolean not null default false,
  label text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.kink_filter_terms is
  'Which unified_tags are kink & feature filters on /events and /venues. Read through kink_filter_terms_list() / kink_filter_term(); add a row to add a filter.';

alter table public.kink_filter_terms enable row level security;
revoke all on public.kink_filter_terms from anon, authenticated;

create temporary table _kink_seed (
  slug text primary key, grp text, sort int, amenity text, applies text[], pub boolean,
  label text
) on commit drop;

insert into _kink_seed values
  ('darkroom',        'feature', 10, 'darkroom',       '{events,venues}', true),
  ('sex-swing',       'feature', 20, null,             '{events,venues}', false),
  ('glory-hole',      'feature', 30, null,             '{events,venues}', false),
  ('sauna',           'feature', 40, null,             '{events,venues}', true),
  ('steam-room',      'feature', 50, 'steam-room',     '{venues}',        true),
  ('cruising',        'feature', 60, 'cruising-area',  '{events,venues}', false),
  ('private-cabins',  'feature', 70, 'private-cabins', '{venues}',        false),
  ('whirlpool',       'feature', 80, 'hot-tub',        '{venues}',        true),
  ('dress-code',      'feature', 90, null,             '{events}',        true),
  ('naked-party',     'feature', 100, null,            '{events}',        false),
  ('underwear-party', 'feature', 110, null,            '{events}',        false),
  ('fisting',         'kink',    10, null,             '{events,venues}', false),
  ('piss-play',       'kink',    20, null,             '{events,venues}', false),
  ('bondage',         'kink',    30, null,             '{events,venues}', false),
  ('bdsm',            'kink',    40, null,             '{events,venues}', false),
  ('leather',         'kink',    50, null,             '{events,venues}', false),
  ('rubber',          'kink',    60, null,             '{events,venues}', false),
  ('puppy-play',      'kink',    70, null,             '{events,venues}', false),
  ('spanking',        'kink',    80, null,             '{events,venues}', false),
  ('cock-and-ball-torture','kink',90, null,            '{events,venues}', false),
  ('sneakers',        'kink',    100, null,            '{events,venues}', false);

update _kink_seed set label = 'Sling' where slug = 'sex-swing';
update _kink_seed set label = 'Steam room' where slug = 'steam-room';
update _kink_seed set label = 'Hot tub' where slug = 'whirlpool';
update _kink_seed set label = 'Piss' where slug = 'piss-play';
update _kink_seed set label = 'CBT' where slug = 'cock-and-ball-torture';

insert into public.kink_filter_terms (tag_id, term_group, sort, amenity_slug, applies_to, public_without_18, label)
select t.id, s.grp, s.sort, s.amenity, s.applies, s.pub, s.label
from _kink_seed s
join public.unified_tags t on t.slug = s.slug and t.status = 'active' and t.merged_into_id is null
on conflict (tag_id) do nothing;

-- ---------------------------------------------------------------------------
-- C. Sync triggers.
-- ---------------------------------------------------------------------------
create or replace function public.kink_amenity_to_tags()
returns trigger
language plpgsql
set search_path = ''
as $fn$
declare
  v_add text[];
begin
  if new.amenities is null or cardinality(new.amenities) = 0 then
    return new;
  end if;
  select coalesce(array_agg(t.slug order by t.slug), '{}')
    into v_add
    from public.kink_filter_terms k
    join public.unified_tags t on t.id = k.tag_id
   where k.enabled
     and k.amenity_slug = any(new.amenities)
     and not (t.slug = any(coalesce(new.tags, '{}')));
  if cardinality(v_add) > 0 then
    new.tags := coalesce(new.tags, '{}') || v_add;
  end if;
  return new;
end
$fn$;

drop trigger if exists zzzzzzzz_kink_amenity_tags on public.venues;
create trigger zzzzzzzz_kink_amenity_tags
  before insert or update on public.venues
  for each row execute function public.kink_amenity_to_tags();

create or replace function public.kink_tags_sync_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_type text := case tg_table_name when 'events' then 'event' else 'venues' end;
  v_old text[] := case when tg_op = 'UPDATE' then coalesce(old.tags, '{}') else '{}' end;
  v_new text[] := coalesce(new.tags, '{}');
begin
  -- Added registry slugs -> assignment rows.
  insert into public.unified_tag_assignments (tag_id, entity_id, entity_type)
  select k.tag_id, new.id, v_type
    from public.kink_filter_terms k
    join public.unified_tags t on t.id = k.tag_id
   where t.slug = any(v_new)
  on conflict (tag_id, entity_id, entity_type) do nothing;

  -- Registry slugs that LEFT the array -> drop their assignment.
  if tg_op = 'UPDATE' then
    delete from public.unified_tag_assignments a
     using public.kink_filter_terms k, public.unified_tags t
     where t.id = k.tag_id
       and a.tag_id = k.tag_id
       and a.entity_id = new.id
       and a.entity_type = v_type
       and t.slug = any(v_old)
       and not (t.slug = any(v_new));
  end if;
  return null;
end
$fn$;

revoke all on function public.kink_tags_sync_assignments() from public, anon, authenticated;

drop trigger if exists zz_kink_tags_sync_ins on public.events;
create trigger zz_kink_tags_sync_ins after insert on public.events
  for each row when (new.tags is not null and cardinality(new.tags) > 0)
  execute function public.kink_tags_sync_assignments();
drop trigger if exists zz_kink_tags_sync_upd on public.events;
create trigger zz_kink_tags_sync_upd after update on public.events
  for each row when (old.tags is distinct from new.tags)
  execute function public.kink_tags_sync_assignments();

drop trigger if exists zz_kink_tags_sync_ins on public.venues;
create trigger zz_kink_tags_sync_ins after insert on public.venues
  for each row when (new.tags is not null and cardinality(new.tags) > 0)
  execute function public.kink_tags_sync_assignments();
drop trigger if exists zz_kink_tags_sync_upd on public.venues;
create trigger zz_kink_tags_sync_upd after update on public.venues
  for each row when (old.tags is distinct from new.tags)
  execute function public.kink_tags_sync_assignments();

-- ---------------------------------------------------------------------------
-- D. Backfill, batched at 300 (every venue UPDATE fans out through the search
--    trigger; larger batches time out).
-- ---------------------------------------------------------------------------
create or replace function public.run_kink_tag_array_backfill(p_batch int default 300)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_amenity int := 0;
  v_assign_only int := 0;
begin
  -- 1. venues whose amenity maps to a registry tag missing from `tags`.
  --    A no-op UPDATE of amenities fires the BEFORE trigger, which adds it.
  with todo as (
    select v.id
      from public.venues v
      join public.kink_filter_terms k on k.enabled and k.amenity_slug = any(v.amenities)
      join public.unified_tags t on t.id = k.tag_id
     where not (t.slug = any(coalesce(v.tags, '{}')))
     group by v.id
     limit p_batch
  )
  update public.venues v set amenities = v.amenities
    from todo where v.id = todo.id;
  get diagnostics v_amenity = row_count;

  -- 2. registry assignments without an array entry: add the slug to the array.
  with todo as (
    select v.id, array_agg(distinct t.slug) as add_slugs
      from public.unified_tag_assignments a
      join public.kink_filter_terms k on k.tag_id = a.tag_id
      join public.unified_tags t on t.id = a.tag_id
      join public.venues v on v.id = a.entity_id
     where a.entity_type = 'venues'
       and not (t.slug = any(coalesce(v.tags, '{}')))
     group by v.id
     limit p_batch
  )
  update public.venues v set tags = coalesce(v.tags, '{}') || todo.add_slugs
    from todo where v.id = todo.id;
  get diagnostics v_assign_only = row_count;

  with todo as (
    select e.id, array_agg(distinct t.slug) as add_slugs
      from public.unified_tag_assignments a
      join public.kink_filter_terms k on k.tag_id = a.tag_id
      join public.unified_tags t on t.id = a.tag_id
      join public.events e on e.id = a.entity_id
     where a.entity_type = 'event'
       and not (t.slug = any(coalesce(e.tags, '{}')))
     group by e.id
     limit p_batch
  )
  update public.events e set tags = coalesce(e.tags, '{}') || todo.add_slugs
    from todo where e.id = todo.id;

  -- 3. array entries without an assignment (rubber on 2 events, measured).
  insert into public.unified_tag_assignments (tag_id, entity_id, entity_type)
  select k.tag_id, e.id, 'event'
    from public.kink_filter_terms k
    join public.unified_tags t on t.id = k.tag_id
    join public.events e on t.slug = any(e.tags)
  on conflict (tag_id, entity_id, entity_type) do nothing;
  insert into public.unified_tag_assignments (tag_id, entity_id, entity_type)
  select k.tag_id, v.id, 'venues'
    from public.kink_filter_terms k
    join public.unified_tags t on t.id = k.tag_id
    join public.venues v on t.slug = any(v.tags)
  on conflict (tag_id, entity_id, entity_type) do nothing;

  return jsonb_build_object('amenity_mirrored', v_amenity, 'array_added', v_assign_only);
end
$fn$;

revoke all on function public.run_kink_tag_array_backfill(int) from public, anon, authenticated;
grant execute on function public.run_kink_tag_array_backfill(int) to service_role;

do $backfill$
declare
  r jsonb;
  i int := 0;
begin
  loop
    r := public.run_kink_tag_array_backfill(300);
    i := i + 1;
    exit when (r->>'amenity_mirrored')::int = 0 and (r->>'array_added')::int = 0;
    if i > 40 then
      raise exception 'kink backfill did not converge after % passes: %', i, r;
    end if;
  end loop;
end
$backfill$;

-- ---------------------------------------------------------------------------
-- E. Read path. SECURITY DEFINER because most of these tags are is_sensitive
--    and unified_tags_public_gated_read hides them from anon. Both functions
--    serve REGISTRY rows only, so the glossary gate is not widened: a sensitive
--    tag that is not a filter still reads as nothing. The 18+ check is the
--    client's (useAgeAffirmation), as on every other adult surface.
-- ---------------------------------------------------------------------------
create or replace function public.kink_filter_terms_list()
returns table (
  slug text, name text, label text, short_description text, term_group text, sort int,
  applies_to text[], public_without_18 boolean, event_count bigint, venue_count bigint
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with reg as (
    select t.id, t.slug, t.name, coalesce(k.label, t.name) as label, t.short_description,
           k.term_group, k.sort, k.applies_to, k.public_without_18
      from public.kink_filter_terms k
      join public.unified_tags t on t.id = k.tag_id
     where k.enabled and t.status = 'active' and t.merged_into_id is null
  ),
  slugs as (select array_agg(slug) as a from reg),
  ev as (
    select u.slug, count(*) as n
      from public.events e, slugs, unnest(e.tags) as u(slug)
     where e.tags && slugs.a
       and u.slug = any(slugs.a)
       and e.duplicate_of_id is null
       and e.status = 'active'
       and coalesce(e.end_date, e.start_date) >= now()
       and (not e.safety_gated or (select auth.uid()) is not null)
     group by u.slug
  ),
  ve as (
    select u.slug, count(*) as n
      from public.venues v, slugs, unnest(v.tags) as u(slug)
     where v.tags && slugs.a
       and u.slug = any(slugs.a)
       and v.duplicate_of_id is null
       and v.closed_at is null
       and (not v.safety_gated or (select auth.uid()) is not null)
     group by u.slug
  )
  select r.slug, r.name, r.label, r.short_description, r.term_group, r.sort, r.applies_to,
         r.public_without_18, coalesce(ev.n, 0), coalesce(ve.n, 0)
    from reg r
    left join ev on ev.slug = r.slug
    left join ve on ve.slug = r.slug
   order by r.term_group, r.sort, r.name;
$fn$;

create or replace function public.kink_filter_term(p_slug text)
returns table (
  tag_id uuid, slug text, name text, label text, short_description text, term_group text,
  public_without_18 boolean
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select t.id, t.slug, t.name, coalesce(k.label, t.name), t.short_description, k.term_group,
         k.public_without_18
    from public.kink_filter_terms k
    join public.unified_tags t on t.id = k.tag_id
   where k.enabled and t.status = 'active' and t.merged_into_id is null
     and t.slug = lower(p_slug);
$fn$;

revoke all on function public.kink_filter_terms_list() from public;
revoke all on function public.kink_filter_term(text) from public;
grant execute on function public.kink_filter_terms_list() to anon, authenticated, service_role;
grant execute on function public.kink_filter_term(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- F. Tag pages: events upcoming-first, merged duplicates out. Patched from the
--    live definition, never restated.
-- ---------------------------------------------------------------------------
do $patch$
declare
  v_def text := pg_get_functiondef('public.get_tag_linked_content(uuid,text,text,integer)'::regprocedure);
  v_from text := 'ORDER BY e.is_featured DESC NULLS LAST, e.start_date DESC NULLS LAST';
  v_to text := 'ORDER BY (coalesce(e.end_date, e.start_date) >= now()) DESC, '
            || 'CASE WHEN coalesce(e.end_date, e.start_date) >= now() THEN e.start_date END ASC NULLS LAST, '
            || 'e.start_date DESC NULLS LAST';
  v_status_from text := 'AND e.status = ''active''';
  v_n int;
begin
  if position('coalesce(e.end_date, e.start_date) >= now()' in v_def) > 0 then
    return;  -- already patched
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
  if v_n <> 1 then
    raise exception 'get_tag_linked_content: expected exactly one event ORDER BY, found %', v_n;
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_status_from, ''))) / length(v_status_from);
  if v_n <> 1 then
    raise exception 'get_tag_linked_content: expected exactly one event status filter, found %', v_n;
  end if;
  v_def := replace(v_def, v_from, v_to);
  v_def := replace(v_def, v_status_from, v_status_from || ' AND e.duplicate_of_id IS NULL');
  execute v_def;
end
$patch$;

-- ---------------------------------------------------------------------------
-- G. Postconditions. Stated as end state, so a concurrent repair that reaches
--    the same state passes.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_bad int;
  v_names text;
begin
  select count(*), string_agg(s.slug, ', ') into v_bad, v_names
    from _kink_seed s
   where not exists (
     select 1 from public.kink_filter_terms k join public.unified_tags t on t.id = k.tag_id
      where t.slug = s.slug);
  if v_bad <> 0 then
    raise exception 'P1 failed: % seed term(s) not in the registry: %', v_bad, v_names;
  end if;

  select count(*) into v_bad
    from public.kink_filter_terms k join public.unified_tags t on t.id = k.tag_id
   where t.status <> 'active' or t.merged_into_id is not null;
  if v_bad <> 0 then
    raise exception 'P2 failed: % registry row(s) point at an inactive or merged tag', v_bad;
  end if;

  select count(*) into v_bad
    from public.venues v
    join public.kink_filter_terms k on k.enabled and k.amenity_slug = any(v.amenities)
    join public.unified_tags t on t.id = k.tag_id
   where not (t.slug = any(coalesce(v.tags, '{}')));
  if v_bad <> 0 then
    raise exception 'P3 failed: % venue(s) carry a mapped amenity without the tag', v_bad;
  end if;

  select count(*) into v_bad
    from public.kink_filter_terms k
    join public.unified_tags t on t.id = k.tag_id
    join public.events e on t.slug = any(e.tags)
   where not exists (select 1 from public.unified_tag_assignments a
                      where a.tag_id = k.tag_id and a.entity_id = e.id and a.entity_type = 'event');
  if v_bad <> 0 then
    raise exception 'P4 failed: % event array entries without an assignment', v_bad;
  end if;

  select count(*) into v_bad
    from public.kink_filter_terms k
    join public.unified_tags t on t.id = k.tag_id
    join public.venues v on t.slug = any(v.tags)
   where not exists (select 1 from public.unified_tag_assignments a
                      where a.tag_id = k.tag_id and a.entity_id = v.id and a.entity_type = 'venues');
  if v_bad <> 0 then
    raise exception 'P5 failed: % venue array entries without an assignment', v_bad;
  end if;

  -- The read path must not widen the glossary gate: a sensitive tag that is
  -- not a filter returns nothing.
  select count(*) into v_bad
    from public.unified_tags t
   where t.is_sensitive and t.status = 'active'
     and not exists (select 1 from public.kink_filter_terms k where k.tag_id = t.id)
     and exists (select 1 from public.kink_filter_term(t.slug))
   ;
  if v_bad <> 0 then
    raise exception 'P6 failed: kink_filter_term serves % non-registry sensitive tag(s)', v_bad;
  end if;

  if (select count(*) from public.kink_filter_terms_list()) < 15 then
    raise exception 'P7 failed: kink_filter_terms_list returns fewer than 15 terms';
  end if;
end
$verify$;
