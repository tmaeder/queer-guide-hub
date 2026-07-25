-- Freigabeprozess für neu erfasste Personen (approval funnel, 2026-07-23).
--
-- Neu erfasste `personalities` landen als visibility='draft' / verification='pending'.
-- Der AUTOMATISCHE Teil der Freigabe existiert bereits (run_personality_auto_promote,
-- nightly, via personalities_promotable + promote_personality). Was fehlt und hier
-- ergänzt wird:
--
--   1. Ein sichtbarer, mehrstufiger Freigabe-Funnel als eine Ampel:
--        Erfasst → In Prüfung → Freigabe bereit → Veröffentlicht (+ Abgelehnt).
--      personality_freigabe_funnel()   → Zähler je Stufe (Dashboard).
--      personalities_freigabe_queue()  → Arbeitsliste einer Stufe (+ reasons).
--   2. Die MANUELLE Hälfte des Hybrid-Modells (der "Rest manuell"):
--        freigabe_personality()        → menschliche Freigabe (mit harten Guards).
--        reject_personality_capture()  → menschliche Ablehnung (reversibel).
--        unfreigabe_personality()      → Rücknahme beider (aus Snapshot).
--
-- Stufe wird REIN ABGELEITET aus vorhandenen Spalten — keine neue Spalte. Wahrheit
-- für "veröffentlicht" ist `visibility` (NICHT review_status: frisch committete Zeilen
-- behalten den Spalten-Default review_status='approved', obwohl sie draft sind).
--
-- Nebenbefund + Fix: promote_personality() setzte needs_attention=true beim Publish.
-- Der SPÄTERE public-gate-Trigger (20260721184623) demotet aber JEDE
-- needs_attention=true Zeile von public zurück auf draft — d.h. der nächtliche
-- Auto-Promote hat seit 2026-07-21 faktisch nichts mehr veröffentlicht (no-op). Der
-- Review-Vorbehalt wird stattdessen als Audit-Signal in enrichment_status.promotion
-- festgehalten (das schrieb die Funktion ohnehin schon), das self-defeating Flag
-- entfällt — so funktioniert die "sichere auto"-Hälfte des Hybrid wieder.

begin;

-- ============================================================
-- 0. Fix: promote_personality darf needs_attention nicht setzen
--    (sonst demotet der public-gate-Trigger die Zeile sofort zurück).
-- ============================================================
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
         -- needs_attention bewusst NICHT gesetzt: der public-gate-Trigger würde die
         -- Zeile sonst zurück auf draft demoten. Review-Vorbehalt bleibt als
         -- enrichment_status.promotion.flagged_for_review erhalten (Audit).
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
  'Reversible Moderate-gate publish: re-checks the gate, sets visibility=public + seo_indexable, records a review flag in enrichment_status.promotion. Does NOT set needs_attention (the public-gate trigger would demote it). Snapshots prior state in enrichment_status.promotion.prior.';

-- ============================================================
-- 1. Funnel counts — eine Ampel über alle Stufen in einem Round-Trip.
-- ============================================================
-- Stufen-Ableitung (MUSS mit personalities_freigabe_queue() synchron bleiben):
--   abgelehnt        : duplicate_of_id gesetzt ODER review_status in (archived,rejected)
--   veroeffentlicht  : visibility='public'
--   in_pruefung      : draft AND (needs_attention OR offene personality_review_queue)
--   freigabe_bereit  : draft AND erfüllt Auto-Gate (personalities_promotable)
--   erfasst          : draft, sonst (unvollständig, wartet auf Anreicherung)
create or replace function public.personality_freigabe_funnel()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with staged as (
    select
      case
        when p.duplicate_of_id is not null
             or coalesce(p.review_status,'') in ('archived','rejected') then 'abgelehnt'
        when p.visibility = 'public' then 'veroeffentlicht'
        when p.needs_attention is true
             or exists (select 1 from public.personality_review_queue q
                        where q.personality_id = p.id and q.status = 'open') then 'in_pruefung'
        when p.is_adult = false
             and coalesce(p.lgbti_relevance_score,0) >= 0.7
             and ((p.bio is not null and length(trim(p.bio)) > 30)
                  or (p.description is not null and length(trim(p.description)) > 30))
             and p.image_url is not null
             and p.wikidata_qid is not null and p.wikidata_qid not like 'SKIP_%'
             and coalesce(p.enrichment_status->'personhood'->>'verdict','') <> 'non_person'
             then 'freigabe_bereit'
        else 'erfasst'
      end as stage
    from public.personalities p
  )
  select coalesce(jsonb_object_agg(stage, n), '{}'::jsonb)
  from (select stage, count(*)::int as n from staged group by stage) s;
$$;

comment on function public.personality_freigabe_funnel() is
  'Freigabe-Funnel: Zähler je Stufe (erfasst / in_pruefung / freigabe_bereit / veroeffentlicht / abgelehnt). Stufe rein aus visibility/review_status/needs_attention/duplicate + Auto-Gate abgeleitet.';

-- ============================================================
-- 2. Queue-Selektor — Arbeitsliste einer Stufe mit reasons.
-- ============================================================
create or replace function public.personalities_freigabe_queue(
  p_stage text default 'in_pruefung',
  p_limit int default 100
)
returns table (
  id uuid,
  name text,
  slug text,
  image_url text,
  lgbti_relevance_score numeric,
  completeness_score smallint,
  needs_attention boolean,
  stage text,
  reasons text[]
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with staged as (
    select
      p.*,
      exists (select 1 from public.personality_review_queue q
              where q.personality_id = p.id and q.status = 'open') as has_open_review,
      (p.is_adult = false
        and coalesce(p.lgbti_relevance_score,0) >= 0.7
        and ((p.bio is not null and length(trim(p.bio)) > 30)
             or (p.description is not null and length(trim(p.description)) > 30))
        and p.image_url is not null
        and p.wikidata_qid is not null and p.wikidata_qid not like 'SKIP_%'
        and coalesce(p.enrichment_status->'personhood'->>'verdict','') <> 'non_person') as is_promotable
    from public.personalities p
  ),
  classified as (
    select
      s.*,
      case
        when s.duplicate_of_id is not null
             or coalesce(s.review_status,'') in ('archived','rejected') then 'abgelehnt'
        when s.visibility = 'public' then 'veroeffentlicht'
        when s.needs_attention is true or s.has_open_review then 'in_pruefung'
        when s.is_promotable then 'freigabe_bereit'
        else 'erfasst'
      end as stage
    from staged s
  )
  select
    c.id, c.name, c.slug, c.image_url, c.lgbti_relevance_score,
    c.completeness_score, c.needs_attention,
    c.stage,
    array_remove(array[
      case when c.needs_attention is true then 'needs_attention' end,
      case when c.has_open_review then 'open_review_item' end,
      case when c.duplicate_of_id is not null then 'duplicate' end,
      case when coalesce(c.review_status,'') in ('archived','rejected') then c.review_status end,
      case when c.image_url is null then 'missing_image' end,
      case when not ((c.bio is not null and length(trim(c.bio)) > 30)
                     or (c.description is not null and length(trim(c.description)) > 30))
           then 'no_bio' end,
      case when coalesce(c.lgbti_relevance_score,0) < 0.7 then 'relevance_below_gate' end,
      case when c.wikidata_qid is null or c.wikidata_qid like 'SKIP_%' then 'no_wikidata' end,
      case when c.is_adult is true then 'is_adult' end,
      case when coalesce(c.enrichment_status->'personhood'->>'verdict','') = 'non_person'
           then 'non_person_flag' end
    ], null)::text[] as reasons
  from classified c
  where c.stage = p_stage
  order by c.needs_attention desc nulls last,
           coalesce(c.completeness_score, 0) desc,
           c.name
  limit greatest(p_limit, 1);
$$;

comment on function public.personalities_freigabe_queue(text, int) is
  'Arbeitsliste einer Freigabe-Stufe (default in_pruefung) mit reasons[] (warum geflaggt / was fehlt). Für die manuelle Freigabe-Queue im Admin.';

-- ============================================================
-- 3. Manuelle Freigabe (der "Rest manuell"-Handgriff). Admin/Moderator.
-- ============================================================
-- Harte, nie überschreibbare Guards: non_person, is_adult (Consent-Pfad), Outing-
-- Guard (living + outing-riskante Verbindung), Duplikat. Erfüllt die Zeile das
-- Auto-Gate → sauber veröffentlichen; sonst manueller Override nur mit p_confirm.
create or replace function public.freigabe_personality(
  p_id uuid,
  p_confirm boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r public.personalities%rowtype;
  v_is_promotable boolean;
  v_snapshot jsonb;
begin
  if not has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role]) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select * into r from public.personalities where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found', 'id', p_id);
  end if;

  -- Harte Guards.
  if r.duplicate_of_id is not null then
    return jsonb_build_object('ok', false, 'error', 'is_duplicate', 'id', p_id);
  end if;
  if coalesce(r.enrichment_status->'personhood'->>'verdict','') = 'non_person' then
    return jsonb_build_object('ok', false, 'error', 'non_person', 'id', p_id);
  end if;
  if r.is_adult = true then
    return jsonb_build_object('ok', false, 'error', 'adult_use_consent_path', 'id', p_id);
  end if;
  -- Outing-Guard: lebende Person mit outing-riskanter, spezifischer Verbindung
  -- darf nie öffentlich werden (spiegelt release_gate_checks person_outing_guard).
  if r.is_living
     and r.lgbti_connection is not null
     and r.lgbti_connection not in
       ('community_member','ally','activist','representation','none_known','unclear') then
    return jsonb_build_object('ok', false, 'error', 'outing_guard',
                              'id', p_id, 'connection', r.lgbti_connection);
  end if;

  if r.visibility = 'public' and r.needs_attention is not true then
    return jsonb_build_object('ok', true, 'id', p_id, 'noop', true);
  end if;

  -- Auto-Gate (Vollständigkeit). Fehlt etwas → nur mit ausdrücklichem Confirm.
  v_is_promotable := (
    coalesce(r.review_status,'') <> 'archived'
    and coalesce(r.lgbti_relevance_score, 0) >= 0.7
    and ((r.bio is not null and length(trim(r.bio)) > 30)
         or (r.description is not null and length(trim(r.description)) > 30))
    and r.image_url is not null
    and r.wikidata_qid is not null and r.wikidata_qid not like 'SKIP_%'
  );
  if not v_is_promotable and not p_confirm then
    return jsonb_build_object('ok', false, 'error', 'confirm_required',
                              'id', p_id, 'gate', 'failed');
  end if;

  v_snapshot := coalesce(r.enrichment_status->'freigabe'->'prior', jsonb_build_object(
    'prior_visibility', r.visibility,
    'prior_seo_indexable', r.seo_indexable,
    'prior_review_status', r.review_status,
    'prior_verification_status', r.verification_status,
    'prior_needs_attention', r.needs_attention
  ));

  update public.personalities
     set visibility          = 'public',
         seo_indexable        = true,
         review_status        = 'approved',
         verification_status  = 'verified',
         needs_attention      = false,  -- muss false sein, sonst demotet der public-gate-Trigger
         enrichment_status    = jsonb_set(
           coalesce(enrichment_status, '{}'::jsonb), '{freigabe}',
           jsonb_build_object(
             'disposition', 'freigegeben',
             'manual_override', not v_is_promotable,
             'at', now(),
             'prior', v_snapshot
           ), true),
         updated_at           = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id, 'freigegeben', true,
                            'manual_override', not v_is_promotable);
end;
$$;

comment on function public.freigabe_personality(uuid, boolean) is
  'Manuelle Freigabe einer neu erfassten Person (visibility=public, seo_indexable, review_status=approved, verification=verified, needs_attention=false). Harte Guards: non_person / is_adult / Outing / Duplikat. Auto-Gate-Fail nur mit p_confirm. Reversibel via unfreigabe_personality.';

-- ============================================================
-- 4. Manuelle Ablehnung (reversibel). Admin/Moderator.
-- ============================================================
create or replace function public.reject_personality_capture(
  p_id uuid,
  p_reason text default 'rejected at capture'
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
  if not has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role]) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select * into r from public.personalities where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found', 'id', p_id);
  end if;

  v_snapshot := coalesce(r.enrichment_status->'freigabe'->'prior', jsonb_build_object(
    'prior_visibility', r.visibility,
    'prior_seo_indexable', r.seo_indexable,
    'prior_review_status', r.review_status,
    'prior_verification_status', r.verification_status,
    'prior_needs_attention', r.needs_attention
  ));

  update public.personalities
     set review_status     = 'rejected',
         visibility         = 'draft',
         seo_indexable      = false,
         needs_attention    = false,
         enrichment_status  = jsonb_set(
           coalesce(enrichment_status, '{}'::jsonb), '{freigabe}',
           jsonb_build_object(
             'disposition', 'abgelehnt',
             'reason', p_reason,
             'at', now(),
             'prior', v_snapshot
           ), true),
         updated_at         = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id, 'rejected', true);
end;
$$;

comment on function public.reject_personality_capture(uuid, text) is
  'Manuelle Ablehnung einer neu erfassten Person (review_status=rejected, visibility=draft, seo_indexable=false). Reversibel via unfreigabe_personality. Getrennt vom Nicht-Person-Pfad (archive_personality_as_nonperson).';

-- ============================================================
-- 5. Rücknahme — stellt den Vor-Zustand aus dem Snapshot wieder her.
-- ============================================================
create or replace function public.unfreigabe_personality(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r public.personalities%rowtype;
  v_prior jsonb;
begin
  if not has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role]) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select * into r from public.personalities where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found', 'id', p_id);
  end if;
  v_prior := r.enrichment_status->'freigabe'->'prior';
  if v_prior is null then
    return jsonb_build_object('ok', false, 'error', 'no_snapshot', 'id', p_id);
  end if;

  update public.personalities
     set visibility          = coalesce(v_prior->>'prior_visibility', 'draft'),
         seo_indexable        = coalesce((v_prior->>'prior_seo_indexable')::boolean, false),
         review_status        = coalesce(v_prior->>'prior_review_status', 'pending'),
         verification_status  = coalesce(v_prior->>'prior_verification_status', 'pending'),
         needs_attention      = coalesce((v_prior->>'prior_needs_attention')::boolean, false),
         enrichment_status    = jsonb_set(
           enrichment_status, '{freigabe}',
           (enrichment_status->'freigabe') - 'prior'
             || jsonb_build_object('disposition', 'zurueckgenommen', 'at', now()),
           true),
         updated_at           = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id, 'reverted', true);
end;
$$;

comment on function public.unfreigabe_personality(uuid) is
  'Nimmt eine Freigabe/Ablehnung zurück und stellt visibility/seo/review/verification/needs_attention aus enrichment_status.freigabe.prior wieder her.';

-- ============================================================
-- 6. Grants.
-- ============================================================
revoke all on function public.personality_freigabe_funnel() from public;
revoke all on function public.personalities_freigabe_queue(text, int) from public;
revoke all on function public.freigabe_personality(uuid, boolean) from public;
revoke all on function public.reject_personality_capture(uuid, text) from public;
revoke all on function public.unfreigabe_personality(uuid) from public;

grant execute on function public.personality_freigabe_funnel() to authenticated, service_role;
grant execute on function public.personalities_freigabe_queue(text, int) to authenticated, service_role;
-- Mutierende RPCs prüfen die Rolle intern (has_any_role_jwt); Grant an authenticated
-- ist der übliche Weg (Nicht-Admins bekommen 42501).
grant execute on function public.freigabe_personality(uuid, boolean) to authenticated, service_role;
grant execute on function public.reject_personality_capture(uuid, text) to authenticated, service_role;
grant execute on function public.unfreigabe_personality(uuid) to authenticated, service_role;

commit;
