-- Security advisor remediation (audit 2026-06-01)
-- Clears the 2 ERROR-level + 3 WARN (search_path) advisors. Non-breaking:
--   * view fix changes only the security model (definer -> invoker), not columns
--   * junction-table RLS mirrors the existing public-read / authenticated-write
--     pattern already used by `personalities` and `unified_tags`
--   * search_path pins to the schemas the functions already resolve against
-- Reversible (see ROLLBACK notes at the bottom).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. ERROR: security_definer_view — public.personality_data_health
--    Recreate as SECURITY INVOKER so the querying role's RLS applies.
--    (Admin/service callers are unaffected; service_role still bypasses RLS.)
-- ─────────────────────────────────────────────────────────────────────────
create or replace view public.personality_data_health
with (security_invoker = true) as
 SELECT p.id,
    p.name,
    p.is_living,
    p.death_date,
    p.last_refreshed_at,
    p.view_count,
    p.quality_score,
    p.wikidata_qid IS NULL AS wikidata_qid_missing,
    p.image_url IS NULL AS image_missing,
    (p.description IS NULL OR length(p.description) <= 80) AS description_missing,
    p.birth_date IS NULL AS birth_date_missing,
    p.profession IS NULL AS profession_missing,
    p.nationality IS NULL AS nationality_missing,
        CASE
            WHEN p.is_living THEN 90
            WHEN p.death_date IS NOT NULL AND p.death_date >= (now()::date - 90) AND p.death_date <= now()::date THEN 7
            ELSE 365
        END AS ttl_days,
    (p.last_refreshed_at IS NULL OR p.last_refreshed_at < (now() -
        CASE
            WHEN p.is_living THEN '90 days'::interval
            WHEN p.death_date IS NOT NULL AND p.death_date >= (now()::date - 90) AND p.death_date <= now()::date THEN '7 days'::interval
            ELSE '365 days'::interval
        END)) AS is_stale,
    d.debt_score,
    d.debt_score::double precision * ln((COALESCE(p.view_count, 0) + 2)::double precision) AS priority
   FROM personalities p
     CROSS JOIN LATERAL ( SELECT (
                CASE WHEN p.wikidata_qid IS NULL THEN 15 ELSE 0 END +
                CASE WHEN p.image_url IS NULL THEN 15 ELSE 0 END +
                CASE WHEN p.description IS NULL OR length(p.description) <= 80 THEN 20 ELSE 0 END +
                CASE WHEN p.birth_date IS NULL THEN 10 ELSE 0 END +
                CASE WHEN p.profession IS NULL THEN 10 ELSE 0 END +
                CASE WHEN p.nationality IS NULL THEN 10 ELSE 0 END)::numeric AS debt_score) d
  WHERE COALESCE(p.visibility, 'public'::text) <> 'private'::text AND p.duplicate_of_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. ERROR: rls_disabled_in_public — public.personality_profession_tags
--    Public catalog mapping (profession keyword -> tag). Enable RLS and mirror
--    the tag-system pattern: public read, authenticated write.
--    (service_role bypasses RLS, so pipelines are unaffected.)
-- ─────────────────────────────────────────────────────────────────────────
alter table public.personality_profession_tags enable row level security;

drop policy if exists ppt_public_read on public.personality_profession_tags;
create policy ppt_public_read on public.personality_profession_tags
  for select using (true);

drop policy if exists ppt_authenticated_insert on public.personality_profession_tags;
create policy ppt_authenticated_insert on public.personality_profession_tags
  for insert to authenticated with check (true);

drop policy if exists ppt_authenticated_update on public.personality_profession_tags;
create policy ppt_authenticated_update on public.personality_profession_tags
  for update to authenticated using (true) with check (true);

drop policy if exists ppt_authenticated_delete on public.personality_profession_tags;
create policy ppt_authenticated_delete on public.personality_profession_tags
  for delete to authenticated using (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. WARN: function_search_path_mutable — pin search_path (immutable).
--    Pinned to (public, extensions) so existing unqualified references to
--    tables (public) and extension operators (pg_trgm etc.) keep resolving.
-- ─────────────────────────────────────────────────────────────────────────
alter function public.hamming_hex(a text, b text)
  set search_path = public, extensions;
alter function public.find_near_duplicate_assets(p_phash text, p_max_hamming integer)
  set search_path = public, extensions;
alter function public.collapse_duplicate_image_assets(p_limit integer)
  set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual):
--   create or replace view public.personality_data_health with (security_invoker = false) as <original def>;
--   alter table public.personality_profession_tags disable row level security;
--     drop policy ppt_public_read / ppt_authenticated_insert / _update / _delete on public.personality_profession_tags;
--   alter function ... reset search_path;  -- for each of the 3 functions
-- ─────────────────────────────────────────────────────────────────────────
