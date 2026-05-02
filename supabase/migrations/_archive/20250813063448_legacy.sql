-- Drop redundant duplicate indexes safely (keep PK/UNIQUE-backed indexes)
DROP INDEX IF EXISTS public.idx_conv_participants_conv_user;
DROP INDEX IF EXISTS public.idx_conv_participants_user;
DROP INDEX IF EXISTS public.idx_marketplace_categories_slug;
DROP INDEX IF EXISTS public.idx_notifications_user_read;
DROP INDEX IF EXISTS public.idx_profiles_user_id;
DROP INDEX IF EXISTS public.idx_unified_tags_slug;
DROP INDEX IF EXISTS public.idx_user_photos_user;
DROP INDEX IF EXISTS public.idx_venues_foursquare_id;
DROP INDEX IF EXISTS public.idx_venues_tomtom_id;