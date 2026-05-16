-- Add helper to safely access JWT claims in policies without current_setting inlined
CREATE OR REPLACE FUNCTION public.jwt_claim(claim text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> claim,
    ''
  );
$$;