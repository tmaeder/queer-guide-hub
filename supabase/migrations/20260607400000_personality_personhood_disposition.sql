-- Personhood disposition engine (data-quality, 2026-06-07).
--
-- The Wikidata resolver's P31=Q5 (human) filter correctly refuses to match
-- non-people, which is why a share of the bare-name personalities residue is
-- actually organizations / venues / teams misfiled into public.personalities
-- (e.g. "The Sisters of Perpetual Indulgence", "San Francisco Tsunami Water
-- Polo", "La Montaña", "Divine Connection Now").
--
-- This migration ships the SQL spine for a detection + disposition pass:
--   1. enrichment_status.personhood convention (verdict / confidence / signals /
--      reversible archive block).
--   2. personalities_nonperson_candidates(limit) — deterministic heuristic
--      recall selector (name structural tokens + bio org-subject phrasing).
--      Loose on purpose: the edge-function classifier (Wikidata P31 + LLM
--      grounded in bio) is the precision gate before anything is archived.
--   3. archive_personality_as_nonperson(id, reason, signals) — REVERSIBLE
--      soft-archive (visibility→draft + review_status='archived' +
--      seo_indexable=false), mirroring the Phase-1 adult-cohort archive. Never
--      hard-deletes. Stores prior state so unarchive restores it exactly.
--   4. unarchive_personality(id) — restores prior state from the archive block.
--   5. release_gate_checks() gains a critical person_nonperson_public gate: a
--      personality the classifier flagged non_person must never be public.
--   6. Registration: workflow_definition + weekly cron for the perpetual screen.
--
-- The actual classification/archiving is performed out-of-band by the
-- pipeline-classify-personhood edge function (the per-row search_documents
-- re-index cascade cannot complete in one migration transaction, and the LLM /
-- Wikidata calls are network-bound). This migration writes no entity rows.

begin;

-- ============================================================
-- 1. Reversible archive helper.
-- ============================================================
-- Soft-archive a confirmed non-person. Idempotent: the prior-state snapshot is
-- captured only on the first call (so a re-run never clobbers the restore
-- target with the already-archived values). visibility is forced to 'draft'
-- (the public read paths + search index all gate on visibility='public', so
-- this is what actually removes the row from every public surface).
create or replace function public.archive_personality_as_nonperson(
  p_id uuid,
  p_reason text default 'classified non-person',
  p_signals jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r public.personalities%rowtype;
  v_existing jsonb;
  v_archived jsonb;
  v_personhood jsonb;
begin
  select * into r from public.personalities where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found', 'id', p_id);
  end if;

  v_existing := coalesce(r.enrichment_status->'personhood', '{}'::jsonb);

  -- Snapshot prior state once. Re-runs keep the original snapshot intact.
  v_archived := v_existing->'archived';
  if v_archived is null then
    v_archived := jsonb_build_object(
      'prior_visibility', r.visibility,
      'prior_review_status', r.review_status,
      'prior_seo_indexable', r.seo_indexable,
      'at', now(),
      'reason', p_reason
    );
  end if;

  v_personhood := jsonb_strip_nulls(
    coalesce(p_signals, '{}'::jsonb)
    || jsonb_build_object(
         'verdict', 'non_person',
         'disposition', 'archived',
         'classified_at', now(),
         'archived', v_archived
       )
  );

  update public.personalities
     set visibility       = 'draft',
         review_status    = 'archived',
         seo_indexable    = false,
         enrichment_status = jsonb_set(
           coalesce(enrichment_status, '{}'::jsonb), '{personhood}', v_personhood, true
         ),
         updated_at       = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id, 'archived', true,
                            'prior_visibility', v_archived->>'prior_visibility');
end;
$$;

comment on function public.archive_personality_as_nonperson(uuid, text, jsonb) is
  'Reversible soft-archive of a confirmed non-person personality (visibility→draft + review_status=archived + seo_indexable=false). Stores prior state in enrichment_status.personhood.archived for unarchive_personality(). Never hard-deletes.';

-- Extend the EXISTING unarchive_personality(uuid)→integer (preserve its return
-- type + admin behavior: review_status→pending, needs_attention=true). When the
-- row was archived by archive_personality_as_nonperson() it additionally carries
-- a personhood.archived snapshot — restore visibility + seo_indexable from it
-- and drop the archive marker. Adult-cohort rows (no snapshot) behave exactly as
-- before (coalesce falls back to current values). Returns rows affected.
create or replace function public.unarchive_personality(p_id uuid)
returns integer
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with upd as (
    update public.personalities p
       set review_status   = 'pending',
           needs_attention = true,
           visibility      = coalesce(p.enrichment_status->'personhood'->'archived'->>'prior_visibility', p.visibility),
           seo_indexable   = coalesce((p.enrichment_status->'personhood'->'archived'->>'prior_seo_indexable')::boolean, p.seo_indexable),
           enrichment_status = case
             when p.enrichment_status->'personhood'->'archived' is not null
               then jsonb_set(
                 p.enrichment_status, '{personhood}',
                 (p.enrichment_status->'personhood') - 'archived'
                   || jsonb_build_object('disposition', 'unarchived', 'unarchived_at', now()),
                 true)
             else p.enrichment_status
           end,
           updated_at      = now()
     where p.id = p_id
       and p.review_status = 'archived'
    returning 1
  )
  select count(*)::integer from upd;
$function$;

comment on function public.unarchive_personality(uuid) is
  'Restore an archived personality (review_status→pending, needs_attention). For non-person archives, also restores visibility + seo_indexable from enrichment_status.personhood.archived. Returns rows affected.';

-- Record a non-archiving personhood verdict (person / uncertain). Stamps the
-- enrichment_status.personhood block WITHOUT touching visibility/review_status,
-- so a confirmed person or an ambiguous row is excluded from future candidate
-- selection (and 'uncertain' rows can be surfaced for human triage). Never sets
-- verdict='non_person' here — archiving is the only path that writes that.
create or replace function public.set_personhood_verdict(
  p_id uuid,
  p_verdict text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_personhood jsonb;
begin
  if p_verdict not in ('person', 'uncertain') then
    return jsonb_build_object('ok', false, 'error', 'invalid_verdict', 'verdict', p_verdict);
  end if;
  if not exists (select 1 from public.personalities where id = p_id) then
    return jsonb_build_object('ok', false, 'error', 'not_found', 'id', p_id);
  end if;

  v_personhood := jsonb_strip_nulls(
    coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object('verdict', p_verdict, 'classified_at', now())
  );

  update public.personalities
     set enrichment_status = jsonb_set(
           coalesce(enrichment_status, '{}'::jsonb), '{personhood}', v_personhood, true
         ),
         updated_at = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id, 'verdict', p_verdict);
end;
$$;

comment on function public.set_personhood_verdict(uuid, text, jsonb) is
  'Record a non-archiving personhood verdict (person|uncertain) in enrichment_status.personhood. Excludes the row from future candidate selection; uncertain rows carry needs_attention for triage.';

-- ============================================================
-- 2. Candidate selector (heuristic recall).
-- ============================================================
-- Returns rows that LOOK like they might be a non-person, for the classifier to
-- adjudicate. High recall, modest precision by design — the LLM + Wikidata pass
-- is the precision gate. Excludes duplicates, already-classified rows, and rows
-- already archived as non-person. Public rows are surfaced first (defence in
-- depth: any non-person that ever reaches 'public' is handled before drafts).
create or replace function public.personalities_nonperson_candidates(p_limit int default 100)
returns table (
  id uuid,
  name text,
  bio text,
  profession text,
  nationality text,
  visibility text,
  has_dates boolean,
  signals text[]
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with scored as (
    select
      p.id, p.name, coalesce(p.bio, p.description) as bio, p.profession, p.nationality,
      p.visibility,
      (p.birth_date is not null or p.death_date is not null) as has_dates,
      -- structural tokens that in a *name* almost never denote an individual
      (p.name ~* '\m(water\s?polo|rugby|softball|volleyball|frontrunners|bowling|dodgeball|kickball|football\s?club|wrestling\s?club|swim\s?team|track\s?club|athletic|chorus|chorale|choir|symphony|orchestra|ensemble|quartet|sisters\s+of\s+perpetual|brotherhood|sorority|fraternity|house\s+of\s+|society\M|association\M|coalition|alliance\M|task\s?force|foundation\M|federation|collective\M|cooperative|congregation|fellowship|ministries|ministry\M|network\M|institute\M|guild\M|league\M|chamber\s+of)') as name_struct,
      -- bio whose subject self-describes as an org / venue / team (not a person)
      (coalesce(p.bio, p.description, '') ~* '\m(is|was)\s+(a|an|the)\s+([a-z''-]+\s+){0,4}(organization|organisation|non-?profit|not-for-profit|charity\M|charitable\s+organi|foundation|ngo\M|nonprofit|association|collective|cooperative|sports\s+team|water\s+polo\s+team|rugby\s+club|softball\s+(team|league)|sports\s+club|restaurant|eatery|bistro|diner|caf[eé]\M|coffee\s?shop|gay\s+bar|nightclub|bathhouse|sauna\M|guesthouse|guest\s?house|hostel|festival\M|chorus\M|chorale\M|theatre\s+company|dance\s+company|record\s+label|magazine\M|newspaper|publication)') as bio_org
    from public.personalities p
    where p.duplicate_of_id is null
      and coalesce(p.enrichment_status->'personhood'->>'verdict', '') = ''
  )
  select
    id, name, bio, profession, nationality, visibility, has_dates,
    array_remove(array[
      case when name_struct then 'name_token' end,
      case when bio_org     then 'bio_org_subject' end
    ], null) as signals
  from scored
  where name_struct or bio_org
  order by (visibility = 'public') desc, (bio is not null) desc, name
  limit greatest(p_limit, 1);
$$;

comment on function public.personalities_nonperson_candidates(int) is
  'Heuristic-recall selector for the personhood classifier: personalities whose name token or bio subject suggests an org/venue/team. Precision is the classifier''s job (Wikidata P31 + LLM). Excludes duplicates + already-classified rows.';

-- ============================================================
-- 3. Grants.
-- ============================================================
revoke all on function public.archive_personality_as_nonperson(uuid, text, jsonb) from public;
revoke all on function public.unarchive_personality(uuid) from public;
revoke all on function public.set_personhood_verdict(uuid, text, jsonb) from public;
revoke all on function public.personalities_nonperson_candidates(int) from public;
grant execute on function public.archive_personality_as_nonperson(uuid, text, jsonb) to service_role;
grant execute on function public.unarchive_personality(uuid) to service_role, authenticated;
grant execute on function public.set_personhood_verdict(uuid, text, jsonb) to service_role;
grant execute on function public.personalities_nonperson_candidates(int) to service_role, authenticated;

-- ============================================================
-- 4. release_gate_checks() — add critical person_nonperson_public gate.
-- Rebuilt from the latest form (20260605150000) with one gate appended.
-- ============================================================
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
  -- person_nonperson_public (critical) — a row the classifier confirmed is NOT a
  -- person (organization/venue/team) must never be publicly surfaced.
  select 'person_nonperson_public', 'critical',
    count(*)::bigint,
    jsonb_build_object('ids', coalesce(jsonb_agg(p.id), '[]'::jsonb))
  from public.personalities p
  where p.visibility = 'public'
    and p.duplicate_of_id is null
    and p.enrichment_status->'personhood'->>'verdict' = 'non_person'

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

comment on function public.release_gate_checks() is
  'Data-quality release gates. Returns one row per gate; failures=0 means pass. Critical gates block deploy. Includes person_nonperson_public (2026-06-07).';

grant execute on function public.release_gate_checks() to authenticated, service_role;

-- ============================================================
-- 5. Register the perpetual classifier workflow + weekly cron.
-- ============================================================
insert into public.workflow_definitions
  (name, display_name, description, edge_function, queue_name,
   default_payload, max_retries, retry_backoff_base, max_concurrency,
   timeout_seconds, is_enabled, priority, tags)
values
  ('classify-personhood', 'Classify Personhood (non-person screen)',
   'Detect organizations / venues / teams misfiled in personalities and reversibly archive confirmed non-persons. Heuristic recall + Wikidata P31 + LLM grounded in bio; hybrid-by-confidence (high→archive, ambiguous→needs_attention).',
   'pipeline-classify-personhood', 'import_jobs',
   '{"batch_limit": 15}'::jsonb,
   2, 60, 1, 300, true, 5, array['data-quality','personalities','classification'])
on conflict (name) do update
  set description=excluded.description, edge_function=excluded.edge_function,
      default_payload=excluded.default_payload;

do $$ begin
  if exists (select 1 from cron.job where jobname='wf-classify-personhood') then
    perform cron.unschedule('wf-classify-personhood');
  end if;
end $$;

-- Weekly screen, enqueued via workflow-dispatcher (same pattern as the other
-- single-function enrichment crons).
select cron.schedule(
  'wf-classify-personhood', '30 6 * * 1',
  $cron$select public.enqueue_workflow('classify-personhood', '{"batch_limit":15,"triggered_by":"cron"}'::jsonb)$cron$
);

commit;
