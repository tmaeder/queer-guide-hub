-- ============================================================================
-- Unified Guides (2/4): RPC surface.
--
-- guides_recommend replaces recommend_guides / recommend_venue_guides /
-- recommend_event_guides (NEW name deliberately — the old recommend_guides has
-- a different return type, so CREATE OR REPLACE can't evolve it and a
-- drop+recreate under the same name would 500 live clients mid-deploy).
-- guide_reading_streak replaces the two per-type streaks (now counts all
-- formats). quest_* RPCs keep their names and arg types but read the new
-- tables — that IS the quest-RPC cutover. guide_picks_maintain is the nightly
-- janitor that keeps polymorphic picks honest (repoints merged targets via
-- duplicate_of_id, tombstones deleted ones) — deliberately the PRIMARY
-- mechanism instead of patching 12 SECURITY DEFINER merge cores whose live
-- definitions drift from the repo.
-- ============================================================================

-- 1. guides_recommend --------------------------------------------------------
-- Unified scorer: home-city 1.0 + interest-jaccard 0.8 + category-affinity 0.6
-- (favorites source keyed on primary_entity_type) + freshness 0.4 + featured
-- 0.3 + active-quest-window 0.6 + continue 0.5 − completed 1.0 − stale 2.0.
-- Includes the 20260702212050 profiles.user_id fix. SECURITY DEFINER bypasses
-- RLS, so the safety gate is enforced inline: anon (p_user_id IS NULL) never
-- sees gated guides.

CREATE OR REPLACE FUNCTION public.guides_recommend(
  p_user_id  UUID,
  p_limit    INT DEFAULT 10,
  p_format   TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID, format TEXT, slug TEXT, title TEXT, dek TEXT, hero_image_path TEXT,
  category TEXT, primary_entity_type TEXT, city_id UUID, audience_tags TEXT[],
  reading_time_min INT, pick_count INT, published_at TIMESTAMPTZ,
  starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
  score NUMERIC, boost_reason TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_home_city_id UUID; v_interests TEXT[];
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT utp.home_city_id INTO v_home_city_id
      FROM public.user_travel_preferences utp WHERE utp.user_id = p_user_id LIMIT 1;
    SELECT COALESCE(
             ARRAY(SELECT jsonb_array_elements_text(p.interests) FROM public.profiles p
                    WHERE p.user_id = p_user_id AND jsonb_typeof(p.interests) = 'array'),
             '{}'::text[])
      INTO v_interests;
  ELSE
    v_interests := '{}'::text[];
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      g.id, g.format, g.slug, g.title, g.dek, g.hero_image_path, g.category,
      g.primary_entity_type, g.city_id, g.audience_tags, g.reading_time_min,
      g.pick_count, g.published_at, g.starts_at, g.ends_at,
      CASE WHEN v_home_city_id IS NOT NULL AND g.city_id = v_home_city_id
           THEN 1.0::numeric ELSE 0.0::numeric END AS s_city,
      CASE
        WHEN array_length(v_interests,1) IS NULL OR array_length(g.audience_tags,1) IS NULL THEN 0.0::numeric
        ELSE 0.8::numeric * (
          cardinality(ARRAY(SELECT unnest(v_interests) INTERSECT SELECT unnest(g.audience_tags)))::numeric
          / NULLIF(cardinality(ARRAY(SELECT unnest(v_interests) UNION SELECT unnest(g.audience_tags))), 0))
      END AS s_interest,
      CASE
        WHEN p_user_id IS NULL OR g.category IS NULL THEN 0.0::numeric
        WHEN g.primary_entity_type = 'marketplace' THEN 0.6::numeric * COALESCE((
          SELECT (SUM(CASE WHEN l.category = g.category THEN 1.0 ELSE 0.0 END)
                  / NULLIF(COUNT(*), 0))::numeric
            FROM public.marketplace_favorites f
            JOIN public.marketplace_listings l ON l.id = f.listing_id
           WHERE f.user_id = p_user_id), 0.0::numeric)
        WHEN g.primary_entity_type = 'venue' THEN 0.6::numeric * COALESCE((
          SELECT (SUM(CASE WHEN v.category = g.category THEN 1.0 ELSE 0.0 END)
                  / NULLIF(COUNT(*), 0))::numeric
            FROM public.venue_favorites f
            JOIN public.venues v ON v.id = f.venue_id
           WHERE f.user_id = p_user_id), 0.0::numeric)
        ELSE 0.0::numeric
      END AS s_category,
      0.4::numeric * exp(
        -GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(g.published_at, g.created_at))) / 86400.0, 0) / 60.0)::numeric AS s_fresh,
      CASE WHEN g.is_featured THEN 0.3::numeric ELSE 0.0::numeric END AS s_featured,
      -- Active quest window: surface running challenges while they can still be joined.
      CASE WHEN g.format = 'quest' AND g.starts_at IS NOT NULL AND g.ends_at IS NOT NULL
                AND now() BETWEEN g.starts_at AND g.ends_at
           THEN 0.6::numeric ELSE 0.0::numeric END AS s_quest_active,
      CASE
        WHEN p_user_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.guide_reads r
           WHERE r.user_id = p_user_id AND r.guide_id = g.id AND r.completed_at IS NOT NULL)
        THEN -1.0::numeric ELSE 0.0::numeric END AS s_completed,
      CASE WHEN g.review_due_at IS NOT NULL AND g.review_due_at < now()
           THEN -2.0::numeric ELSE 0.0::numeric END AS s_stale,
      CASE
        WHEN p_user_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.guide_reads r
           WHERE r.user_id = p_user_id AND r.guide_id = g.id AND r.completed_at IS NULL)
        THEN 0.5::numeric ELSE 0.0::numeric END AS s_continue
    FROM public.guides g
    WHERE g.status = 'published'
      AND (p_format IS NULL OR g.format = p_format)
      AND (p_category IS NULL OR g.category = p_category)
      AND (p_user_id IS NOT NULL OR NOT g.safety_gated)
      -- Ended quests fall out of recommendations (their recap article carries on).
      AND NOT (g.format = 'quest' AND g.ends_at IS NOT NULL AND g.ends_at < now())
  )
  SELECT
    s.id, s.format, s.slug, s.title, s.dek, s.hero_image_path, s.category,
    s.primary_entity_type, s.city_id, s.audience_tags, s.reading_time_min,
    s.pick_count, s.published_at, s.starts_at, s.ends_at,
    (s.s_city + s.s_interest + s.s_category + s.s_fresh + s.s_featured
     + s.s_quest_active + s.s_completed + s.s_stale + s.s_continue) AS score,
    CASE
      WHEN s.s_continue > 0 THEN 'continue_reading'
      WHEN s.s_quest_active > 0 THEN 'active_quest'
      WHEN s.s_city >= s.s_interest AND s.s_city >= s.s_category AND s.s_city > 0 THEN 'home_city'
      WHEN s.s_interest >= s.s_category AND s.s_interest > 0 THEN 'interest'
      WHEN s.s_category > 0 THEN 'category_affinity'
      WHEN s.s_featured > 0 THEN 'featured'
      ELSE NULL
    END::text AS boost_reason
  FROM scored s
  ORDER BY (s.s_city + s.s_interest + s.s_category + s.s_fresh + s.s_featured
            + s.s_quest_active + s.s_completed + s.s_stale + s.s_continue) DESC,
           s.published_at DESC NULLS LAST
  LIMIT p_limit;
END $$;
GRANT EXECUTE ON FUNCTION public.guides_recommend(UUID, INT, TEXT, TEXT) TO anon, authenticated;

-- 2. guide_reading_streak (merged: counts every format) ----------------------

CREATE OR REPLACE FUNCTION public.guide_reading_streak(p_user_id UUID)
RETURNS INT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_streak INT := 0; v_week DATE; v_prev DATE;
BEGIN
  IF p_user_id IS NULL THEN RETURN 0; END IF;
  v_week := date_trunc('week', now())::date;
  FOR v_prev IN
    SELECT DISTINCT date_trunc('week', completed_at)::date AS wk
      FROM public.guide_reads
     WHERE user_id = p_user_id AND completed_at IS NOT NULL
     ORDER BY wk DESC
  LOOP
    IF v_streak = 0 THEN
      IF v_prev = v_week OR v_prev = v_week - INTERVAL '7 days' THEN
        v_streak := 1; v_week := v_prev;
      ELSE RETURN 0; END IF;
    ELSE
      IF v_prev = v_week - INTERVAL '7 days' THEN
        v_streak := v_streak + 1; v_week := v_prev;
      ELSE EXIT; END IF;
    END IF;
  END LOOP;
  RETURN v_streak;
END $$;
GRANT EXECUTE ON FUNCTION public.guide_reading_streak(UUID) TO authenticated;

-- 3. active_quest_guide (replaces active_quest; lifecycle derived from window)

CREATE OR REPLACE FUNCTION public.active_quest_guide()
RETURNS public.guides
LANGUAGE sql STABLE AS $$
  SELECT * FROM public.guides
   WHERE format = 'quest' AND status = 'published'
     AND starts_at IS NOT NULL AND ends_at IS NOT NULL
     AND now() BETWEEN starts_at AND ends_at
   ORDER BY starts_at DESC LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.active_quest_guide() TO anon, authenticated;

-- 4. quest_* RPCs — same names + arg types, ported to the unified tables -----

-- SECURITY DEFINER now: guide_contributions public read was tightened
-- (accepted + opted-in only), so aggregate counts need definer rights.
CREATE OR REPLACE FUNCTION public.quest_progress(p_quest_id uuid)
RETURNS TABLE (accepted_count bigint, pending_count bigint, contributor_count bigint, target_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COUNT(qc.id) FILTER (WHERE qc.status = 'accepted')::bigint AS accepted_count,
    COUNT(qc.id) FILTER (WHERE qc.status = 'pending')::bigint  AS pending_count,
    COUNT(DISTINCT qc.user_id) FILTER (WHERE qc.status = 'accepted')::bigint AS contributor_count,
    COALESCE((g.criteria->>'target_count')::int, 0) AS target_count
  FROM public.guides g
  LEFT JOIN public.guide_contributions qc ON qc.guide_id = g.id
  WHERE g.id = p_quest_id AND g.format = 'quest'
  GROUP BY g.id, g.criteria;
$$;
GRANT EXECUTE ON FUNCTION public.quest_progress(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.quest_public_contributors(p_quest_id uuid)
RETURNS TABLE (user_id uuid, display_name text, accepted_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT qp.user_id,
         COALESCE(NULLIF(qp.display_name, ''), 'Anonymous') AS display_name,
         COUNT(qc.id) FILTER (WHERE qc.status = 'accepted')::bigint AS accepted_count
  FROM public.guide_participations qp
  LEFT JOIN public.guide_contributions qc
    ON qc.guide_id = qp.guide_id AND qc.user_id = qp.user_id
  WHERE qp.guide_id = p_quest_id AND qp.opted_in_public = true
  GROUP BY qp.user_id, qp.display_name
  ORDER BY accepted_count DESC, display_name ASC;
$$;
GRANT EXECUTE ON FUNCTION public.quest_public_contributors(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.quest_create_recap_stub(p_quest_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_guide public.guides%ROWTYPE;
  v_source_id uuid;
  v_article_id uuid;
  v_credits text;
  v_body text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_guide FROM public.guides WHERE id = p_quest_id AND format = 'quest';
  IF NOT FOUND THEN RAISE EXCEPTION 'quest guide not found'; END IF;

  IF v_guide.recap_article_id IS NOT NULL THEN
    RETURN v_guide.recap_article_id;
  END IF;

  SELECT ns.id INTO v_source_id FROM public.news_sources ns
    WHERE ns.name = 'Editorial Quests' LIMIT 1;
  IF v_source_id IS NULL THEN
    INSERT INTO public.news_sources (name, url, source_type, category, is_active)
    VALUES ('Editorial Quests', 'https://queer.guide/guides', 'editorial', 'general', true)
    RETURNING id INTO v_source_id;
  END IF;

  SELECT string_agg('- ' || c.display_name || ' (' || c.accepted_count || ')', E'\n')
    INTO v_credits
    FROM public.quest_public_contributors(p_quest_id) c
    WHERE c.accepted_count > 0;

  v_body := E'# ' || v_guide.title || E'\n\n' ||
            COALESCE(v_guide.intro_md, '') || E'\n\n' ||
            E'## Contributors\n\n' || COALESCE(v_credits, '_No public contributors yet._') ||
            E'\n\n_Auto-generated recap stub. Edit before publishing._';

  INSERT INTO public.news_articles
    (source_id, title, content, excerpt, url, published_at, category, slug, fingerprint, quality_status)
  VALUES
    (v_source_id,
     'Recap: ' || v_guide.title,
     v_body,
     LEFT(COALESCE(v_guide.intro_md, v_guide.title), 240),
     'https://queer.guide/guides/' || v_guide.slug,
     now(),
     'editorial',
     'quest-recap-' || v_guide.slug,
     'quest-recap-' || v_guide.id::text,
     'review')
  RETURNING id INTO v_article_id;

  UPDATE public.guides SET recap_article_id = v_article_id WHERE id = p_quest_id;
  RETURN v_article_id;
END $$;
GRANT EXECUTE ON FUNCTION public.quest_create_recap_stub(uuid) TO authenticated;

-- 5. resolve_guide_slug ------------------------------------------------------
-- SECURITY INVOKER: guides RLS applies, so a gated guide resolves to nothing
-- for anon (frontend falls back to gated_entity_exists → sign-in gate).

CREATE OR REPLACE FUNCTION public.resolve_guide_slug(p_slug text)
RETURNS TABLE (guide_id uuid, canonical_slug text, redirected boolean)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT * FROM (
    SELECT g.id, g.slug, false AS redirected FROM public.guides g WHERE g.slug = p_slug
    UNION ALL
    SELECT g.id, g.slug, true
      FROM public.guide_slug_redirects r
      JOIN public.guides g ON g.id = r.guide_id
     WHERE r.old_slug = p_slug
  ) u
  ORDER BY u.redirected ASC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_guide_slug(text) TO anon, authenticated;

-- 6. guide_picks_maintain — nightly janitor for the polymorphic picks --------
-- Repoints picks whose target got merged (follows duplicate_of_id, deletes the
-- pick when the canonical is already picked in the same guide), tombstones
-- picks whose target vanished, and revives tombstones whose target reappeared.
-- Runs set-based per entity type; volumes are editorial-scale. pick_count
-- refresh rides the statement triggers (is_orphaned flips / deletes).

CREATE OR REPLACE FUNCTION public.guide_picks_maintain()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_map CONSTANT jsonb := '{
    "venue":"venues", "event":"events", "marketplace":"marketplace_listings",
    "city":"cities", "country":"countries", "queer_village":"queer_villages",
    "personality":"personalities", "news":"news_articles", "milestone":"milestones",
    "group":"community_groups", "organization":"organizations"}'::jsonb;
  v_type text; v_table text; v_has_dup boolean;
  n int; v_repointed int := 0; v_orphaned int := 0; v_revived int := 0;
BEGIN
  FOR v_type, v_table IN SELECT key, value #>> '{}' FROM jsonb_each(v_map) LOOP
    CONTINUE WHEN to_regclass('public.' || v_table) IS NULL;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'duplicate_of_id'
    ) INTO v_has_dup;

    IF v_has_dup THEN
      -- Repoint merged targets to their canonical (single hop; chains converge
      -- across nightly runs).
      EXECUTE format($q$
        UPDATE public.guide_picks p
           SET entity_id = t.duplicate_of_id, is_orphaned = false
          FROM public.%I t
         WHERE p.entity_type = %L AND p.entity_id = t.id
           AND t.duplicate_of_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM public.guide_picks k
             WHERE k.guide_id = p.guide_id AND k.entity_type = p.entity_type
               AND k.entity_id = t.duplicate_of_id)
      $q$, v_table, v_type);
      GET DIAGNOSTICS n = ROW_COUNT; v_repointed := v_repointed + n;

      -- Remaining merged-target picks collide with an existing canonical pick → drop.
      EXECUTE format($q$
        DELETE FROM public.guide_picks p
         USING public.%I t
         WHERE p.entity_type = %L AND p.entity_id = t.id
           AND t.duplicate_of_id IS NOT NULL
      $q$, v_table, v_type);
    END IF;

    EXECUTE format($q$
      UPDATE public.guide_picks p SET is_orphaned = true
       WHERE p.entity_type = %L AND NOT p.is_orphaned
         AND NOT EXISTS (SELECT 1 FROM public.%I t WHERE t.id = p.entity_id)
    $q$, v_type, v_table);
    GET DIAGNOSTICS n = ROW_COUNT; v_orphaned := v_orphaned + n;

    EXECUTE format($q$
      UPDATE public.guide_picks p SET is_orphaned = false
       WHERE p.entity_type = %L AND p.is_orphaned
         AND EXISTS (SELECT 1 FROM public.%I t WHERE t.id = p.entity_id %s)
    $q$, v_type, v_table,
      CASE WHEN v_has_dup THEN 'AND t.duplicate_of_id IS NULL' ELSE '' END);
    GET DIAGNOSTICS n = ROW_COUNT; v_revived := v_revived + n;
  END LOOP;

  RETURN jsonb_build_object('repointed', v_repointed, 'orphaned', v_orphaned, 'revived', v_revived);
END $$;

REVOKE ALL ON FUNCTION public.guide_picks_maintain() FROM public;
GRANT EXECUTE ON FUNCTION public.guide_picks_maintain() TO service_role;

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES ('guide_picks_maintain', 'Guide picks janitor',
        'Nightly: repoints unified-guide picks whose target entity was merged (duplicate_of_id) and tombstones picks whose target was deleted. Primary integrity mechanism for the polymorphic guide_picks table.',
        'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
        '{"type":"rpc","fn":"guide_picks_maintain"}'::jsonb, '40 4 * * *')
ON CONFLICT (slug) DO UPDATE SET schedule=excluded.schedule, enabled=excluded.enabled,
  description=excluded.description, name=excluded.name, action=excluded.action, trigger=excluded.trigger;

SELECT cron.schedule('guide_picks_maintain', '40 4 * * *',
  $cron$ SELECT public.guide_picks_maintain(); $cron$);
