-- Drop the overly permissive ALL policy + redundant legacy SELECT policy
DROP POLICY IF EXISTS "Authenticated users can manage professions" ON public.professions;
DROP POLICY IF EXISTS "Anyone can read active professions" ON public.professions;

-- Public read
CREATE POLICY "Public read access for professions"
  ON public.professions FOR SELECT
  USING (true);

-- Admin write
CREATE POLICY "Admins can insert professions"
  ON public.professions FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role_jwt('admin'::public.app_role));

CREATE POLICY "Admins can update professions"
  ON public.professions FOR UPDATE
  TO authenticated
  USING (public.has_role_jwt('admin'::public.app_role));

CREATE POLICY "Admins can delete professions"
  ON public.professions FOR DELETE
  TO authenticated
  USING (public.has_role_jwt('admin'::public.app_role));
