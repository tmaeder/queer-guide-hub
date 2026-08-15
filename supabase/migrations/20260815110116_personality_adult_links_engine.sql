-- ============================================================================
-- Adult performer profile links, phase 2 — review plumbing, selector, cron
--
-- Companion to 20260815105230_personality_adult_links_backfill.sql, which
-- recovered the 1,678 Pornhub URLs we already owned. This adds the machinery
-- that RESOLVES the rest by probing pornhub / xhamster / xvideos.
--
-- The safety model, and why it is not "just link the 200s":
--
--   A link asserts "this person performs in porn". Measured on the live
--   cohort: 2,751 of the 4,173 live adult rows are LIVING people, and 1,450 of
--   the unlinked ones carry Wikidata/Wikipedia provenance — i.e. real names,
--   not stage names. A 200 at pornhub.com/pornstar/<our-name-slug> proves only
--   that SOME performer uses that stage name. This repo already refuses
--   name-only identity matching for personalities everywhere else (dedup needs
--   a QID or birth_date; a 2026-08 audit measured 59.7% of adult-cohort QIDs
--   as the wrong human), so the resolver auto-applies only self-proving
--   matches and routes everything else to human review.
-- ============================================================================

-- ── 1. jsonb_shallow_merge apply mode ───────────────────────────────────────
--
-- `social_links` is a jsonb map and three fields (pornhub / xhamster /
-- xvideos) all target that ONE column, so none of the existing modes fit:
-- `text` would replace the whole map and destroy the other platforms'
-- links. This merges a single key in.
--
-- The merge key is a VALUE, not an identifier, so it is bound through USING
-- rather than interpolated into format() — same injection posture as the rest
-- of the function (identifiers via %I, everything else via USING).

alter table public.review_field_registry
  drop constraint if exists review_field_registry_apply_mode_check;

alter table public.review_field_registry
  add constraint review_field_registry_apply_mode_check
  check (apply_mode = any (array[
    'text', 'text_truncated', 'text_required', 'int_clamped',
    'text_array_union', 'jsonb_array_to_text_array', 'geo_latlng',
    'jsonb_shallow_merge'
  ]));

CREATE OR REPLACE FUNCTION public._apply_review_value(
  p_reg public.review_field_registry,
  p_entity_id uuid,
  p_proposed jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE
  v_extra text := '';
  v_val   jsonb;
  v_text  text;
  v_key   text;
  c       text;
BEGIN
  -- Identifier-only extras, never literals — so never an injection vector.
  FOR c IN SELECT jsonb_array_elements_text(coalesce(p_reg.apply_args->'touch','[]'::jsonb))
  LOOP v_extra := v_extra || format(', %I = now()', c); END LOOP;
  FOR c IN SELECT jsonb_array_elements_text(coalesce(p_reg.apply_args->'set_true','[]'::jsonb))
  LOOP v_extra := v_extra || format(', %I = true', c); END LOOP;

  -- Arrays and geo read `->value` with a fallback to the whole document,
  -- mirroring approve_venue_review. Scalars read the registry's value_key.
  v_val  := p_proposed -> p_reg.value_key;
  v_text := p_proposed ->> p_reg.value_key;

  CASE p_reg.apply_mode

  WHEN 'text' THEN
    EXECUTE format('UPDATE public.%I SET %I = $1 %s WHERE id = $2',
                   p_reg.target_table, p_reg.target_column, v_extra)
      USING v_text, p_entity_id;

  WHEN 'text_required' THEN
    v_text := nullif(btrim(v_text), '');
    IF v_text IS NULL THEN
      RAISE EXCEPTION 'proposed_value.% is empty for field %', p_reg.value_key, p_reg.field
        USING ERRCODE = '22023';
    END IF;
    EXECUTE format('UPDATE public.%I SET %I = $1 %s WHERE id = $2',
                   p_reg.target_table, p_reg.target_column, v_extra)
      USING v_text, p_entity_id;

  WHEN 'text_truncated' THEN
    EXECUTE format('UPDATE public.%I SET %I = left($1, %s) %s WHERE id = $2',
                   p_reg.target_table, p_reg.target_column,
                   (p_reg.apply_args->>'max_len')::int, v_extra)
      USING coalesce(v_text, ''), p_entity_id;

  WHEN 'int_clamped' THEN
    EXECUTE format('UPDATE public.%I SET %I = greatest(%s, least(%s, round($1)::int)) %s WHERE id = $2',
                   p_reg.target_table, p_reg.target_column,
                   (p_reg.apply_args->>'min')::int, (p_reg.apply_args->>'max')::int, v_extra)
      USING v_text::numeric, p_entity_id;

  WHEN 'text_array_union' THEN
    -- Union into the existing array and sort, exactly like approve_venue_review.
    EXECUTE format(
      'UPDATE public.%I SET %I = ('
      '  SELECT array(SELECT DISTINCT unnest('
      '    coalesce(%I, ''{}''::text[]) ||'
      '    coalesce((SELECT array_agg(DISTINCT t.s) FROM jsonb_array_elements_text($1) t(s)), ''{}''::text[])'
      '  ) ORDER BY 1)) %s WHERE id = $2',
      p_reg.target_table, p_reg.target_column, p_reg.target_column, v_extra)
      USING coalesce(v_val, p_proposed), p_entity_id;

  WHEN 'jsonb_array_to_text_array' THEN
    EXECUTE format(
      'UPDATE public.%I SET %I = ARRAY(SELECT jsonb_array_elements_text($1)) %s WHERE id = $2',
      p_reg.target_table, p_reg.target_column, v_extra)
      USING coalesce(v_val, p_proposed), p_entity_id;

  WHEN 'geo_latlng' THEN
    -- Two columns from one payload, and only when BOTH are present.
    EXECUTE format(
      'UPDATE public.%I SET %I = ($1->>''lat'')::numeric, %I = ($1->>''lng'')::numeric %s '
      'WHERE id = $2 AND $1->>''lat'' IS NOT NULL AND $1->>''lng'' IS NOT NULL',
      p_reg.target_table,
      p_reg.apply_args->>'lat_col', p_reg.apply_args->>'lng_col', v_extra)
      USING coalesce(v_val, p_proposed), p_entity_id;

  WHEN 'jsonb_shallow_merge' THEN
    -- Merge ONE key into a jsonb map column, leaving every sibling key alone.
    v_key  := nullif(btrim(coalesce(p_reg.apply_args->>'merge_key', '')), '');
    v_text := nullif(btrim(v_text), '');
    IF v_key IS NULL THEN
      RAISE EXCEPTION 'apply_args.merge_key is required for jsonb_shallow_merge (field %)', p_reg.field
        USING ERRCODE = '22023';
    END IF;
    IF v_text IS NULL THEN
      RAISE EXCEPTION 'proposed_value.% is empty for field %', p_reg.value_key, p_reg.field
        USING ERRCODE = '22023';
    END IF;
    EXECUTE format(
      'UPDATE public.%I SET %I = coalesce(%I, ''{}''::jsonb) || jsonb_build_object($1::text, $2::text) %s '
      'WHERE id = $3',
      p_reg.target_table, p_reg.target_column, p_reg.target_column, v_extra)
      USING v_key, v_text, p_entity_id;

  END CASE;
END $function$;

-- ── 2. Registry rows ────────────────────────────────────────────────────────
--
-- batchable = false is deliberate: bulk-approving porn-profile links without
-- looking at each one is exactly the namesake risk this design exists to
-- avoid. risk_gate stays null — its only legal value is
-- 'criminalizing_destination', which is about location, not identity.

insert into public.review_field_registry
  (entity_type, field, label, target_table, target_column, value_key,
   apply_mode, apply_args, batchable, risk_gate, active)
values
  ('personality', 'social_links.pornhub',  'Pornhub profile',  'personalities', 'social_links', 'value',
   'jsonb_shallow_merge', '{"merge_key":"pornhub","touch":["updated_at"]}'::jsonb,  false, null, true),
  ('personality', 'social_links.xhamster', 'xHamster profile', 'personalities', 'social_links', 'value',
   'jsonb_shallow_merge', '{"merge_key":"xhamster","touch":["updated_at"]}'::jsonb, false, null, true),
  ('personality', 'social_links.xvideos',  'xVideos profile',  'personalities', 'social_links', 'value',
   'jsonb_shallow_merge', '{"merge_key":"xvideos","touch":["updated_at"]}'::jsonb,  false, null, true)
on conflict (entity_type, field) do update
  set label = excluded.label,
      target_table = excluded.target_table,
      target_column = excluded.target_column,
      value_key = excluded.value_key,
      apply_mode = excluded.apply_mode,
      apply_args = excluded.apply_args,
      batchable = excluded.batchable,
      active = excluded.active;

-- ── 3. Point the personality triage view at the UNIFIED queue ───────────────
--
-- The B1 consolidation (20260801130000) renamed the five per-entity review
-- tables to *_legacy, created ONE `entity_review_queue`, and put compat VIEWS
-- back under the original names — but `triage_src_quality_personality` was
-- left reading `personality_review_queue_legacy` directly. That table now
-- holds 0 rows, so anything an enricher writes to the unified queue is
-- INVISIBLE in the admin inbox.
--
-- Scoped fix: only the personality view, because this feature depends on it
-- (and it currently surfaces nothing either way). The other four views have
-- the identical defect and between them hide 1,715 open reviews — that is a
-- separate bug and a separate change.

create or replace view public.triage_src_quality_personality as
  select q.id,
         'quality-personality'::text as queue_type,
         'personalities'::text       as content_type,
         (coalesce(p.name, 'Personality'::text) || ' — '::text) || q.field as title,
         coalesce(q.model, 'engine'::text) as subtitle,
         q.status,
         q.confidence::numeric as confidence_score,
         q.created_at,
         'personality-truth-engine'::text as source,
         q.entity_id,
         'personalities'::text as entity_table,
         true as has_diff,
         null::uuid as reporter_id,
         jsonb_build_object('field', q.field, 'proposed_value', q.proposed_value,
                            'citations', q.citations, 'model', q.model) as meta,
         null::text as flag_type,
         -- `namesake` marks the rows a reviewer must not rubber-stamp: an
         -- adult-profile link resolved from a name alone.
         jsonb_build_object('identity', true,
                            'namesake', q.field like 'social_links.%') as risk_flags
    from public.entity_review_queue q
    left join public.personalities p on p.id = q.entity_id
   where q.status = 'open'
     and q.entity_type = 'personality';

-- ── 4. Circuit breakers ─────────────────────────────────────────────────────
--
-- checkCircuit() ALLOWS BY DEFAULT when no row exists, so an unseeded breaker
-- can never trip — the same hole that left wikipedia.api / wikidata.api /
-- osm.nominatim unprotected until they were seeded.

insert into public.api_circuit_breakers (api_name, state, threshold, reset_timeout_seconds)
values ('adult.pornhub',  'closed', 5, 600),
       ('adult.xhamster', 'closed', 5, 600),
       ('adult.xvideos',  'closed', 5, 600)
on conflict (api_name) do nothing;

-- ── 5. Work selector ────────────────────────────────────────────────────────
--
-- Ordering is `last_attempt_at asc nulls first` — a ROUND-ROBIN CURSOR, not a
-- quality score. The city engine stalled for 36 days because its selector
-- ordered by a nightly-recomputed completeness score and so kept re-picking
-- the same starved head of the queue.
--
-- `data_unavailable` is the terminal sentinel: after 3 misses a (row,
-- platform) pair drops out of the pool for good, which is what stops the
-- nightly cron re-probing thousands of names that will never resolve.

create or replace function public.personalities_due_for_adult_links(p_limit int default 40)
returns table (
  id              uuid,
  name            text,
  slug            text,
  is_living       boolean,
  encyclopedic    boolean,
  single_token    boolean,
  missing         text[],
  last_attempt_at timestamptz
)
language sql stable
security definer set search_path to 'public', 'pg_temp'
as $$
  with plat(k) as (select unnest(array['pornhub','xhamster','xvideos']))
  select p.id,
         p.name,
         p.slug,
         p.is_living,
         exists (select 1
                   from public.personality_sources s
                  where s.personality_id = p.id
                    and s.source_slug in ('wikidata','wikipedia'))          as encyclopedic,
         (p.name !~ '\s')                                                   as single_token,
         array(select plat.k
                 from plat
                where not (coalesce(p.social_links,'{}'::jsonb) ? plat.k)
                  and coalesce(p.enrichment_status->'adult_links'->plat.k->>'state','')
                      <> 'data_unavailable')                                as missing,
         (p.enrichment_status->'adult_links'->>'last_attempt_at')::timestamptz as last_attempt_at
    from public.personalities p
   where p.is_adult
     and p.duplicate_of_id is null
     and coalesce(p.review_status,'') <> 'archived'
     and exists (select 1
                   from plat
                  where not (coalesce(p.social_links,'{}'::jsonb) ? plat.k)
                    and coalesce(p.enrichment_status->'adult_links'->plat.k->>'state','')
                        <> 'data_unavailable')
   order by (p.enrichment_status->'adult_links'->>'last_attempt_at')::timestamptz asc nulls first,
            p.id
   limit greatest(1, least(p_limit, 200));
$$;

revoke all on function public.personalities_due_for_adult_links(int) from public;
grant execute on function public.personalities_due_for_adult_links(int) to service_role;

comment on function public.personalities_due_for_adult_links(int) is
  'Work list for personality-link-adult-profiles. Round-robin by last_attempt_at; '
  'excludes rows whose per-platform state reached the data_unavailable sentinel.';

-- ── 6. Registry row FIRST, then the cron job ────────────────────────────────
--
-- admin_automations is the registry of record and sync_automations_to_cron()
-- reconciles pg_cron against it, so the row has to exist before the job.
-- Retiring this later means DISABLING the row — a bare cron.unschedule() is
-- undone by the next reconciler pass, and a DELETE makes the live job
-- "unregistered", which the reconciler reports and deliberately never kills.
--
-- 02:35 UTC is a free slot (the neighbours are 03:05, 03:10, 03:15, 03:20).

insert into public.admin_automations
  (slug, name, description, managed_by, enabled, "trigger", schedule, action)
values (
  'personality_adult_links',
  'Link adult performers to platform profiles',
  'Probes pornhub/xhamster/xvideos for each adult performer''s profile. '
  || 'Auto-applies only self-proving matches; everything else goes to entity_review_queue.',
  'system', true,
  jsonb_build_object('type','schedule'),
  '35 2 * * *',
  jsonb_build_object('type','cron','jobname','personality_adult_links','command', $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/personality-link-adult-profiles',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'WEBHOOK_SECRET')),
    body := jsonb_build_object('batch_size', 40),
    timeout_milliseconds := 55000);
  $cmd$))
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description,
      schedule = excluded.schedule,
      action = excluded.action,
      enabled = true;

select cron.schedule('personality_adult_links', '35 2 * * *', $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/personality-link-adult-profiles',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'WEBHOOK_SECRET')),
    body := jsonb_build_object('batch_size', 40),
    timeout_milliseconds := 55000);
$cmd$)
where not exists (select 1 from cron.job where jobname = 'personality_adult_links');
