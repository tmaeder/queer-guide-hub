-- Phase 0 of the personalities content-quality remediation
-- (docs/plans/2026-06-07-personalities-content-quality-design.md).
--
-- The existing person_outing_guard (20260605130000) is tautologically zero: it
-- only flags lgbti_connection values OUTSIDE the controlled vocab, but the CHECK
-- constraint (20260605120000 / 120010) already makes off-vocab values
-- impossible. So the gate that was meant to protect living people protects
-- nothing.
--
-- The real harm vector is a COMMITTED identity claim
-- (community_member / ally / activist / representation) on a LIVING, PUBLIC (or
-- search-indexable) person with NO provenance anchor — an unconsented assertion
-- of someone's LGBTQ+ identity with nothing backing it. 'unclear' / 'none_known'
-- / NULL assert nothing and are always safe.
--
-- A provenance anchor = a wikidata_qid OR at least one personality_sources row.
--
-- This migration lands NOW, while 0 rows carry a committed claim, so the gate is
-- in place before Phase 2 (Wikidata recall) and Phase 3 (LLM residual) begin
-- writing real connections. It does two things:
--   (1) Strengthens release_gate_checks().person_outing_guard to the real
--       definition (nightly / CI catch, covers public AND seo_indexable).
--   (2) Adds a BEFORE trigger that DEMOTES a violating row to a safe state
--       (draft + not-indexable + needs_attention) rather than raising — so bulk
--       enrichment that sets a connection before an anchor exists lands in the
--       review queue instead of crashing the batch. Matches the design's
--       "always lands in draft, never auto-public" rule.

begin;

-- (1) Real gate definition.
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
  -- person_outing_guard (critical) — a committed LGBTQ+ identity claim on a
  -- living, publicly-visible (or search-indexable) person with no provenance
  -- anchor (no wikidata_qid and no personality_sources row).
  select 'person_outing_guard', 'critical',
    count(*)::bigint, '{}'::jsonb
  from public.personalities p
  where p.duplicate_of_id is null
    and p.is_living
    and (p.visibility = 'public' or p.seo_indexable)
    and p.lgbti_connection in ('community_member', 'ally', 'activist', 'representation')
    and p.wikidata_qid is null
    and not exists (
      select 1 from public.personality_sources s where s.personality_id = p.id
    )

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
  -- hotline_reachable (high)
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
  -- hotline_url_live (high)
  select 'hotline_url_live', 'high',
    count(*)::bigint,
    jsonb_build_object('ids', coalesce(jsonb_agg(h->>'id'), '[]'::jsonb))
  from public.cms_pages cp
  cross join lateral jsonb_array_elements(cp.body_json->'hotlines') h
  where cp.slug = 'help'
    and (h->>'link_status') = 'broken';
$$;

comment on function public.release_gate_checks() is
  'Data-quality release gates (audit 2026-06-05 §4; person_outing_guard strengthened 2026-06-07). Returns one row per gate; failures=0 means pass. Critical gates block deploy.';

-- (2) Write-time guard: demote, do not raise.
create or replace function public.personalities_enforce_outing_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Only living, publicly-exposed rows asserting a committed identity claim are
  -- at risk. 'unclear' / 'none_known' / NULL assert nothing.
  if new.is_living
     and (new.visibility = 'public' or new.seo_indexable)
     and new.lgbti_connection in ('community_member', 'ally', 'activist', 'representation')
     and new.wikidata_qid is null
     and not exists (
       select 1 from public.personality_sources s where s.personality_id = new.id
     )
  then
    -- No provenance for an identity claim about a living person: keep it out of
    -- public surfaces and flag for human review instead of failing the write.
    new.visibility    := 'draft';
    new.seo_indexable := false;
    new.needs_attention := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_personalities_outing_guard on public.personalities;
create trigger trg_personalities_outing_guard
  before insert or update of visibility, seo_indexable, lgbti_connection, wikidata_qid, is_living
  on public.personalities
  for each row
  execute function public.personalities_enforce_outing_guard();

commit;
