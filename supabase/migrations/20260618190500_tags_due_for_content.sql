-- ============================================================================
-- tags_due_for_content — worst-first selector for the enrichment content pass
-- ----------------------------------------------------------------------------
-- The content pass previously selected active tags missing ANY content
-- dimension, worst-first. Sensitive tags (description always review-queued, no
-- auto image) and non-sensitive tags whose description was already queued would
-- stay in that set forever, so every run re-burned its batch window (and a
-- Wikipedia fetch) on tags that can no longer auto-apply anything — starving the
-- genuinely-fillable backlog.
--
-- This selector returns a tag only when it still has an AUTO-FILLABLE gap:
--   - wiki links (wikidata_id/wikipedia_url): auto-fillable for ANY tag
--   - image: auto-fillable only for non-sensitive tags
--   - description: auto-fillable only for non-sensitive tags that don't already
--     have a pending description suggestion (sensitive descriptions always queue)
-- so each run advances. Tags whose only remaining gaps are review-gated are left
-- to Phase 2 (review-queue drain), not re-examined here.
-- ============================================================================
create or replace function public.tags_due_for_content(p_limit int default 20)
returns table (
  id uuid,
  name text,
  description text,
  image_url text,
  wikidata_id text,
  wikipedia_url text,
  is_sensitive boolean,
  is_adult boolean
)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.description, t.image_url, t.wikidata_id, t.wikipedia_url,
         t.is_sensitive, t.is_adult
  from public.unified_tags t
  where t.status = 'active'
    and (
      -- links auto-fillable for any tag
      (t.wikidata_id is null and t.wikipedia_url is null)
      -- image auto-fillable for non-sensitive tags
      or (t.image_url is null
          and not (coalesce(t.is_sensitive,false) or coalesce(t.is_adult,false)))
      -- description auto-fillable: non-sensitive, missing, and not already queued
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
$$;

alter function public.tags_due_for_content(int) owner to postgres;
revoke all on function public.tags_due_for_content(int) from public;
grant execute on function public.tags_due_for_content(int) to service_role, authenticated;
