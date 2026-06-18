-- Personality promotion gate (data-quality recall recovery, 2026-06-18).
--
-- Context: ~92% of the personalities catalog sits in visibility='draft' after the
-- 2026-06 safety/personhood remediation, with no path back to public. This ships
-- the "Moderate" promotion gate agreed with the operator:
--
--   Auto-publishable iff ALL of:
--     * visibility='draft', duplicate_of_id IS NULL, review_status <> 'archived'
--     * NOT is_adult            (adult-without-consent → review queue, never auto)
--     * lgbti_relevance_score >= 0.7   (the queer-signal-derived gate; 'unclear'
--                                       connection is allowed because >=0.7 IS the
--                                       evidence — matches person_outing_guard,
--                                       which only trips on free-text connections)
--     * bio (>30 chars) OR description present
--     * image_url present
--     * wikidata_qid present and not a SKIP_ sentinel
--     * personhood verdict <> 'non_person'
--
-- promote_personality() re-checks the gate server-side, publishes, and stamps a
-- reversible enrichment_status.promotion snapshot. Promoted rows carry
-- needs_attention=true so an operator reviews each auto-publish (Moderate policy).
-- unpromote_personality() restores prior state from the snapshot.
--
-- Safety: nothing here can publish a row the outing guard or non-person gate would
-- flag — the gate excludes is_adult, requires relevance>=0.7, and excludes
-- non_person verdicts. release_gate_checks() remains the backstop.

begin;

-- ============================================================
-- 1. Promotable selector (high recall within the Moderate gate).
-- ============================================================
create or replace function public.personalities_promotable(p_limit int default 500)
returns table (
  id uuid,
  name text,
  lgbti_relevance_score numeric,
  lgbti_connection text,
  has_bio boolean,
  has_image boolean,
  wikidata_qid text
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    p.id, p.name, p.lgbti_relevance_score, p.lgbti_connection,
    (p.bio is not null and length(trim(p.bio)) > 30) as has_bio,
    (p.image_url is not null) as has_image,
    p.wikidata_qid
  from public.personalities p
  where p.visibility = 'draft'
    and p.duplicate_of_id is null
    and coalesce(p.review_status, '') <> 'archived'
    and p.is_adult = false
    and p.lgbti_relevance_score >= 0.7
    and (
      (p.bio is not null and length(trim(p.bio)) > 30)
      or (p.description is not null and length(trim(p.description)) > 30)
    )
    and p.image_url is not null
    and p.wikidata_qid is not null
    and p.wikidata_qid not like 'SKIP_%'
    and coalesce(p.enrichment_status->'personhood'->>'verdict', '') <> 'non_person'
  order by p.lgbti_relevance_score desc, p.view_count desc nulls last, p.name
  limit greatest(p_limit, 1);
$$;

comment on function public.personalities_promotable(int) is
  'Personalities eligible for Moderate-gate auto-publish: non-adult, relevance>=0.7, bio/description + image + real wikidata_qid, not a non-person, draft & not archived.';

-- ============================================================
-- 2. Reversible publish.
-- ============================================================
-- Re-validates the gate server-side (a stale caller cannot publish an adult /
-- low-relevance / non-person row), flips to public + indexable, flags for review,
-- and snapshots prior state once for unpromote.
create or replace function public.promote_personality(
  p_id uuid,
  p_source text default 'moderate-auto'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r public.personalities%rowtype;
  v_snapshot jsonb;
begin
  select * into r from public.personalities where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found', 'id', p_id);
  end if;

  -- Server-side gate (defence in depth).
  if r.duplicate_of_id is not null
     or coalesce(r.review_status,'') = 'archived'
     or r.is_adult = true
     or coalesce(r.lgbti_relevance_score, 0) < 0.7
     or r.image_url is null
     or r.wikidata_qid is null or r.wikidata_qid like 'SKIP_%'
     or not (
       (r.bio is not null and length(trim(r.bio)) > 30)
       or (r.description is not null and length(trim(r.description)) > 30))
     or coalesce(r.enrichment_status->'personhood'->>'verdict','') = 'non_person'
  then
    return jsonb_build_object('ok', false, 'error', 'gate_failed', 'id', p_id);
  end if;

  if r.visibility = 'public' then
    return jsonb_build_object('ok', true, 'id', p_id, 'noop', true);
  end if;

  v_snapshot := coalesce(r.enrichment_status->'promotion'->'prior', jsonb_build_object(
    'prior_visibility', r.visibility,
    'prior_seo_indexable', r.seo_indexable
  ));

  update public.personalities
     set visibility       = 'public',
         seo_indexable    = true,
         needs_attention  = true,  -- Moderate policy: every auto-publish is reviewed
         enrichment_status = jsonb_set(
           coalesce(enrichment_status, '{}'::jsonb), '{promotion}',
           jsonb_build_object(
             'source', p_source,
             'flagged_for_review', true,
             'relevance_at_promote', r.lgbti_relevance_score,
             'connection_at_promote', r.lgbti_connection,
             'at', now(),
             'prior', v_snapshot
           ), true),
         updated_at       = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id, 'promoted', true);
end;
$$;

comment on function public.promote_personality(uuid, text) is
  'Reversible Moderate-gate publish: re-checks the gate, sets visibility=public + seo_indexable + needs_attention(review), snapshots prior state in enrichment_status.promotion.prior.';

-- Restore a promoted row to its prior (pre-promotion) visibility.
create or replace function public.unpromote_personality(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r public.personalities%rowtype;
  v_prior jsonb;
begin
  select * into r from public.personalities where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found', 'id', p_id);
  end if;
  v_prior := r.enrichment_status->'promotion'->'prior';
  if v_prior is null then
    return jsonb_build_object('ok', false, 'error', 'not_promoted', 'id', p_id);
  end if;

  update public.personalities
     set visibility    = coalesce(v_prior->>'prior_visibility', 'draft'),
         seo_indexable  = coalesce((v_prior->>'prior_seo_indexable')::boolean, false),
         enrichment_status = jsonb_set(
           enrichment_status, '{promotion}',
           (enrichment_status->'promotion') - 'prior'
             || jsonb_build_object('disposition', 'unpromoted', 'unpromoted_at', now()),
           true),
         updated_at = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id, 'unpromoted', true);
end;
$$;

comment on function public.unpromote_personality(uuid) is
  'Restore a promoted personality to its pre-promotion visibility/seo_indexable from enrichment_status.promotion.prior.';

-- ============================================================
-- 3. Grants.
-- ============================================================
revoke all on function public.personalities_promotable(int) from public;
revoke all on function public.promote_personality(uuid, text) from public;
revoke all on function public.unpromote_personality(uuid) from public;
grant execute on function public.personalities_promotable(int) to service_role, authenticated;
grant execute on function public.promote_personality(uuid, text) to service_role;
grant execute on function public.unpromote_personality(uuid) to service_role;

commit;
