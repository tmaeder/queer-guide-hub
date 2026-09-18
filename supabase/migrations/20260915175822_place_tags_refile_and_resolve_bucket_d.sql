-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260915175822 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
do $$
declare
  v_district_cat uuid := '2b590db4-546f-4478-8537-ac544382da2b';  -- tag_categories 'travel-destinations'
  v_refiled int; v_deindexed int; v_resolved int; v_blocked int;
  v_bad text[]; v_leak int; v_drift int;
begin
  -- log_unified_tag_change() RAISEs when an undeclared `system:%` actor modifies a
  -- human_reviewed row.
  perform set_config('app.actor', 'migration:place_tags_refile_and_resolve_bucket_d', true);

  create temporary table _districts on commit drop as
  select t.id, t.slug, t.entity_kind, t.category_id, t.seo_indexable
    from public.unified_tags t
   where t.status = 'active'
     and t.slug in ('kreuzberg','schoneberg','prenzlauer','mitte','neukolln',
                    'friedrichshain','tempelhof','steglitz');

  raise notice 'district cohort present: % of 8', (select count(*) from _districts);

  update public.unified_tags t
     set entity_kind = 'place',
         category_id = v_district_cat,
         updated_at  = now()
    from _districts d
   where t.id = d.id
     and (t.entity_kind is distinct from 'place' or t.category_id is distinct from v_district_cat);
  get diagnostics v_refiled = row_count;
  raise notice 'districts refiled to entity_kind=place + Destinations: %', v_refiled;

  create temporary table _bucket_d on commit drop as
  with tg as (
    select t.id, t.slug, t.name
      from public.unified_tags t
     where t.status = 'active'
       and t.slug in ('berlin','san-francisco','brisbane','brighton','birmingham','san-jose',
                      'wellington','santa-cruz','san-juan','georgetown','durango','toledo','zurich')
  ),
  cand as (
    select tg.id tag_id, tg.slug tag_slug, c.slug city_slug,
           (select count(*) from public.venues v where v.city_id = c.id)
         + (select count(*) from public.events e where e.city_id = c.id) as mass
      from tg
      join public.cities c
        on extensions.unaccent('extensions.unaccent'::regdictionary, lower(c.name))
         = extensions.unaccent('extensions.unaccent'::regdictionary, lower(replace(tg.name, '-', ' ')))
       and c.duplicate_of_id is null
       and c.slug not like 'tmp-%'
       and coalesce(c.shell_status, 'real') not in ('ghost', 'merged')
  ),
  ranked as (
    select *,
           row_number() over (partition by tag_slug order by mass desc) rk,
           lead(mass)   over (partition by tag_slug order by mass desc) runner_up
      from cand
  )
  select tag_id, tag_slug, city_slug, mass, coalesce(runner_up, 0) as runner_up,
         (mass >= 10 and mass >= 5 * greatest(coalesce(runner_up, 0), 1)) as resolved
    from ranked
   where rk = 1;

  select count(*) filter (where resolved), count(*) filter (where not resolved)
    into v_resolved, v_blocked from _bucket_d;
  raise notice 'bucket D: % resolved by content mass, % blocked', v_resolved, v_blocked;

  select array_agg(tag_slug) into v_bad from _bucket_d where tag_slug = 'cuauhtemoc';
  if v_bad is not null then
    raise exception 'cuauhtemoc selected: it belongs to the wrong-sense flow, not place-duplicate';
  end if;

  select array_agg(x) into v_bad from (
    select tag_slug x from _bucket_d
    union all select slug from _districts
  ) s where x in ('california','usa','pennsylvania','wales','manhattan','queensland','rotorua',
                  'santurce','travel','europe','coastal','rural','island','river','retail','town',
                  'tour','tourism','recreation','transportation','outdoor-recreation',
                  'walking-tour','beach-resort','latin-america','middle-east');
  if v_bad is not null then
    raise exception 'bucket E/F tags selected, these are not duplicates: %', v_bad;
  end if;

  update public.unified_tags t
     set seo_indexable      = false,
         seo_deindex_reason = 'place-duplicate',
         updated_at         = now()
   where t.id in (select id from _districts union all select tag_id from _bucket_d)
     and (t.seo_indexable is true or t.seo_deindex_reason = 'thin')
     and t.seo_deindex_reason is distinct from 'place-duplicate';
  get diagnostics v_deindexed = row_count;
  raise notice 'deindexed as place-duplicate: %', v_deindexed;

  select count(*) into v_leak
    from public.unified_tags t
   where t.id in (select id from _districts union all select tag_id from _bucket_d)
     and t.seo_indexable is true;
  if v_leak > 0 then
    raise exception 'postcondition failed: % place tags still indexable', v_leak;
  end if;

  select count(*) into v_drift
    from public.unified_tags t
    join _districts d on d.id = t.id
   where t.category_id is distinct from v_district_cat
      or t.category is distinct from (select name from public.tag_categories where id = v_district_cat)
      or not exists (
           select 1 from public.tag_category_assignments a
            where a.tag_id = t.id and a.is_primary and a.category_id = v_district_cat);
  if v_drift > 0 then
    raise exception 'postcondition failed: % districts disagree across category text/id/junction', v_drift;
  end if;

  raise notice 'bucket E/F rows still held at reason=thin: %',
    (select count(*) from public.unified_tags
      where status = 'active' and entity_kind = 'place' and seo_deindex_reason = 'thin');
end $$;;
