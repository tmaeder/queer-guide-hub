-- Production health repairs measured on 2026-09-20.
--
-- This migration fixes four independent, evidenced faults:
--   1. two empty-backlog probes were full-scanning large tables and timing out;
--   2. the podcast sentinel lacked the two access paths its joins/windows need;
--   3. City of Hamilton, Bermuda carried Hamilton, Ontario facts;
--   4. five useful jobs recovered after auto-pause but the nightly reconciler
--      correctly unscheduled them because the registry still said disabled.

-- Empty news-refetch backlog must be the cheapest case, not the slowest case.
create index if not exists news_articles_refetch_worklist_idx
  on public.news_articles (id)
  where duplicate_of_id is null
    and url ~* '^https?://'
    and length(coalesce(content, '')) < 600
    and (enrichment_status->'refetch') is null;

-- Same invariant for marketplace mirroring. The edge function asks for an
-- unordered LIMIT from exactly this predicate.
create index if not exists marketplace_listings_image_mirror_worklist_idx
  on public.marketplace_listings (id)
  where images is not null
    and (image_hashes = '[]'::jsonb or image_hashes is null);

-- news_podcast_signals joins staging back to committed articles by target id,
-- then separately reads the recent podcast slice. Neither path existed.
create index if not exists ingestion_staging_news_target_record_idx
  on public.ingestion_staging (target_record_id)
  where target_table = 'news_articles' and target_record_id is not null;

create index if not exists ingestion_staging_podcast_created_idx
  on public.ingestion_staging (created_at desc)
  include (disposition)
  where target_table = 'news_articles'
    and normalized_data->'metadata'->>'media_type' = 'podcast';

-- One newly-authored short glossary entry exceeded the documented American-
-- spelling ceiling. Guard on the exact source text so an editorial change is
-- never overwritten by a later replay.
-- The row is human-reviewed, so declare the migration actor explicitly; the
-- write-protection trigger rejects the implicit system:trigger identity.
select set_config('app.actor', 'migration:platform-health-repairs', true);

update public.unified_tags
set description = replace(description, 'oestrogen', 'estrogen'),
    updated_at = now()
where id = 'fbc23fcf-7109-48fe-8051-a83b8d3c5232'::uuid
  and slug = 'sperm'
  and description = 'The reproductive cell carried in semen. Production is suppressed by oestrogen and anti-androgens, which is why fertility preservation is discussed before starting gender-affirming hormones.';

-- This row's identity and Bermuda coordinates were correct, but nearly every
-- Wikidata/Wikipedia fact belonged to Hamilton, Ontario (Q133116). Reset only
-- the contaminated fields and install the measured Q30985 scalar facts.
update public.cities
set population = 3686,
    area_km2 = 0.7,
    wikidata_qid = 'Q30985',
    wikipedia_title = 'Hamilton, Bermuda',
    description = null,
    elevation_m = null,
    founded_year = null,
    official_website = null,
    mayor = null,
    postal_codes = null,
    area_codes = null,
    sister_cities = null,
    field_provenance = (
      field_provenance - array[
        'description','elevation_m','founded_year','official_website','mayor',
        'postal_codes','area_codes','sister_cities','population','area_km2'
      ]
    ) || jsonb_build_object(
      'population', jsonb_build_object('value', 3686, 'source', 'wikidata:Q30985', 'verified_at', now()),
      'area_km2', jsonb_build_object('value', 0.7, 'source', 'wikidata:Q30985', 'verified_at', now()),
      'wikidata_qid', jsonb_build_object('value', 'Q30985', 'source', 'wikidata', 'verified_at', now())
    ),
    enrichment_status = (enrichment_status - array[
      'qid_conflict','wikidata_link','description','elevation_m','founded_year',
      'official_website','mayor','postal_codes','area_codes','sister_cities'
    ]) || jsonb_build_object(
      'wikidata_link', jsonb_build_object('state', 'resolved', 'source', 'manual_identity_repair', 'qid', 'Q30985', 'at', now())
    ),
    needs_attention = true,
    last_verified_at = now(),
    updated_at = now()
where id = '32e64568-4c5a-43e3-bb50-2ee7bcd27f7e'::uuid
  and name = 'City of Hamilton'
  and country_id = '9dc77c0b-da5f-46f6-862d-5334b98ea011'::uuid
  and population = 569353
  and area_km2 = 1138.11
  and coalesce(wikipedia_title, '') = 'Hamilton, Ontario';

-- These jobs all ended on successful runs after the current query fixes were
-- applied, but stayed registry-disabled and were then unscheduled. A threshold
-- of six tolerates a 30-minute shared DB-pressure window on */5 jobs while
-- preserving the kill switch for sustained failures.
update public.admin_automations
set enabled = true,
    consecutive_failures = 0,
    auto_pause_threshold = greatest(auto_pause_threshold, 6),
    updated_at = now()
where slug = any(array[
  'marketplace_image_upscale',
  'news_fulltext_backfill',
  'marketplace_image_mirror',
  'marketplace_description_enhance',
  'search_embeddings_reconcile'
])
  and enabled = false
  and consecutive_failures = 0
  and last_run_status = 'success';

-- Registry commands are canonical and all five currently carry action.command,
-- including the RPC reconciler. Recreate only this measured set rather than
-- turning a scoped repair into a fleet-wide reconciliation.
do $schedule$
declare
  r record;
  v_jobname text;
  v_command text;
begin
  for r in
    select slug, schedule, action
    from public.admin_automations
    where slug = any(array[
      'marketplace_image_upscale','news_fulltext_backfill',
      'marketplace_image_mirror','marketplace_description_enhance',
      'search_embeddings_reconcile'
    ]) and enabled
  loop
    v_jobname := coalesce(r.action->>'jobname', r.slug);
    v_command := public.admin_automation_effective_command(r.slug, r.action->>'command');
    if r.schedule is null or v_command is null or btrim(v_command) = '' then
      raise exception 'cannot schedule recovered automation %', r.slug;
    end if;
    if exists (select 1 from cron.job where jobname = v_jobname) then
      perform cron.unschedule(v_jobname);
    end if;
    perform cron.schedule(v_jobname, r.schedule, v_command);
  end loop;
end
$schedule$;

-- News ingestion can merge a survivor that already has duplicate children,
-- briefly producing chained pointers. Collapse the measured live breach before
-- release gates run again, and fail closed if any dangling/chained row remains.
do $news_duplicates$
declare
  v_repaired integer;
  v_remaining bigint;
begin
  v_repaired := public.collapse_entity_dup_chains('news');

  select count(*) into v_remaining
  from public.news_articles n
  left join public.news_articles parent on parent.id = n.duplicate_of_id
  where n.duplicate_of_id is not null
    and (parent.id is null or parent.duplicate_of_id is not null);

  if v_remaining <> 0 then
    raise exception 'news duplicate integrity repair left % invalid pointer(s)', v_remaining;
  end if;

  raise notice 'collapsed % chained news duplicate pointer(s)', v_repaired;
end
$news_duplicates$;

-- The new parser is deployed immediately after migrations. Forgive attempts
-- made before this release, plus a bounded deployment window; attempts after
-- that boundary count normally and cannot retry forever.
update public.news_quality_settings
set attempt_epoch = now() + interval '20 minutes',
    updated_at = now(),
    notes = coalesce(nullif(notes, '') || E'\n', '') ||
      '2026-09-20: attempt epoch advanced after preserving structured verdicts when only the model cleanedBody JSON is malformed. The 20-minute offset covers the migration-before-function deployment window.',
    enabled = true
where id = 1;

do $verify$
declare
  v_city record;
  v_missing text[];
begin
  select population, area_km2, wikidata_qid, wikipedia_title, description,
         official_website, mayor
    into v_city
  from public.cities
  where id = '32e64568-4c5a-43e3-bb50-2ee7bcd27f7e'::uuid;

  if v_city.population <> 3686 or v_city.area_km2 <> 0.7
     or v_city.wikidata_qid <> 'Q30985'
     or v_city.wikipedia_title <> 'Hamilton, Bermuda'
     or v_city.description is not null
     or v_city.official_website is not null
     or v_city.mayor is not null then
    raise exception 'City of Hamilton identity repair did not apply: %', row_to_json(v_city);
  end if;

  select array_agg(a.slug order by a.slug) into v_missing
  from public.admin_automations a
  where a.slug = any(array[
    'marketplace_image_upscale','news_fulltext_backfill',
    'marketplace_image_mirror','marketplace_description_enhance',
    'search_embeddings_reconcile'
  ])
    and (not a.enabled or a.consecutive_failures <> 0 or a.auto_pause_threshold < 6
      or not exists (select 1 from cron.job j where j.jobname = coalesce(a.action->>'jobname', a.slug)));
  if v_missing is not null then
    raise exception 'recovered automations are not enabled and scheduled: %', v_missing;
  end if;

  if not exists (
    select 1 from public.unified_tags
    where id = 'fbc23fcf-7109-48fe-8051-a83b8d3c5232'::uuid
      and description like '%estrogen%'
      and description not like '%oestrogen%'
  ) then
    raise exception 'sperm glossary spelling repair did not apply';
  end if;
end
$verify$;
