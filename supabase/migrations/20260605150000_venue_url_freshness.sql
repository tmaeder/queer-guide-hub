-- H-4 (audit 2026-06-05) — drive venue URL-check coverage and demote broken links.
-- Only 4% of venues had ever been URL-checked because venue-url-checker ran weekly
-- at batch 200 (~110 weeks to cover the backlog). Of the 5,572 live venues that
-- actually have a website, ~4,690 were unchecked.
--
--   1. Reschedule venue-url-checker daily (was weekly) — clears the website
--      backlog in weeks, not years, then keeps a 30-day recheck cadence.
--   2. Demote the existing broken-URL venues to needs_attention (the checker now
--      does this on every future broken result too).
--   3. New high gate venue_url_freshness reports live venues with a website not
--      checked within 90 days.

-- 1. Daily cadence. cron.schedule upserts by job name.
select cron.unschedule('venue-url-checker') where exists (
  select 1 from cron.job where jobname = 'venue-url-checker'
);
select cron.schedule(
  'venue-url-checker',
  '15 3 * * *',
  $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/venue-url-checker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
      ),
      body := '{"batch_size":200,"stale_days":30}'::jsonb
    )
  $$
);

-- 2. Demote existing broken-URL venues for human triage.
update public.venues
   set needs_attention = true
 where url_status = 'broken' and coalesce(needs_attention, false) = false;

-- 3. venue_url_freshness gate (final form of release_gate_checks for this PR).
create or replace function public.release_gate_checks()
returns table (gate text, severity text, failures bigint, detail jsonb)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select 'hotline_unverified'::text, 'critical'::text,
    count(*)::bigint,
    jsonb_build_object('ids', coalesce(jsonb_agg(h->>'id'), '[]'::jsonb))
  from public.cms_pages cp
  cross join lateral jsonb_array_elements(cp.body_json->'hotlines') h
  where cp.slug = 'help'
    and coalesce((h->>'needs_review')::boolean, false) = false
    and (
      nullif(h->>'verified_at', '') is null
      or (h->>'verified_at')::date < (now() - interval '90 days')::date
    )

  union all
  select 'person_outing_guard', 'critical',
    count(*)::bigint, '{}'::jsonb
  from public.personalities p
  where p.visibility = 'public'
    and p.is_living
    and p.lgbti_connection is not null
    and p.lgbti_connection not in
      ('community_member', 'ally', 'activist', 'representation', 'none_known', 'unclear')

  union all
  select 'crim_consistency', 'critical',
    count(*)::bigint,
    jsonb_build_object('country_ids', coalesce(jsonb_agg(c.id), '[]'::jsonb))
  from public.countries c
  where (c.lgbti_criminalization->>'legal') = 'false'
    and c.equality_score >= 50

  union all
  select 'dup_integrity', 'critical',
    sum(cnt)::bigint, jsonb_object_agg(tbl, cnt)
  from (
    select 'venues' tbl, count(*) cnt from public.venues t
      left join public.venues d on d.id = t.duplicate_of_id
      where t.duplicate_of_id is not null and (d.id is null or d.duplicate_of_id is not null)
    union all
    select 'events', count(*) from public.events t
      left join public.events d on d.id = t.duplicate_of_id
      where t.duplicate_of_id is not null and (d.id is null or d.duplicate_of_id is not null)
    union all
    select 'personalities', count(*) from public.personalities t
      left join public.personalities d on d.id = t.duplicate_of_id
      where t.duplicate_of_id is not null and (d.id is null or d.duplicate_of_id is not null)
    union all
    select 'news_articles', count(*) from public.news_articles t
      left join public.news_articles d on d.id = t.duplicate_of_id
      where t.duplicate_of_id is not null and (d.id is null or d.duplicate_of_id is not null)
  ) dups

  union all
  select 'hotline_reachable', 'high',
    count(*)::bigint,
    jsonb_build_object('ids', coalesce(jsonb_agg(h->>'id'), '[]'::jsonb))
  from public.cms_pages cp
  cross join lateral jsonb_array_elements(cp.body_json->'hotlines') h
  where cp.slug = 'help'
    and coalesce(h->>'kind', 'hotline') <> 'directory'
    and nullif(h->>'phone', '') is null
    and coalesce(jsonb_array_length(h->'channels'), 0) = 0

  union all
  select 'hotline_url_live', 'high',
    count(*)::bigint,
    jsonb_build_object('ids', coalesce(jsonb_agg(h->>'id'), '[]'::jsonb))
  from public.cms_pages cp
  cross join lateral jsonb_array_elements(cp.body_json->'hotlines') h
  where cp.slug = 'help'
    and (h->>'link_status') = 'broken'

  union all
  select 'venue_closed_seo', 'high',
    count(*)::bigint, '{}'::jsonb
  from public.venues v
  where v.closed_at is not null and v.seo_indexable is true

  union all
  -- venue_url_freshness (high) — live venues with a website unchecked in 90 days
  select 'venue_url_freshness', 'high',
    count(*)::bigint,
    jsonb_build_object(
      'with_website',
      (select count(*) from public.venues
        where duplicate_of_id is null and nullif(website, '') is not null))
  from public.venues v
  where v.duplicate_of_id is null
    and nullif(v.website, '') is not null
    and (v.url_checked_at is null or v.url_checked_at < now() - interval '90 days');
$$;
