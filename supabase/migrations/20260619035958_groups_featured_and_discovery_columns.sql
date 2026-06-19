-- Groups growth/discovery: add featured (fixes live AdminGroups select bug),
-- optional city (enables same-city recommendation scoring), and last_activity_at
-- (cheap cached trending input maintained by trigger). Additive + idempotent.

ALTER TABLE public.community_groups
  ADD COLUMN IF NOT EXISTS featured         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS city             text,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

CREATE INDEX IF NOT EXISTS community_groups_featured_idx
  ON public.community_groups (featured) WHERE featured = true;

CREATE INDEX IF NOT EXISTS community_groups_tags_gin
  ON public.community_groups USING gin (tags);

-- One-time backfill of last_activity_at (cheap; few rows).
UPDATE public.community_groups g
  SET last_activity_at = GREATEST(
    g.created_at,
    COALESCE((SELECT max(created_at) FROM public.group_posts p WHERE p.group_id = g.id), g.created_at),
    COALESCE((SELECT max(joined_at)  FROM public.group_memberships m WHERE m.group_id = g.id), g.created_at)
  )
  WHERE last_activity_at IS NULL;

-- Maintain last_activity_at on new posts/joins. Single-column write; the
-- search-sync trigger (later migration) is column-scoped to EXCLUDE
-- last_activity_at/member_count, so this never triggers a search re-index.
CREATE OR REPLACE FUNCTION public.touch_group_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.community_groups
    SET last_activity_at = now()
    WHERE id = COALESCE(NEW.group_id, OLD.group_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger function only; never call it directly via RPC.
REVOKE ALL ON FUNCTION public.touch_group_activity() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_touch_group_activity_post ON public.group_posts;
CREATE TRIGGER trg_touch_group_activity_post
  AFTER INSERT ON public.group_posts
  FOR EACH ROW EXECUTE FUNCTION public.touch_group_activity();

DROP TRIGGER IF EXISTS trg_touch_group_activity_join ON public.group_memberships;
CREATE TRIGGER trg_touch_group_activity_join
  AFTER INSERT ON public.group_memberships
  FOR EACH ROW EXECUTE FUNCTION public.touch_group_activity();
