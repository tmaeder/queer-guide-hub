-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261001204548 with no repo file — the signature of
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
-- Staging lifecycle triggers may normalize a quarantined terminal row to
-- committed/auto. The durable review_queue entry and source metadata flag are
-- the correct measures of unresolved editorial work.
create or replace function public.foursquare_data_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'api_budget', coalesce((
      select to_jsonb(b) || jsonb_build_object(
        'remaining', greatest(b.call_limit - b.safety_margin - b.calls_used, 0)
      )
        from public.foursquare_api_budget b
       where b.month_start = date_trunc('month', current_date)::date
    ), jsonb_build_object(
      'month_start', date_trunc('month', current_date)::date,
      'call_limit', 500,
      'safety_margin', 50,
      'calls_used', 0,
      'remaining', 450,
      'by_purpose', '{}'::jsonb
    )),
    'sync_streams', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.stream_key)
        from public.foursquare_sync_state s
    ), '[]'::jsonb),
    'categories', (select count(*) from public.foursquare_categories),
    'redirects', (select count(*) from public.foursquare_place_redirects),
    'linked_venues', (
      select count(*) from public.venues v
       where v.foursquare_id is not null
          or coalesce(v.platform_ids ->> 'foursquare', '') <> ''
    ),
    'source_records', (
      select count(*) from public.venue_sources vs
       where vs.source_slug in ('foursquare', 'foursquare_os')
    ),
    'editorial_review_pending', (
      select count(distinct s.id)
        from public.ingestion_staging s
        join public.review_queue q
          on q.entity_type = 'ingestion_staging'
         and q.entity_id = s.id
         and q.status = 'pending'
       where s.source_name in ('foursquare', 'foursquare_os')
         and s.normalized_data #>> '{metadata,requires_editorial_review}' = 'true'
    ),
    'unsafe_published_discoveries', (
      select count(*)
        from public.ingestion_staging s
        join public.venues v on v.id = s.target_record_id
       where s.source_name in ('foursquare', 'foursquare_os')
         and s.normalized_data #>> '{metadata,requires_editorial_review}' = 'true'
         and v.review_status = 'approved'
    ),
    'generated_at', now()
  );
$function$;

revoke all on function public.foursquare_data_health() from public, anon, authenticated;

grant execute on function public.foursquare_data_health() to service_role;
