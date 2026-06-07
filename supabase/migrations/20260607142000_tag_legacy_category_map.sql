-- ============================================================================
-- Tag Content-Quality: Phase 1 — deterministic legacy category mapping
-- ----------------------------------------------------------------------------
-- Assigns a normalized tag_categories entry to currently-uncategorized ACTIVE
-- tags whose legacy free-text `category` maps UNAMBIGUOUSLY to a level-1
-- category. Ambiguous / generic legacy values (null, 'terms', 'lgbtiq',
-- 'queer wiki', 'relationship', 'kink', 'queer sex', 'tags') are intentionally
-- left for the LLM categorizer (categorize-tags), which reads name+description
-- context and picks the correct subcategory.
--
-- Mechanism: INSERT directly into tag_category_assignments (the source of
-- truth). We deliberately do NOT update unified_tags.category_id in a
-- set-based statement: that fires sync_tag_category_assignment (BEFORE) ->
-- INSERT into tag_category_assignments -> unified_tags_recompute_is_adult
-- (AFTER) -> UPDATE unified_tags, which re-enters the same row and throws
-- "tuple already modified". Inserting assignments directly recomputes is_adult
-- safely (each row touches a different unified_tags row).
-- ============================================================================

WITH legacy_map(legacy, slug) AS (
  VALUES
    ('slang',      'slang-terminology'),
    ('drugs',      'substances-harm-reduction'),
    ('sti',        'sexual-health'),
    ('hotel_vibe', 'accommodation'),
    ('sex toy',    'gear-aesthetics')
)
INSERT INTO public.tag_category_assignments (tag_id, category_id, is_primary)
SELECT t.id, c.id, true
FROM public.unified_tags t
JOIN legacy_map m ON t.category = m.legacy
JOIN public.tag_categories c ON c.slug = m.slug
WHERE t.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM public.tag_category_assignments a WHERE a.tag_id = t.id)
ON CONFLICT (tag_id, category_id) DO NOTHING;
