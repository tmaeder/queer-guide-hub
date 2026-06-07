-- H-3 (audit 2026-06-05) — closed venues must drop out of public/SEO surfaces.
-- The Venue Truth Engine closure consensus writes venues.closed_at (and the
-- url_status='broken' voter now feeds it — see _shared/venue-consensus.ts), but
-- nothing forced a closed venue out of the sitemap. A closed "safe space" still
-- indexed is a direct harm on a safety platform.
--
-- Invariant: closed_at IS NOT NULL ⇒ seo_indexable = false. (Search already
-- buries closed venues via search_hybrid's -1.0 score penalty, and the detail
-- page shows a "permanently closed" state; this closes the sitemap/robots hole.)

begin;

create or replace function public.venues_closed_not_indexable()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.closed_at is not null then
    new.seo_indexable := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_venues_closed_not_indexable on public.venues;
create trigger trg_venues_closed_not_indexable
  before insert or update of closed_at, seo_indexable on public.venues
  for each row execute function public.venues_closed_not_indexable();

-- One-time backfill (0 rows today; safe/idempotent).
update public.venues
   set seo_indexable = false
 where closed_at is not null and seo_indexable is true;

commit;

-- Extend the release gates with venue_closed_seo (high): a closed venue that is
-- still sitemap-indexable. Full redefinition (CREATE OR REPLACE) of the function
-- from 20260605130000 plus the new branch.
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
  -- venue_closed_seo (high) — a closed venue still indexable in sitemaps
  select 'venue_closed_seo', 'high',
    count(*)::bigint, '{}'::jsonb
  from public.venues v
  where v.closed_at is not null and v.seo_indexable is true;
$$;
