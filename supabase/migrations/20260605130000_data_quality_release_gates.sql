-- Trust-&-safety remediation: continuous monitoring suite (audit §4 / §6).
-- A single SQL entry point for the data-quality release gates so the same checks
-- run from CI, a nightly cron, and the admin UI. Each row reports a gate, its
-- severity, and the number of failing records; `failures = 0` means pass.
--
-- Critical gates (block deploy if > 0):
--   hotline_unverified   — a crisis hotline silently missing/stale verification
--                          (entries explicitly flagged needs_review are excluded:
--                          they are tracked, not silent).
--   person_outing_guard  — a public, living person carrying an off-vocab
--                          (uncontrolled, unconsented) lgbti_connection label.
--   crim_consistency     — a criminalizing country shown with a "safe" score.
--   dup_integrity        — a dangling or chained duplicate_of_id pointer.
--
-- High alerts (surface, do not block):
--   hotline_reachable    — a call-now hotline with no phone and no channel.
--   hotline_url_live     — a hotline whose last URL-liveness check found it broken.

create or replace function public.release_gate_checks()
returns table (gate text, severity text, failures bigint, detail jsonb)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  -- hotline_unverified (critical)
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
  -- person_outing_guard (critical)
  select 'person_outing_guard', 'critical',
    count(*)::bigint, '{}'::jsonb
  from public.personalities p
  where p.visibility = 'public'
    and p.is_living
    and p.lgbti_connection is not null
    and p.lgbti_connection not in
      ('community_member', 'ally', 'activist', 'representation', 'none_known', 'unclear')

  union all
  -- crim_consistency (critical)
  select 'crim_consistency', 'critical',
    count(*)::bigint,
    jsonb_build_object('country_ids', coalesce(jsonb_agg(c.id), '[]'::jsonb))
  from public.countries c
  where (c.lgbti_criminalization->>'legal') = 'false'
    and c.equality_score >= 50

  union all
  -- dup_integrity (critical) — dangling or chained duplicate_of_id, all entities
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
  -- hotline_reachable (high) — call-now lines must have a phone or channel
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
  -- hotline_url_live (high) — last liveness check found the link broken
  select 'hotline_url_live', 'high',
    count(*)::bigint,
    jsonb_build_object('ids', coalesce(jsonb_agg(h->>'id'), '[]'::jsonb))
  from public.cms_pages cp
  cross join lateral jsonb_array_elements(cp.body_json->'hotlines') h
  where cp.slug = 'help'
    and (h->>'link_status') = 'broken';
$$;

comment on function public.release_gate_checks() is
  'Data-quality release gates (audit 2026-06-05 §4). Returns one row per gate; failures=0 means pass. Critical gates block deploy.';

grant execute on function public.release_gate_checks() to authenticated, service_role;
