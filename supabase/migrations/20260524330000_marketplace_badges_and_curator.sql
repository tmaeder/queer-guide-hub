-- Marketplace gamification — quiet layer.
--
-- Adds five discovery badges to the existing `achievements` catalog
-- (created in 20260524160000_venues_v2_gamification_and_ranking.sql)
-- and a curator_level on profiles for the future trusted-curator tier.
-- No awarding triggers yet — surfaced on profile only until the awarding
-- logic ships in a later iteration.

-- ---------------------------------------------------------------------------
-- 1. profiles.curator_level
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'curator_level') THEN
    CREATE TYPE curator_level AS ENUM ('none', 'trusted', 'featured');
  END IF;
END$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS curator_level curator_level NOT NULL DEFAULT 'none';

COMMENT ON COLUMN public.profiles.curator_level IS
  'Curator tier. Trusted curators may publish public wishlists eligible for editorial pickup; featured curators surface on the marketplace.';

-- ---------------------------------------------------------------------------
-- 2. Marketplace discovery badges
-- ---------------------------------------------------------------------------

INSERT INTO public.achievements (slug, name, description, icon, points_reward, tier, criteria, sort_order)
VALUES
  (
    'marketplace_first_save',
    'First save',
    'Saved your first item to a wishlist.',
    'heart',
    5,
    'bronze',
    '{"event": "wishlist_item_added", "threshold": 1}'::jsonb,
    200
  ),
  (
    'marketplace_saved_ten',
    'Collector',
    'Saved ten or more items across your wishlists.',
    'bookmark',
    15,
    'silver',
    '{"event": "wishlist_item_added", "threshold": 10}'::jsonb,
    210
  ),
  (
    'marketplace_three_queer_owned',
    'Community shopper',
    'Saved items from at least three queer-owned merchants.',
    'store',
    20,
    'silver',
    '{"event": "wishlist_item_added", "merchants_tagged": "queer-owned", "threshold": 3}'::jsonb,
    220
  ),
  (
    'marketplace_first_wishlist',
    'List maker',
    'Created your first named wishlist.',
    'list',
    10,
    'bronze',
    '{"event": "wishlist_created", "threshold": 1}'::jsonb,
    230
  ),
  (
    'marketplace_shared_wishlist',
    'Curator in training',
    'Shared a wishlist with the world.',
    'share-2',
    25,
    'gold',
    '{"event": "wishlist_made_public", "threshold": 1}'::jsonb,
    240
  )
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      icon = EXCLUDED.icon,
      points_reward = EXCLUDED.points_reward,
      tier = EXCLUDED.tier,
      criteria = EXCLUDED.criteria,
      sort_order = EXCLUDED.sort_order;
