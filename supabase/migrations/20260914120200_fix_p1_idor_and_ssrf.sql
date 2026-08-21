-- P1 security fixes from the 2026-08-21 audit.
--
-- recommend_groups(uuid,int), guide_reading_streak(uuid) and
-- get_personalized_marketplace_listings(uuid,int,bool) all take a
-- caller-supplied p_user_id with no check that it matches auth.uid() —
-- given any user's UUID, an authenticated caller could read that user's
-- group affinity signals, guide reading streak, or wishlist/marketplace
-- personalization seeds. None of the three has a legitimate cross-user use:
-- every frontend call site passes the CALLER's own id (or the anon/null
-- case for recommend_groups' cold-start default). The fix is the same
-- pattern already applied to guides_recommend in the prior migration:
-- ignore whatever the client passed and derive identity from the verified
-- session instead. No signature change, no frontend change needed.

-- ---------------------------------------------------------------------------
-- 1. recommend_groups — LANGUAGE sql, so p_user_id can't be reassigned
--    imperatively; every reference to it is replaced with auth.uid()
--    directly. The parameter stays in the signature (still accepted, now
--    ignored) so PostgREST call sites keep working unmodified.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recommend_groups(
  p_user_id uuid DEFAULT auth.uid(),
  p_limit   int  DEFAULT 12
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
WITH me AS (
  SELECT
    p.user_id,
    p.location AS my_location,
    CASE WHEN jsonb_typeof(p.interests) = 'array'
         THEN ARRAY(SELECT lower(jsonb_array_elements_text(p.interests)))
         ELSE '{}'::text[] END AS my_interests
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
),
my_interest AS (
  SELECT unnest(my_interests) AS interest FROM me
),
blocked AS (
  SELECT target_user_id AS uid FROM public.user_relationships
    WHERE user_id = auth.uid() AND relationship_type = 'block'
  UNION
  SELECT user_id FROM public.user_relationships
    WHERE target_user_id = auth.uid() AND relationship_type = 'block'
),
friends AS (
  SELECT CASE WHEN ur.user_id = auth.uid() THEN ur.target_user_id ELSE ur.user_id END AS friend_id
  FROM public.user_relationships ur
  WHERE ur.relationship_type = 'friend' AND ur.status = 'accepted'
    AND (ur.user_id = auth.uid() OR ur.target_user_id = auth.uid())
),
cand AS (
  SELECT g.id, g.name, g.description, g.image_url, g.tags, g.member_count,
         g.is_private, g.featured, g.city, g.last_activity_at, g.created_at,
         (SELECT count(*) FROM unnest(g.tags) t
            JOIN my_interest mi ON lower(t) = mi.interest) AS tag_hits,
         (SELECT count(*) FROM public.group_memberships gm
            WHERE gm.group_id = g.id
              AND gm.user_id IN (SELECT friend_id FROM friends)) AS friend_hits,
         (g.city IS NOT NULL
            AND (SELECT my_location FROM me) IS NOT NULL
            AND lower(g.city) = lower((SELECT my_location FROM me))) AS same_city
  FROM public.community_groups g
  WHERE NOT EXISTS (
          SELECT 1 FROM public.group_memberships gm
          WHERE gm.group_id = g.id AND gm.user_id = auth.uid())
    AND g.created_by NOT IN (SELECT uid FROM blocked)
),
scored AS (
  SELECT *,
      0.40 * least(tag_hits, 3)::numeric / 3.0
    + 0.30 * least(friend_hits, 5)::numeric / 5.0
    + 0.12 * (CASE WHEN same_city THEN 1 ELSE 0 END)
    + 0.10 * least(coalesce(member_count, 0), 50)::numeric / 50.0
    + 0.08 * exp(-extract(epoch FROM (now() - coalesce(last_activity_at, created_at))) / (60*60*24*14))
    + (CASE WHEN featured THEN 0.05 ELSE 0 END) AS score
  FROM cand
)
SELECT COALESCE((
  SELECT jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'description', left(coalesce(description,''), 200),
    'imageUrl', image_url, 'tags', to_jsonb(tags),
    'memberCount', member_count, 'isPrivate', is_private, 'featured', featured,
    'friendsInGroup', friend_hits, 'tagMatches', tag_hits,
    '_score', round(score, 4)
  ) ORDER BY score DESC, member_count DESC NULLS LAST)
  FROM (
    SELECT * FROM scored
    WHERE score > 0
    ORDER BY score DESC, member_count DESC NULLS LAST
    LIMIT greatest(p_limit, 0)
  ) x
), '[]'::jsonb);
$$;

-- ---------------------------------------------------------------------------
-- 2. guide_reading_streak — LANGUAGE plpgsql, so the parameter can just be
--    reassigned before use.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guide_reading_streak(p_user_id UUID)
RETURNS INT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_streak INT := 0; v_week DATE; v_prev DATE;
BEGIN
  p_user_id := auth.uid();
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

-- ---------------------------------------------------------------------------
-- 3. get_personalized_marketplace_listings — LANGUAGE sql, same textual
--    substitution as recommend_groups. p_include_adult is left as a genuine
--    caller-supplied toggle (it doesn't identify another user, just whether
--    the requesting session wants adult content mixed in).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_personalized_marketplace_listings(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 12,
  p_include_adult BOOLEAN DEFAULT false
)
RETURNS TABLE (
  listing_id UUID,
  score NUMERIC,
  reason TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH seed_listings AS (
    SELECT wi.listing_id
      FROM wishlist_items wi
      JOIN wishlists w ON w.id = wi.wishlist_id
     WHERE w.user_id = auth.uid()
    UNION
    SELECT mf.listing_id
      FROM marketplace_favorites mf
     WHERE mf.user_id = auth.uid()
  ),
  saved_tags AS (
    SELECT DISTINCT uta.tag_id
      FROM unified_tag_assignments uta
     WHERE uta.entity_type = 'marketplace_listing'
       AND uta.entity_id IN (SELECT listing_id FROM seed_listings)
  ),
  followed_tags AS (
    SELECT tf.tag_id FROM tag_follows tf WHERE tf.user_id = auth.uid()
  ),
  interest_tags AS (
    SELECT ut.id AS tag_id
      FROM profiles p
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(p.interests) = 'array' THEN p.interests ELSE '[]'::jsonb END
      ) AS i(term)
      JOIN unified_tags ut
        ON ut.slug = lower(i.term) OR lower(ut.name) = lower(i.term)
     WHERE p.user_id = auth.uid()
  ),
  seed_tags AS (
    SELECT tag_id, 'tag_overlap'::text AS src FROM saved_tags
    UNION ALL
    SELECT tag_id, 'follows' FROM followed_tags
    UNION ALL
    SELECT tag_id, 'interests' FROM interest_tags
  ),
  seed_tags_dedup AS (
    SELECT DISTINCT ON (tag_id) tag_id, src
    FROM seed_tags
    ORDER BY tag_id,
             CASE src WHEN 'tag_overlap' THEN 0 WHEN 'follows' THEN 1 ELSE 2 END
  ),
  candidates AS (
    SELECT
      l.id AS listing_id,
      COUNT(DISTINCT st.tag_id)::NUMERIC AS overlap,
      (array_agg(st.src ORDER BY CASE st.src WHEN 'tag_overlap' THEN 0 WHEN 'follows' THEN 1 ELSE 2 END))[1] AS reason,
      COALESCE(l.boutique_score, 0)::NUMERIC AS boutique
    FROM marketplace_listings l
    JOIN unified_tag_assignments uta
      ON uta.entity_id = l.id AND uta.entity_type = 'marketplace_listing'
    JOIN seed_tags_dedup st ON st.tag_id = uta.tag_id
    WHERE l.status = 'active'
      AND l.id NOT IN (SELECT listing_id FROM seed_listings)
      AND (
        p_include_adult
        OR (
          l.content_rating IN ('sfw', 'suggestive')
          AND coalesce(l.department, '') NOT IN ('intimacy', 'bdsm_fetish')
        )
      )
    GROUP BY l.id, l.boutique_score
  )
  SELECT
    c.listing_id,
    (c.overlap * 1.0 + c.boutique * 2.0)::NUMERIC AS score,
    c.reason
  FROM candidates c
  ORDER BY score DESC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 12), 48));
$$;
