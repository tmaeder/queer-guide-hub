-- ============================================================================
-- Unified Guides (3/4): backfill from the five legacy sources.
--
-- Source UUIDs are PRESERVED so reads / participations / contributions copy
-- 1:1 with zero remapping (uuid v4 collisions across systems are not a real
-- risk, but every INSERT still guards with ON CONFLICT DO NOTHING + a count
-- assertion that RAISEs — CI db push fails loudly instead of dropping rows).
--
-- Slug collisions across sources: insert order = marketplace → venue → event →
-- quests → rails; a later source colliding on slug gets '-<format-or-source>'
-- suffixed and a guide_slug_redirects row for its original slug.
--
-- Volumes are editorial-scale (tens of rows) — set-based single statements,
-- no batching pressure. The pick_count statement trigger fires once per
-- INSERT statement.
-- ============================================================================

DO $$
DECLARE
  v_src bigint; v_dst bigint;
BEGIN
  -- ── marketplace_guides → guides (format=guide, primary=marketplace) ─────
  INSERT INTO public.guides
    (id, format, slug, title, dek, intro_md, hero_image_path, category,
     primary_entity_type, city_id, audience_tags, status, published_at,
     author_id, reading_time_min, review_due_at, is_featured, meta,
     created_at, updated_at)
  SELECT g.id, 'guide',
         CASE WHEN EXISTS (SELECT 1 FROM public.guides x WHERE x.slug = n.s)
              THEN n.s || '-marketplace' ELSE n.s END,
         g.title, g.dek, g.intro_md, g.hero_image_path, g.category_slug,
         'marketplace', g.city_id, g.audience_tags, g.status, g.published_at,
         g.author_id, g.reading_time_min, g.review_due_at, g.is_featured,
         g.meta || jsonb_build_object('legacy_source', 'marketplace_guides'),
         g.created_at, g.updated_at
  FROM public.marketplace_guides g,
       LATERAL (SELECT btrim(regexp_replace(lower(g.slug), '[^a-z0-9]+', '-', 'g'), '-') AS s) n
  ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO v_src FROM public.marketplace_guides;
  SELECT COUNT(*) INTO v_dst FROM public.guides WHERE meta->>'legacy_source' = 'marketplace_guides';
  IF v_src <> v_dst THEN
    RAISE EXCEPTION 'unified_guides_backfill: marketplace_guides % -> %', v_src, v_dst;
  END IF;

  -- ── venue_guides → guides (format=guide, primary=venue) ─────────────────
  INSERT INTO public.guides
    (id, format, slug, title, dek, intro_md, hero_image_path, category,
     primary_entity_type, city_id, audience_tags, status, published_at,
     author_id, reading_time_min, review_due_at, is_featured, meta,
     created_at, updated_at)
  SELECT g.id, 'guide',
         CASE WHEN EXISTS (SELECT 1 FROM public.guides x WHERE x.slug = n.s)
              THEN n.s || '-venues' ELSE n.s END,
         g.title, g.dek, g.intro_md, g.hero_image_path, g.category,
         'venue', g.city_id, g.audience_tags, g.status, g.published_at,
         g.author_id, g.reading_time_min, g.review_due_at, g.is_featured,
         g.meta || jsonb_build_object('legacy_source', 'venue_guides'),
         g.created_at, g.updated_at
  FROM public.venue_guides g,
       LATERAL (SELECT btrim(regexp_replace(lower(g.slug), '[^a-z0-9]+', '-', 'g'), '-') AS s) n
  ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO v_src FROM public.venue_guides;
  SELECT COUNT(*) INTO v_dst FROM public.guides WHERE meta->>'legacy_source' = 'venue_guides';
  IF v_src <> v_dst THEN
    RAISE EXCEPTION 'unified_guides_backfill: venue_guides % -> %', v_src, v_dst;
  END IF;

  -- ── event_guides → guides (format=guide, primary=event) ─────────────────
  INSERT INTO public.guides
    (id, format, slug, title, dek, intro_md, hero_image_path, category,
     primary_entity_type, city_id, audience_tags, status, published_at,
     author_id, reading_time_min, review_due_at, is_featured, meta,
     created_at, updated_at)
  SELECT g.id, 'guide',
         CASE WHEN EXISTS (SELECT 1 FROM public.guides x WHERE x.slug = n.s)
              THEN n.s || '-events' ELSE n.s END,
         g.title, g.dek, g.intro_md, g.hero_image_path, g.event_type,
         'event', g.city_id, g.audience_tags, g.status, g.published_at,
         g.author_id, g.reading_time_min, g.review_due_at, g.is_featured,
         g.meta || jsonb_build_object('legacy_source', 'event_guides'),
         g.created_at, g.updated_at
  FROM public.event_guides g,
       LATERAL (SELECT btrim(regexp_replace(lower(g.slug), '[^a-z0-9]+', '-', 'g'), '-') AS s) n
  ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO v_src FROM public.event_guides;
  SELECT COUNT(*) INTO v_dst FROM public.guides WHERE meta->>'legacy_source' = 'event_guides';
  IF v_src <> v_dst THEN
    RAISE EXCEPTION 'unified_guides_backfill: event_guides % -> %', v_src, v_dst;
  END IF;

  -- ── quests → guides (format=quest; lifecycle derived from window) ───────
  INSERT INTO public.guides
    (id, format, slug, title, intro_md, hero_image_path, category,
     audience_tags, status, starts_at, ends_at, criteria, recap_article_id,
     published_at, author_id, meta, created_at, updated_at)
  SELECT q.id, 'quest',
         CASE WHEN EXISTS (SELECT 1 FROM public.guides x WHERE x.slug = n.s)
              THEN n.s || '-quest' ELSE n.s END,
         q.title, q.brief_md, q.hero_image_url, q.theme,
         '{}'::text[],
         CASE q.status
           WHEN 'draft' THEN 'draft'
           WHEN 'archived' THEN 'archived'
           ELSE 'published'   -- scheduled|active|completed → window derives phase
         END,
         q.starts_at, q.ends_at, q.criteria_json, q.recap_article_id,
         CASE WHEN q.status IN ('scheduled','active','completed') THEN q.starts_at END,
         q.created_by,
         jsonb_build_object('legacy_source', 'quests',
                            'legacy_status', q.status,
                            'hero_is_url', (q.hero_image_url ~* '^https?://')),
         q.created_at, q.updated_at
  FROM public.quests q,
       LATERAL (SELECT btrim(regexp_replace(lower(q.slug), '[^a-z0-9]+', '-', 'g'), '-') AS s) n
  ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO v_src FROM public.quests;
  SELECT COUNT(*) INTO v_dst FROM public.guides WHERE meta->>'legacy_source' = 'quests';
  IF v_src <> v_dst THEN
    RAISE EXCEPTION 'unified_guides_backfill: quests % -> %', v_src, v_dst;
  END IF;

  -- ── editorial_rails → guides (format=list) ──────────────────────────────
  INSERT INTO public.guides
    (id, format, slug, title, dek, primary_entity_type, audience_tags,
     status, starts_at, ends_at, meta, created_at, updated_at)
  SELECT r.id, 'list',
         CASE WHEN EXISTS (SELECT 1 FROM public.guides x WHERE x.slug = n.s)
              THEN n.s || '-list' ELSE n.s END,
         r.title, r.editor_note,
         CASE r.entity_type::text
           WHEN 'country' THEN 'country'
           WHEN 'city' THEN 'city'
           WHEN 'village' THEN 'queer_village'
         END,
         '{}'::text[],
         CASE r.status::text
           WHEN 'draft' THEN 'draft'
           WHEN 'published' THEN 'published'
           WHEN 'archived' THEN 'archived'
         END,
         r.starts_at, r.ends_at,
         jsonb_build_object('legacy_source', 'editorial_rails',
                            'rail_position', r.position,
                            'cluster_id', r.cluster_id),
         r.created_at, r.updated_at
  FROM public.editorial_rails r,
       LATERAL (SELECT btrim(regexp_replace(lower(r.slug), '[^a-z0-9]+', '-', 'g'), '-') AS s) n
  ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO v_src FROM public.editorial_rails;
  SELECT COUNT(*) INTO v_dst FROM public.guides WHERE meta->>'legacy_source' = 'editorial_rails';
  IF v_src <> v_dst THEN
    RAISE EXCEPTION 'unified_guides_backfill: editorial_rails % -> %', v_src, v_dst;
  END IF;

  -- Rails were published without published_at; stamp for ordering.
  UPDATE public.guides
     SET published_at = COALESCE(published_at, created_at)
   WHERE status = 'published' AND published_at IS NULL
     AND meta->>'legacy_source' IN ('editorial_rails','quests');

  -- ── slug redirects for every suffixed slug ──────────────────────────────
  INSERT INTO public.guide_slug_redirects (old_slug, guide_id)
  SELECT src.slug, src.id FROM (
    SELECT g.slug, g.id FROM public.marketplace_guides g
    UNION ALL SELECT g.slug, g.id FROM public.venue_guides g
    UNION ALL SELECT g.slug, g.id FROM public.event_guides g
    UNION ALL SELECT q.slug, q.id FROM public.quests q
    UNION ALL SELECT r.slug, r.id FROM public.editorial_rails r
  ) src
  JOIN public.guides u ON u.id = src.id AND u.slug <> src.slug
  ON CONFLICT (old_slug) DO NOTHING;
END $$;

-- ── picks ───────────────────────────────────────────────────────────────────

DO $$
DECLARE v_src bigint; v_dst bigint;
BEGIN
  INSERT INTO public.guide_picks
    (id, guide_id, entity_type, entity_id, tier, rationale_md, pros, cons,
     position, created_at, updated_at)
  SELECT p.id, p.guide_id, 'marketplace', p.listing_id, p.tier, p.rationale_md,
         p.pros, p.cons, p.position, p.created_at, p.updated_at
  FROM public.marketplace_guide_picks p
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.guide_picks
    (id, guide_id, entity_type, entity_id, tier, rationale_md, pros, cons,
     position, created_at, updated_at)
  SELECT p.id, p.guide_id, 'venue', p.venue_id, p.tier, p.rationale_md,
         p.pros, p.cons, p.position, p.created_at, p.updated_at
  FROM public.venue_guide_picks p
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.guide_picks
    (id, guide_id, entity_type, entity_id, tier, rationale_md, pros, cons,
     position, created_at, updated_at)
  SELECT p.id, p.guide_id, 'event', p.event_id, p.tier, p.rationale_md,
         p.pros, p.cons, p.position, p.created_at, p.updated_at
  FROM public.event_guide_picks p
  ON CONFLICT (id) DO NOTHING;

  -- Rail items (composite PK, no uuid id of their own): tier NULL, position kept.
  INSERT INTO public.guide_picks
    (guide_id, entity_type, entity_id, tier, position)
  SELECT i.rail_id,
         CASE r.entity_type::text
           WHEN 'country' THEN 'country'
           WHEN 'city' THEN 'city'
           WHEN 'village' THEN 'queer_village'
         END,
         i.entity_id, NULL, i.position
  FROM public.editorial_rail_items i
  JOIN public.editorial_rails r ON r.id = i.rail_id
  ON CONFLICT (guide_id, entity_type, entity_id) DO NOTHING;

  SELECT (SELECT COUNT(*) FROM public.marketplace_guide_picks)
       + (SELECT COUNT(*) FROM public.venue_guide_picks)
       + (SELECT COUNT(*) FROM public.event_guide_picks)
       + (SELECT COUNT(*) FROM public.editorial_rail_items)
    INTO v_src;
  SELECT COUNT(*) INTO v_dst FROM public.guide_picks;
  IF v_dst < v_src THEN
    RAISE EXCEPTION 'unified_guides_backfill: picks % -> % (loss)', v_src, v_dst;
  END IF;

  -- Belt-and-braces: assert the statement triggers left pick_count consistent.
  IF EXISTS (
    SELECT 1 FROM public.guides g
    WHERE g.pick_count <> (SELECT COUNT(*) FROM public.guide_picks p
                            WHERE p.guide_id = g.id AND NOT p.is_orphaned)
  ) THEN
    RAISE EXCEPTION 'unified_guides_backfill: pick_count desync after backfill';
  END IF;
END $$;

-- ── sections / reads ────────────────────────────────────────────────────────

INSERT INTO public.guide_sections (id, guide_id, position, kind, body_md, created_at, updated_at)
SELECT s.id, s.guide_id, s.position, s.kind, s.body_md, s.created_at, s.updated_at
FROM public.marketplace_guide_sections s
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.guide_sections (id, guide_id, position, kind, body_md, created_at, updated_at)
SELECT s.id, s.guide_id, s.position, s.kind, s.body_md, s.created_at, s.updated_at
FROM public.venue_guide_sections s
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.guide_reads (user_id, guide_id, started_at, completed_at, scroll_pct)
SELECT r.user_id, r.guide_id, r.started_at, r.completed_at, r.scroll_pct
FROM public.marketplace_guide_reads r
ON CONFLICT (user_id, guide_id) DO NOTHING;

INSERT INTO public.guide_reads (user_id, guide_id, started_at, completed_at, scroll_pct)
SELECT r.user_id, r.guide_id, r.started_at, r.completed_at, r.scroll_pct
FROM public.venue_guide_reads r
ON CONFLICT (user_id, guide_id) DO NOTHING;

-- ── participation module ────────────────────────────────────────────────────
-- Direct INSERT..SELECT; the quest-only guard trigger passes because every
-- source quest became format='quest'.

INSERT INTO public.guide_participations
  (id, user_id, guide_id, opted_in_public, display_name, progress_json, joined_at, completed_at)
SELECT p.id, p.user_id, p.quest_id, p.opted_in_public, p.display_name,
       p.progress_json, p.joined_at, p.completed_at
FROM public.quest_participations p
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.guide_contributions
  (id, guide_id, user_id, submission_id, entity_type, entity_id, status, created_at)
SELECT c.id, c.quest_id, c.user_id, c.submission_id,
       CASE c.entity_table
         WHEN 'venues' THEN 'venue'
         WHEN 'events' THEN 'event'
         WHEN 'personalities' THEN 'personality'
         WHEN 'news_articles' THEN 'news'
         WHEN 'cities' THEN 'city'
         WHEN 'marketplace_listings' THEN 'marketplace'
         ELSE c.entity_table
       END,
       c.entity_id, c.status, c.created_at
FROM public.quest_contributions c
ON CONFLICT (id) DO NOTHING;

UPDATE public.community_submissions
   SET guide_id = quest_id
 WHERE quest_id IS NOT NULL AND guide_id IS NULL;

DO $$
DECLARE v_src bigint; v_dst bigint;
BEGIN
  SELECT COUNT(*) INTO v_src FROM public.quest_participations;
  SELECT COUNT(*) INTO v_dst FROM public.guide_participations;
  IF v_dst < v_src THEN
    RAISE EXCEPTION 'unified_guides_backfill: participations % -> %', v_src, v_dst;
  END IF;
  SELECT COUNT(*) INTO v_src FROM public.quest_contributions;
  SELECT COUNT(*) INTO v_dst FROM public.guide_contributions;
  IF v_dst < v_src THEN
    RAISE EXCEPTION 'unified_guides_backfill: contributions % -> %', v_src, v_dst;
  END IF;
END $$;

-- ── safety_gated backfill (BEFORE-trigger only fires on new writes) ─────────
UPDATE public.guides g
   SET safety_gated = public.location_is_high_risk(NULL, g.city_id)
 WHERE g.city_id IS NOT NULL
   AND g.safety_gated IS DISTINCT FROM public.location_is_high_risk(NULL, g.city_id);
