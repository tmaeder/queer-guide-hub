-- Add admin policies for comprehensive content management

-- Cities: Allow admins to manage all cities
CREATE POLICY "Admins can manage all cities"
ON public.cities
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Venues: Allow admins to manage all venues
CREATE POLICY "Admins can manage all venues"
ON public.venues
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Events: Allow admins to manage all events (including delete)
CREATE POLICY "Admins can manage all events"
ON public.events
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Marketplace Listings: Allow admins to manage all listings
CREATE POLICY "Admins can manage all marketplace listings"
ON public.marketplace_listings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));