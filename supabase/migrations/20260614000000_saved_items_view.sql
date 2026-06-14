-- Personal layer Phase 4: unified "Saved" read model.
--
-- The user's saved items live in seven per-type tables (venue/event/city/
-- country/marketplace/news/tag _favorites), all shaped (id, user_id,
-- <entity>_id, created_at). This view UNIONs them into one polymorphic read
-- surface so the frontend can fetch "everything I saved" in a single query and
-- so a future real saved_items table has a drop-in shape to cut over to.
--
-- security_invoker = true is load-bearing: it makes the view run with the
-- querying user's privileges, so each underlying table's RLS (user_id =
-- auth.uid()) is enforced and a user can only ever read their own saved rows.
-- Without it the view would run as owner and leak every user's favorites.
CREATE OR REPLACE VIEW public.saved_items
WITH (security_invoker = true) AS
  SELECT user_id, 'venue'::text       AS entity_type, venue_id    AS entity_id, created_at FROM public.venue_favorites
  UNION ALL
  SELECT user_id, 'event'::text,       event_id,    created_at FROM public.event_favorites
  UNION ALL
  SELECT user_id, 'city'::text,        city_id,     created_at FROM public.city_favorites
  UNION ALL
  SELECT user_id, 'country'::text,     country_id,  created_at FROM public.country_favorites
  UNION ALL
  SELECT user_id, 'marketplace'::text, listing_id,  created_at FROM public.marketplace_favorites
  UNION ALL
  SELECT user_id, 'news'::text,        article_id,  created_at FROM public.news_favorites
  UNION ALL
  SELECT user_id, 'tag'::text,         tag_id,      created_at FROM public.tag_favorites;

GRANT SELECT ON public.saved_items TO authenticated;

COMMENT ON VIEW public.saved_items IS
  'Unified read model over the per-type *_favorites tables (personal-layer Phase 4). security_invoker enforces each table''s per-user RLS.';
