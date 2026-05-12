-- venue_reviews was missing anon SELECT grant + had authenticated-only RLS policy.
-- Anonymous users hitting any venue detail page got 401 on the reviews query,
-- crashing the entire page.

GRANT SELECT ON public.venue_reviews TO anon;

DROP POLICY "Venue reviews are viewable by authenticated users" ON public.venue_reviews;

CREATE POLICY "Venue reviews are publicly readable"
  ON public.venue_reviews
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- get_venue_social_signals also lacked anon EXECUTE, returning 401
-- for anonymous visitors on venue detail pages.
GRANT EXECUTE ON FUNCTION public.get_venue_social_signals(uuid[], uuid) TO anon;

-- profiles table also lacked anon SELECT grant, breaking the
-- venue_reviews join on profiles:user_id for anonymous visitors.
-- RLS policy profiles_public_read already scopes anon reads to public profiles.
GRANT SELECT ON public.profiles TO anon;
