-- Kink & feature filters, part 2: fill the tags from event and venue text.
--
-- Spec: docs/superpowers/specs/2026-11-22-kink-feature-filters-design.md
-- Depends on 99991795359027_kink_filter_terms (registry + sync triggers): this
-- file only appends slugs to the `tags` arrays; the sync trigger from part 1
-- writes the matching unified_tag_assignments rows.
--
-- PRECISION WAS MEASURED BEFORE ANY TERM WAS ALLOWED TO AUTO-APPLY (prod,
-- 2026-11-22, hand-read match contexts, rows not yet carrying the tag):
--
--   term             target  n   correct  decision
--   darkroom         venues  14  14       auto
--   darkroom         events  10  10       auto
--   glory-hole       venues  14  14       auto
--   glory-hole       events   6   6       auto
--   sling            venues  14  14       auto, sauna/bar/club/cruising only
--   steam-room       venues  14  14       auto
--   hot tub          venues  14  14       auto (hotel jacuzzis are hot tubs)
--   cruising         venues   8   8       auto
--   cruising         events  10  10       auto
--   naked party      venues   8   8       auto
--   naked party      events  10  10       auto
--   underwear party  events  10  10       auto
--   fist(ing)        events   8   8       auto ("Fist Night", "Xtrem Fist WeekEnd")
--   fisting          venues   4   4       auto
--   piss             events   9   9       auto
--   piss             venues   8   3       auto ONLY as whole words: `piss\w*` matched
--                                        Pissouri Beach, Plage des Pissarelles and
--                                        "Pissoir"; the 3 whole-word hits are right
--   bondage          events   7   7       auto
--   bondage          venues   8   8       auto
--   bdsm             events   4   4       auto
--   bdsm             venues   8   8       auto
--   spanking         events  10   4       auto ONLY as `spanking`: 6 of 10 were
--                                        "Spank Bank Male Revue", a strip show
--   leather          events  10  10       auto
--   rubber / latex   events  10  10       auto
--   sneakers         events   7   7       auto
--   dress code       events  10  ~7       NOT applied: "no dress code" / "free dress
--                                        code" assert the opposite, and events have no
--                                        review inbox to route them to
--   private room     venues  14   2       rejected: matches hotel listings;
--                                        replaced by cabins/cubicles at saunas,
--                                        clubs, bars and cruising spots, review-only
--
-- REVIEW-ONLY on venues (entity_review_queue, field `tags`, venue quality inbox):
-- leather, rubber, sneakers, dress code, puppy play, underwear party, cabins.
-- Leather and rubber auto-apply at bars, clubs, saunas, cruising spots and
-- community centres (8/8 correct each), and stay review-only elsewhere — the
-- first dry run queued 444 rows, mostly leather at exactly those categories.
-- Each is a real word with an ordinary reading ("leather goods", "rubber
-- flooring", "without dresscode"), so a human decides.
--
-- MEMORY: kink_tag_fill_log records every (entity, tag) the fill ever applied
-- or proposed, and the fill never touches a logged pair again. So a tag an
-- editor removes stays removed, and a rejected proposal is not re-proposed —
-- without stamping every scanned row (stamping 30k venues would fan out through
-- the search trigger for no gain).

select set_config('app.actor', 'migration:99991795361199_kink_tag_fill', true);

-- ---------------------------------------------------------------------------
-- A. Patterns and the ledger.
-- ---------------------------------------------------------------------------
create table if not exists public.kink_filter_patterns (
  tag_id uuid not null references public.kink_filter_terms(tag_id) on delete cascade,
  target text not null check (target in ('events','venues')),
  pattern text not null,
  mode text not null check (mode in ('auto','review')),
  venue_categories text[],
  -- review terms only: categories where the term is unambiguous enough to
  -- auto-apply (leather at a bar is the scene; leather at a shop may be handbags)
  auto_venue_categories text[],
  primary key (tag_id, target)
);
alter table public.kink_filter_patterns enable row level security;
revoke all on public.kink_filter_patterns from anon, authenticated;

create table if not exists public.kink_tag_fill_log (
  entity_type text not null check (entity_type in ('events','venues')),
  entity_id uuid not null,
  tag_id uuid not null,
  mode text not null check (mode in ('auto','review')),
  created_at timestamptz not null default now(),
  primary key (entity_type, entity_id, tag_id)
);
alter table public.kink_tag_fill_log enable row level security;
revoke all on public.kink_tag_fill_log from anon, authenticated;

create temporary table _kink_pat (slug text, target text, pattern text, mode text, cats text[], auto_cats text[]) on commit drop;
insert into _kink_pat values
  ('darkroom',        'events', '\mdark ?rooms?\M', 'auto', null, null),
  ('glory-hole',      'events', '\mglory ?-?holes?\M', 'auto', null, null),
  ('cruising',        'events', '\mcruising\M', 'auto', null, null),
  ('naked-party',     'events', '\m(naked|nude) (party|parties|night|nights)\M', 'auto', null, null),
  ('underwear-party', 'events', '\m(underwear|jock ?straps?|jocks|undies) (party|parties|night|nights)\M', 'auto', null, null),
  ('fisting',         'events', '\mfist(s|ing|ers?|fuck\w*)?\M', 'auto', null, null),
  ('piss-play',       'events', '\m(piss|pisse|pissing|watersports?)\M', 'auto', null, null),
  ('bondage',         'events', '\mbondage\M', 'auto', null, null),
  ('bdsm',            'events', '\mbdsm\M', 'auto', null, null),
  ('spanking',        'events', '\mspanking\M', 'auto', null, null),
  ('leather',         'events', '\mleather\M', 'auto', null, null),
  ('rubber',          'events', '\m(rubber|latex)\M', 'auto', null, null),
  ('sneakers',        'events', '\m(sneakers?|sneaks)\M', 'auto', null, null),
  ('darkroom',        'venues', '\mdark ?rooms?\M', 'auto', null, null),
  ('glory-hole',      'venues', '\mglory ?-?holes?\M', 'auto', null, null),
  ('sex-swing',       'venues', '\mslings?\M', 'auto', '{sauna,bar,club,cruising,nightclub}', null),
  ('steam-room',      'venues', '\msteam ?rooms?\M', 'auto', null, null),
  ('whirlpool',       'venues', '\m(whirlpools?|jacuzzis?|hot ?tubs?)\M', 'auto', null, null),
  ('cruising',        'venues', '\mcruising\M', 'auto', null, null),
  ('naked-party',     'venues', '\m(naked|nude) (party|parties|night|nights)\M', 'auto', null, null),
  ('fisting',         'venues', '\mfist(ing|ers?|fuck\w*)\M', 'auto', null, null),
  ('piss-play',       'venues', '\m(piss|pisse|pissing|watersports?)\M', 'auto', null, null),
  ('bondage',         'venues', '\mbondage\M', 'auto', null, null),
  ('bdsm',            'venues', '\mbdsm\M', 'auto', null, null),
  ('spanking',        'venues', '\mspanking\M', 'auto', null, null),
  ('leather',         'venues', '\mleather\M', 'review', null, '{bar,club,cruising,sauna,nightclub,community_center}'),
  ('rubber',          'venues', '\m(rubber|latex)\M', 'review', null, '{bar,club,cruising,sauna,nightclub,community_center}'),
  ('sneakers',        'venues', '\m(sneakers?|sneaks)\M', 'review', null, null),
  ('dress-code',      'venues', '\mdress ?codes?\M', 'review', null, null),
  ('puppy-play',      'venues', '\m(puppy play|pup play|pups)\M', 'review', null, null),
  ('underwear-party', 'venues', '\m(underwear|jock ?straps?|jocks|undies) (party|parties|night|nights)\M', 'review', null, null),
  ('private-cabins',  'venues', '\m(private )?(cabins?|cubicles?)\M', 'review', '{sauna,cruising,club,bar}', null);

insert into public.kink_filter_patterns (tag_id, target, pattern, mode, venue_categories, auto_venue_categories)
select k.tag_id, p.target, p.pattern, p.mode, p.cats, p.auto_cats
  from _kink_pat p
  join public.unified_tags t on t.slug = p.slug
  join public.kink_filter_terms k on k.tag_id = t.id
on conflict (tag_id, target) do update
  set pattern = excluded.pattern, mode = excluded.mode, venue_categories = excluded.venue_categories,
      auto_venue_categories = excluded.auto_venue_categories;

-- Measured in the dry run: these three were registered for events only, so
-- their venue matches ("Wed naked party", "Dress code (levis, leather)") were
-- dropped. A venue that runs a naked night is exactly what the filter is for.
update public.kink_filter_terms k set applies_to = '{events,venues}'
  from public.unified_tags t
 where t.id = k.tag_id and t.slug in ('naked-party','underwear-party','dress-code')
   and k.applies_to <> '{events,venues}';

-- The venue quality inbox renders any entity_review_queue row for a venue;
-- approval needs a registry row or it RAISEs "unsupported review field".
-- batchable = false: these are kink claims about a business, decided one at a time.
insert into public.review_field_registry
  (entity_type, field, label, target_table, target_column, value_key, apply_mode, apply_args, batchable, risk_gate, active)
values ('venue', 'tags', 'Kink & feature tags', 'venues', 'tags', 'value', 'text_array_union', '{}'::jsonb, false, null, true)
on conflict (entity_type, field) do nothing;

-- ---------------------------------------------------------------------------
-- B. The fill.
-- ---------------------------------------------------------------------------
create or replace function public.run_kink_tag_fill(p_batch int default 300)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_ev int := 0;
  v_ve int := 0;
  v_rev int := 0;
begin
  perform set_config('app.actor', 'automation:kink_tag_fill', true);

  -- Events: upcoming and the last 7 days only. Past events are not what a
  -- filter or a tag page shows first, and every event UPDATE fans out through
  -- the search trigger.
  create temporary table if not exists _kf_ev (id uuid, tag_id uuid, slug text) on commit drop;
  truncate _kf_ev;
  insert into _kf_ev
  select e.id, p.tag_id, t.slug
    from public.events e
    join public.kink_filter_patterns p on p.target = 'events' and p.mode = 'auto'
    join public.kink_filter_terms k on k.tag_id = p.tag_id and k.enabled and 'events' = any(k.applies_to)
    join public.unified_tags t on t.id = p.tag_id
   where e.duplicate_of_id is null
     and e.status = 'active'
     and coalesce(e.end_date, e.start_date) >= now() - interval '7 days'
     and (coalesce(e.title, '') || ' ' || coalesce(e.description, '')) ~* p.pattern
     and not (t.slug = any(coalesce(e.tags, '{}')))
     and not exists (select 1 from public.kink_tag_fill_log l
                      where l.entity_type = 'events' and l.entity_id = e.id and l.tag_id = p.tag_id);

  with batch as (
    select id, array_agg(distinct slug) as slugs from _kf_ev
     where id in (select distinct id from _kf_ev limit p_batch)
     group by id
  )
  update public.events e set tags = coalesce(e.tags, '{}') || b.slugs
    from batch b where e.id = b.id;
  get diagnostics v_ev = row_count;

  insert into public.kink_tag_fill_log (entity_type, entity_id, tag_id, mode)
  select 'events', x.id, x.tag_id, 'auto'
    from _kf_ev x
    join public.events e on e.id = x.id and x.slug = any(e.tags)
  on conflict do nothing;

  -- Venues, auto terms.
  create temporary table if not exists _kf_ve (id uuid, tag_id uuid, slug text, mode text, ctx text) on commit drop;
  truncate _kf_ve;
  insert into _kf_ve
  select v.id, p.tag_id, t.slug,
         case when p.mode = 'review' and v.category = any(coalesce(p.auto_venue_categories, '{}'))
              then 'auto' else p.mode end,
         (regexp_match(coalesce(v.name, '') || ' | ' || coalesce(v.description, ''),
                       '(.{0,60}' || p.pattern || '.{0,60})', 'i'))[1]
    from public.venues v
    join public.kink_filter_patterns p on p.target = 'venues'
    join public.kink_filter_terms k on k.tag_id = p.tag_id and k.enabled and 'venues' = any(k.applies_to)
    join public.unified_tags t on t.id = p.tag_id
   where v.duplicate_of_id is null
     and v.closed_at is null
     and (p.venue_categories is null or v.category = any(p.venue_categories))
     and (coalesce(v.name, '') || ' ' || coalesce(v.description, '')) ~* p.pattern
     and not (t.slug = any(coalesce(v.tags, '{}')))
     and not exists (select 1 from public.kink_tag_fill_log l
                      where l.entity_type = 'venues' and l.entity_id = v.id and l.tag_id = p.tag_id);

  with batch as (
    select id, array_agg(distinct slug) as slugs from _kf_ve
     where mode = 'auto'
       and id in (select distinct id from _kf_ve where mode = 'auto' limit p_batch)
     group by id
  )
  update public.venues v set tags = coalesce(v.tags, '{}') || b.slugs
    from batch b where v.id = b.id;
  get diagnostics v_ve = row_count;

  insert into public.kink_tag_fill_log (entity_type, entity_id, tag_id, mode)
  select 'venues', x.id, x.tag_id, 'auto'
    from _kf_ve x
    join public.venues v on v.id = x.id and x.slug = any(v.tags)
   where x.mode = 'auto'
  on conflict do nothing;

  -- Venues, review terms: one proposal per venue (uq_erq_open is one open row
  -- per entity+field), skipped while a `tags` proposal is already open.
  with prop as (
    select x.id,
           jsonb_agg(distinct x.slug) as slugs,
           jsonb_agg(jsonb_build_object('quote', x.ctx, 'tag', x.slug)) as cites
      from _kf_ve x
     where x.mode = 'review'
       and not exists (select 1 from public.entity_review_queue q
                        where q.entity_type = 'venue' and q.entity_id = x.id
                          and q.field = 'tags' and q.status = 'open')
     group by x.id
     limit p_batch
  ),
  ins as (
    insert into public.entity_review_queue (entity_type, entity_id, field, proposed_value, citations, confidence, model)
    select 'venue', p.id, 'tags', jsonb_build_object('value', p.slugs), p.cites, 0.7, 'kink-tag-fill'
      from prop p
    returning entity_id
  )
  select count(*) into v_rev from ins;

  insert into public.kink_tag_fill_log (entity_type, entity_id, tag_id, mode)
  select 'venues', x.id, x.tag_id, 'review'
    from _kf_ve x
   where x.mode = 'review'
     and exists (select 1 from public.entity_review_queue q
                  where q.entity_type = 'venue' and q.entity_id = x.id and q.field = 'tags'
                    and q.model = 'kink-tag-fill' and q.proposed_value->'value' ? x.slug)
  on conflict do nothing;

  return jsonb_build_object('events_tagged', v_ev, 'venues_tagged', v_ve, 'venue_proposals', v_rev);
end
$fn$;

revoke all on function public.run_kink_tag_fill(int) from public, anon, authenticated;
grant execute on function public.run_kink_tag_fill(int) to service_role;

-- ---------------------------------------------------------------------------
-- C. Sentinel (service_role only). Coverage first: zero disagreements over an
--    empty registry is not a clean corpus.
-- ---------------------------------------------------------------------------
create or replace function public.kink_filter_signals()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  with reg as (
    select k.tag_id, t.slug, t.status, t.merged_into_id
      from public.kink_filter_terms k
      left join public.unified_tags t on t.id = k.tag_id
     where k.enabled
  )
  select jsonb_build_object(
    'probe_ok', true,
    'registry_rows', (select count(*) from reg),
    'broken_registry_rows', (select count(*) from reg where status is distinct from 'active' or merged_into_id is not null),
    'patterns', (select count(*) from public.kink_filter_patterns),
    'event_array_without_assignment', (
      select count(*) from reg r join public.events e on r.slug = any(e.tags)
       where not exists (select 1 from public.unified_tag_assignments a
                          where a.tag_id = r.tag_id and a.entity_id = e.id and a.entity_type = 'event')),
    'venue_array_without_assignment', (
      select count(*) from reg r join public.venues v on r.slug = any(v.tags)
       where not exists (select 1 from public.unified_tag_assignments a
                          where a.tag_id = r.tag_id and a.entity_id = v.id and a.entity_type = 'venues')),
    'amenity_unmirrored', (
      select count(*) from public.venues v
        join public.kink_filter_terms k on k.enabled and k.amenity_slug = any(v.amenities)
        join public.unified_tags t on t.id = k.tag_id
       where not (t.slug = any(coalesce(v.tags, '{}')))),
    'open_review_rows', (select count(*) from public.entity_review_queue q
                          where q.entity_type = 'venue' and q.field = 'tags' and q.status = 'open'
                            and q.model = 'kink-tag-fill'),
    'fill_log_rows', (select count(*) from public.kink_tag_fill_log)
  );
$fn$;

revoke all on function public.kink_filter_signals() from public, anon, authenticated;
grant execute on function public.kink_filter_signals() to service_role;

-- ---------------------------------------------------------------------------
-- D. Schedule (registry row + cron in one file).
-- ---------------------------------------------------------------------------
insert into public.admin_automations
  (name, slug, action, enabled, trigger, schedule, conditions, managed_by, description, auto_pause_threshold)
values (
  'Kink & feature tag fill', 'kink_tag_fill',
  jsonb_build_object('type', 'cron', 'command', 'SELECT public.run_kink_tag_fill(300)', 'jobname', 'kink_tag_fill'),
  true, '{"type":"schedule"}'::jsonb, '25 4 * * *', '[]'::jsonb, 'system',
  'Nightly: tags events and venues with kink & feature filter terms matched in their text (kink_filter_patterns). Auto terms were measured at 100% on hand-read samples; ambiguous terms open venue review rows. kink_tag_fill_log keeps it from re-adding a removed tag or re-proposing a rejected one.',
  3
)
on conflict (slug) do nothing;

select cron.schedule('kink_tag_fill', '25 4 * * *', 'SELECT public.run_kink_tag_fill(300)');

-- ---------------------------------------------------------------------------
-- E. Backfill.
-- ---------------------------------------------------------------------------
do $backfill$
declare
  r jsonb;
  i int := 0;
begin
  loop
    r := public.run_kink_tag_fill(300);
    i := i + 1;
    exit when (r->>'events_tagged')::int = 0 and (r->>'venues_tagged')::int = 0
          and (r->>'venue_proposals')::int = 0;
    if i > 30 then
      raise exception 'kink tag fill did not converge after % passes: %', i, r;
    end if;
  end loop;
end
$backfill$;

-- ---------------------------------------------------------------------------
-- F. Postconditions.
-- ---------------------------------------------------------------------------
do $verify$
declare
  s jsonb := public.kink_filter_signals();
begin
  if (s->>'registry_rows')::int < 15 then
    raise exception 'P1 failed: registry has % rows', s->>'registry_rows';
  end if;
  if (s->>'patterns')::int < 25 then
    raise exception 'P2 failed: only % patterns seeded', s->>'patterns';
  end if;
  if (s->>'broken_registry_rows')::int <> 0 then
    raise exception 'P3 failed: % broken registry rows', s->>'broken_registry_rows';
  end if;
  if (s->>'event_array_without_assignment')::int <> 0 or (s->>'venue_array_without_assignment')::int <> 0 then
    raise exception 'P4 failed: array/assignment disagreement %', s;
  end if;
  if (s->>'amenity_unmirrored')::int <> 0 then
    raise exception 'P5 failed: % venues with a mapped amenity but no tag', s->>'amenity_unmirrored';
  end if;
  -- The fill must have done something: a silently empty sweep reads exactly
  -- like a converged one.
  if (s->>'fill_log_rows')::int = 0 then
    raise exception 'P6 failed: the fill applied and proposed nothing';
  end if;
  -- The measured place-name trap must not be reachable.
  if exists (select 1 from public.venues v where v.name ~* 'pissouri|pissarelles|pissevaches'
               and 'piss-play' = any(coalesce(v.tags, '{}'))) then
    raise exception 'P7 failed: a place name was tagged piss-play';
  end if;
  if exists (select 1 from public.events e where e.title ~* 'spank bank'
               and 'spanking' = any(coalesce(e.tags, '{}'))
               and exists (select 1 from public.kink_tag_fill_log l
                            where l.entity_type = 'events' and l.entity_id = e.id)) then
    raise exception 'P8 failed: the fill tagged "Spank Bank" as spanking';
  end if;
end
$verify$;
