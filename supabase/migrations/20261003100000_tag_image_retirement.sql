-- ============================================================================
-- Glossary photography retirement (2026-08-28)
-- ----------------------------------------------------------------------------
-- Decision: tags render drawn TagPlates (DepartmentArt grammar, pink track),
-- never photographs. The photo corpus this clears was unsalvageable as a
-- system: 1,590 active-tag photos sourced by taking the TOP-1 Pexels/Unsplash
-- hit for a keyword-mapped tag name — no scoring, no content-match check — and
-- 1,262 of them with no recoverable license (see 20260921100000's measurement).
-- The photo-densest categories were the kink vocabularies (BDSM 202/295,
-- Fetishes 184/309), where an arbitrary stock photo is not a neutral mistake.
--
-- Everything is preserved before it is cleared: `tag_image_retirement` keeps
-- every row's image columns (7,143 rows across active/deprecated/merged), and
-- the R2 objects + `image_assets` DAM rows are untouched. The columns stay in
-- the schema — dropping them would break the generated types and the
-- `image_assets` backfill history for no benefit.
--
-- Writers removed in the same change (frontend/functions side): the
-- store-tag-images edge fn (deleted), tag-enrichment-sweep's fillImage branch,
-- bulk-create-ai-tags' fetchAndStoreImage, the admin form's TagImageUpload and
-- the CMS media group. DB-side, this migration retires the provenance sync
-- cron and re-points the hygiene gate: `active_tags_with_image_url` is a
-- zero-invariant that hard-fails CI if any writer regrows the corpus.
--
-- Cost note: the UPDATE fires `trg_search_documents_tag` (column-scoped ON
-- image_url) per row → ~7k rows enqueued into search_reindex_queue, drained at
-- 1000/min — a few minutes of queue depth, no inline index storm. The
-- unified_tags audit trigger writes the same count of change-log rows. One-off.

-- ── 1. Preserve, then clear ─────────────────────────────────────────────────

create table if not exists public.tag_image_retirement (
  tag_id            uuid primary key,
  slug              text not null,
  status            text not null,
  image_url         text,
  image_alt         text,
  image_source      text,
  image_license     text,
  image_attribution text,
  image_prompt      text,
  retired_at        timestamptz not null default now()
);

comment on table public.tag_image_retirement is
  'Snapshot of unified_tags image columns taken by the 2026-08-28 glossary '
  'photography retirement, before they were nulled. Reversal source of record; '
  'no FK so the snapshot outlives tag deletions. Service-role only.';

-- No anon/authenticated access: RLS on with no policies (service role bypasses).
alter table public.tag_image_retirement enable row level security;
revoke all on public.tag_image_retirement from anon, authenticated;

insert into public.tag_image_retirement
  (tag_id, slug, status, image_url, image_alt, image_source, image_license,
   image_attribution, image_prompt)
select id, slug, status, image_url, image_alt, image_source, image_license,
       image_attribution, image_prompt
from public.unified_tags
where image_url is not null or image_alt is not null or image_source is not null
   or image_license is not null or image_attribution is not null
   or image_prompt is not null
on conflict (tag_id) do nothing;

-- The i18n companions (image_alt_i18n / image_attribution_i18n) are '{}' on
-- every row — measured 0 non-empty — so they are deliberately not touched:
-- clearing them would turn a 7k-row update into a 9.5k-row one for nothing.
update public.unified_tags
set image_url = null,
    image_alt = null,
    image_source = null,
    image_license = null,
    image_attribution = null,
    image_prompt = null
where image_url is not null or image_alt is not null or image_source is not null
   or image_license is not null or image_attribution is not null
   or image_prompt is not null;

-- ── 2. Retire the Commons provenance sync ───────────────────────────────────
-- It backfilled image_license/attribution by matching image_url against
-- Commons; with image_url null everywhere it can only ever no-op. Registry row
-- FIRST, then guarded unschedule — the 20260813100000 pattern; a bare
-- cron.unschedule is undone by sync_automations_to_cron branch (d).

update public.admin_automations
set enabled = false,
    description = coalesce(description, '')
      || ' [RETIRED 2026-08-28: glossary photography removed wholesale (TagPlate '
      || 'change); unified_tags.image_url is null on every row, so the Commons '
      || 'provenance match can never fire again. Kept disabled rather than '
      || 'deleted so sync_automations_to_cron cannot re-arm it.]',
    updated_at = now()
where slug = 'tag_image_provenance_sync'
  and enabled;

select cron.unschedule('tag_image_provenance_sync')
where exists (
  select 1 from cron.job where jobname = 'tag_image_provenance_sync'
);

-- ── 3. Hygiene gate: add the regrowth zero-invariant ────────────────────────
-- `active_tags_with_image_url` watches the only thing that can now go wrong:
-- a writer reintroducing photos. Baseline 0, hard gate
-- (scripts/tag-hygiene-baseline.json + src/lib/tagHygieneMetrics.ts move in
-- lockstep — pinned by src/lib/__tests__/tagHygienePanelMetrics.test.ts).
--
-- The three legacy image metrics (image_without_license,
-- commons_image_without_license, image_alt_column_empty) are KEPT for the
-- transition even though they measure a corpus this migration clears (they all
-- read 0 afterwards): the CI gate measures PROD on pull_request, so removing
-- them from the SQL and baseline in the same PR would fail every PR run until
-- this migration applies on merge — the exact deadlock the
-- merged_but_not_status_merged note in the baseline documents. A follow-up
-- migration may drop all three once this one is live, updating the baseline
-- and panel in the same change.
--
-- Body otherwise byte-identical to 20260928143000, including the OR-split in
-- event_tag_strings_unresolved (re-merging it restores a 4M-row nested loop
-- and the PostgREST timeout) and the 4-space key indentation the drift test's
-- key scan depends on.

create or replace function public.tag_hygiene_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare v jsonb;
begin
  perform assert_admin_or_internal();

  with active as (
    select * from unified_tags where status = 'active' and merged_into_id is null
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'active_tags', (select count(*) from active),
      'categories',  (select count(*) from tag_categories),
      'assignments', (select count(*) from unified_tag_assignments)
    ),
    'uncategorized_active', (
      select count(*) from active where category_id is null
        and slug !~ '^(mat|vibe|occ|dept|attr|own|rating)-'),
    'dangling_category_id', (
      select count(*) from unified_tags u where u.category_id is not null
        and not exists (select 1 from tag_categories c where c.id = u.category_id)),
    -- Zero-invariant since the 2026-08-28 photo retirement: tags render drawn
    -- TagPlates, and every image writer was removed. Non-zero means one is back.
    'active_tags_with_image_url', (
      select count(*) from active where image_url is not null),
    -- Legacy trio, transitional — see the section comment above. All read 0
    -- after this migration's UPDATE; kept so the prod-measuring PR gate stays
    -- green across the merge window.
    'image_without_license', (
      select count(*) from active where image_url is not null and image_license is null),
    'commons_image_without_license', (
      select count(*) from active
       where image_url like 'https://upload.wikimedia.org/%' and image_license is null),
    'image_alt_column_empty', (
      select count(*) from active where image_url is not null
        and nullif(btrim(image_alt), '') is null),
    'assignment_to_non_active_tag', (
      select count(*) from unified_tag_assignments a
       where not exists (select 1 from active t where t.id = a.tag_id)),
    'nonclean_entity_type', (
      select count(*) from unified_tag_assignments
       where entity_type <> lower(btrim(entity_type))),
    'duplicate_active_name', (
      select count(*) from (
        select 1 from active group by lower(btrim(name)) having count(*) > 1) d),
    'redirect_to_non_canonical', (
      select count(*) from tag_slug_redirects r
        join unified_tags t on t.id = r.tag_id
       where t.status <> 'active' or t.merged_into_id is not null),
    'merged_but_not_status_merged', (
      select count(*) from unified_tags
       where merged_into_id is not null and status <> 'merged'),
    'sensitive_without_description', (
      select count(*) from active
       where (is_sensitive or is_adult)
         and coalesce(nullif(btrim(description), ''), short_description) is null),
    'indexable_without_description', (
      select count(*) from active
       where seo_indexable
         and coalesce(nullif(btrim(description), ''), short_description) is null),
    -- `not (A or B)` split into `not A and not B` so each arm can use its own
    -- functional index. Re-merging them into one OR silently restores the
    -- 4M-row nested loop that put this function over the PostgREST timeout.
    'event_tag_strings_unresolved', (
      select count(*) from (
        select distinct lower(btrim(t)) as s
          from events, unnest(coalesce(tags, '{}'::text[])) t
         where btrim(t) <> ''
      ) e
      where not exists (select 1 from unified_tags u where lower(u.name) = e.s)
        and not exists (select 1 from unified_tags u where lower(u.slug) = e.s)),
    -- Drains to 0 as the cron works through the backlog. Non-zero after that
    -- means the job stopped running.
    'events_with_tags_unlinked', (
      select count(*) from events e
       where coalesce(array_length(e.tags, 1), 0) > 0
         and not exists (
           select 1 from unified_tag_assignments a
            where a.entity_id = e.id and a.entity_type = 'event'))
  ) into v;

  return v;
end;
$fn$;

-- ── 4. Quality scorer: drop the image dimension ─────────────────────────────
-- image_url can only ever be null now, so keeping c_image at weight 0.13 would
-- permanently cap every tag at 87. The remaining six dimensions are re-scaled
-- proportionally (0.87 → 1.00): desc .22→.25, category .15→.17, i18n .15→.17,
-- links .10→.12, used .15→.17, embedding .10→.12. Body otherwise unchanged
-- from the live definition (run bookkeeping, pause gate, IS DISTINCT guard).

create or replace function public.run_tag_quality_recompute()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_changed       int := 0;
  v_examined      int := 0;
  v_locales       text[] := ARRAY['de','fr','es','it','pt','nl','pl','ru','tr','uk','sv'];
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'tag_quality_recompute';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'tag_quality_recompute', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  WITH scope AS (
    SELECT t.id, t.description, t.category_id, t.description_i18n,
           t.wikidata_id, t.wikipedia_url, t.human_reviewed, t.verification_status
    FROM public.unified_tags t
    WHERE t.status = 'active'
  ),
  comp AS (
    SELECT s.id,
      CASE WHEN s.description IS NULL OR length(trim(s.description))=0 THEN 0.0
           WHEN length(trim(s.description)) < 30 THEN 0.4
           ELSE 1.0 END                                                          AS c_desc,
      CASE WHEN EXISTS (SELECT 1 FROM public.tag_category_assignments a WHERE a.tag_id=s.id)
           THEN 1.0 ELSE 0.0 END                                                 AS c_category,
      (SELECT count(*) FROM unnest(v_locales) l
         WHERE coalesce(s.description_i18n ->> l,'') <> '')::numeric
         / array_length(v_locales,1)                                             AS c_i18n,
      CASE WHEN s.wikidata_id IS NOT NULL OR s.wikipedia_url IS NOT NULL
           THEN 1.0 ELSE 0.0 END                                                 AS c_links,
      CASE WHEN EXISTS (SELECT 1 FROM public.unified_tag_assignments u WHERE u.tag_id=s.id)
           THEN 1.0 ELSE 0.0 END                                                 AS c_used,
      CASE WHEN EXISTS (SELECT 1 FROM public.tag_embeddings e WHERE e.tag_id=s.id)
           THEN 1.0 ELSE 0.0 END                                                 AS c_embed,
      LEAST(1.0, GREATEST(0.0,
        CASE WHEN s.human_reviewed IS TRUE THEN 1.0
             ELSE (CASE s.verification_status
                     WHEN 'reviewed' THEN 0.9 WHEN 'auto' THEN 0.5
                     WHEN 'unverified' THEN 0.3 ELSE 0.3 END)
                  + CASE WHEN s.wikidata_id IS NOT NULL OR s.wikipedia_url IS NOT NULL THEN 0.1 ELSE 0 END
                  + CASE WHEN EXISTS (SELECT 1 FROM public.tag_sources ts WHERE ts.tag_id=s.id) THEN 0.05 ELSE 0 END
        END))                                                                    AS c_conf
    FROM scope s
  ),
  final AS (
    SELECT id,
      round(100 * (0.25*c_desc + 0.17*c_category + 0.17*c_i18n
                 + 0.12*c_links + 0.17*c_used + 0.12*c_embed))::numeric          AS new_score,
      round(c_conf, 2)                                                           AS new_conf,
      jsonb_build_object(
        'desc', round(c_desc,2), 'category', round(c_category,2),
        'i18n', round(c_i18n,2), 'links', round(c_links,2), 'used', round(c_used,2),
        'embedding', round(c_embed,2)
      )                                                                          AS breakdown
    FROM comp
  )
  UPDATE public.unified_tags t
    SET quality_score = f.new_score,
        quality_breakdown = f.breakdown,
        confidence_score = f.new_conf,
        last_quality_at = now()
  FROM final f
  WHERE t.id = f.id
    AND (t.quality_score IS DISTINCT FROM f.new_score
         OR t.quality_breakdown IS DISTINCT FROM f.breakdown
         OR t.confidence_score IS DISTINCT FROM f.new_conf);
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  SELECT count(*) INTO v_examined FROM public.unified_tags WHERE status='active';

  UPDATE public.admin_automation_runs
    SET finished_at=now(), items_examined=v_examined, items_changed=v_changed,
        summary=jsonb_build_object('rescored',v_changed,'examined',v_examined) WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('rescored',v_changed,'examined',v_examined);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $function$;

-- ── 5. Content selector: a missing image is no longer work ──────────────────
-- Signature kept (image_url stays in the RETURNS TABLE, now always null) so no
-- DROP FUNCTION / dependent-object dance; only the WHERE arm goes. Without
-- this, every non-sensitive tag would qualify as "due" forever.

create or replace function public.tags_due_for_content(p_limit integer DEFAULT 20)
returns table(id uuid, name text, description text, image_url text, wikidata_id text, wikipedia_url text, is_sensitive boolean, is_adult boolean)
language sql
stable security definer
set search_path to 'public'
as $function$
  select t.id, t.name, t.description, t.image_url, t.wikidata_id, t.wikipedia_url,
         t.is_sensitive, t.is_adult
  from public.unified_tags t
  where t.status = 'active'
    and (
      (t.wikidata_id is null and t.wikipedia_url is null)
      or ((t.description is null or length(t.description) < 30)
          and not (coalesce(t.is_sensitive,false) or coalesce(t.is_adult,false))
          and not exists (
            select 1 from public.ai_suggestions s
            where s.entity_type = 'unified_tags' and s.entity_id = t.id
              and s.suggestion_type = 'description' and s.status = 'pending'
          ))
    )
  order by t.quality_score asc nulls first, t.id
  limit greatest(1, least(p_limit, 50));
$function$;
