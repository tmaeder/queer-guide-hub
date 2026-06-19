-- Personalized group recommendations (cold-start fix). Pure-SQL, no writes,
-- no search-trigger interaction. SECURITY DEFINER to read friends' memberships
-- (aggregate counts only) and the caller's interests. Scoped to p_user_id.
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
  WHERE p.user_id = p_user_id
),
my_interest AS (
  SELECT unnest(my_interests) AS interest FROM me
),
blocked AS (
  SELECT target_user_id AS uid FROM public.user_relationships
    WHERE user_id = p_user_id AND relationship_type = 'block'
  UNION
  SELECT user_id FROM public.user_relationships
    WHERE target_user_id = p_user_id AND relationship_type = 'block'
),
friends AS (
  SELECT CASE WHEN ur.user_id = p_user_id THEN ur.target_user_id ELSE ur.user_id END AS friend_id
  FROM public.user_relationships ur
  WHERE ur.relationship_type = 'friend' AND ur.status = 'accepted'
    AND (ur.user_id = p_user_id OR ur.target_user_id = p_user_id)
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
          WHERE gm.group_id = g.id AND gm.user_id = p_user_id)
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

REVOKE ALL ON FUNCTION public.recommend_groups(uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.recommend_groups(uuid, int) TO authenticated;
