-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261127080552 with no repo file — the signature of
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
-- Bound the nightly comparison to actual shared calendar days and places.
create or replace function api_private.event_identity_pairs()
returns table(a_id uuid,b_id uuid,a_title text,b_title text,is_auto boolean,conf numeric,
  reason text,dm double precision,aq numeric,af boolean,ac timestamptz,bq numeric,bf boolean,bc timestamptz)
language sql stable set search_path = public, extensions, pg_temp as $$
  with live as materialized (
    select e.id,e.title,e.start_date,e.end_date,e.city_id,e.quality_score,e.is_featured,e.created_at,
      public.normalize_name(e.city) city_key,public.normalize_name(e.country) country_key,
      api_private.event_name_tokens(e.title,e.city,coalesce(e.end_date-e.start_date between interval '20 hours' and interval '31 days',false)) tokens
    from public.events e where e.duplicate_of_id is null and coalesce(e.status,'')<>'archived'
      and e.parent_event_id is null
  ), blocks as materialized (
    -- Hashable place+calendar-day blocks avoid a global interval/OR self join.
    select l.id,place.key,((l.start_date at time zone 'UTC')::date+n) occurrence_day
    from live l
    cross join lateral (values
      ('id:'||l.city_id::text),
      (case when l.city_key<>'' and l.country_key<>'' then 'text:'||l.country_key||':'||l.city_key end)
    ) place(key)
    cross join lateral generate_series(0,case
      when l.end_date-l.start_date between interval '20 hours' and interval '31 days'
      then (l.end_date at time zone 'UTC')::date-(l.start_date at time zone 'UTC')::date
      else 0 end) n
    where place.key is not null
  ), pair_ids as materialized (
    select distinct a.id aid,b.id bid from blocks a join blocks b
      on a.key=b.key and a.occurrence_day=b.occurrence_day and a.id<b.id
  ), pairs as materialized (
    select a.*, b.id bid,b.title btitle,b.quality_score bquality,b.is_featured bfeatured,b.created_at bcreated,
      b.start_date bstart,b.end_date bend,
      api_private.event_identity_reason(api_private.event_identity_document(a.id),api_private.event_identity_document(b.id)) identity_reason
    from pair_ids p join live a on a.id=p.aid join live b on b.id=p.bid
    where true
      and b.start_date between a.start_date-interval '31 days' and coalesce(a.end_date,a.start_date)
      and coalesce(b.end_date,b.start_date)>=a.start_date
      and (a.start_date=b.start_date or (a.end_date-a.start_date between interval '20 hours' and interval '31 days'
        and b.end_date-b.start_date between interval '20 hours' and interval '31 days'))
      and a.tokens && b.tokens
  ) select id,bid,title,btitle,identity_reason in ('festival_identity_range','event_identity_instant'),
    case when identity_reason in ('festival_identity_range','event_identity_instant') then 0.96 else 0.84 end::numeric,
    identity_reason,null::double precision,
    -- A full umbrella wins over a shorter overview, followed by existing quality ranking.
    coalesce(quality_score,0) + least(31,greatest(0,extract(epoch from end_date-start_date)/86400))*1000,
    is_featured,created_at,
    coalesce(bquality,0) + least(31,greatest(0,extract(epoch from bend-bstart)/86400))*1000,
    bfeatured,bcreated
  from pairs where identity_reason is not null
$$;

;
