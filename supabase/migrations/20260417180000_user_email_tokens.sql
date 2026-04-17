-- Per-user forwarding tokens for the trip-email import path.
--
-- Address scheme: `trips+{token}@queer.guide`. The email-ingest worker
-- parses the local-part, looks up the row, and inserts a `reservations`
-- row with `source = 'imported_email'` owned by `user_id`.
--
-- Tokens are 12 chars of crockford base32 (~60 bits of entropy) — enough
-- to make guessing infeasible while keeping the address short. Rotation
-- is supported via `revoked_at`; clients call `get_or_create_email_token`
-- which always returns the active row.

CREATE TABLE IF NOT EXISTS public.user_email_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_user_email_tokens_token_active
  ON public.user_email_tokens (token) WHERE revoked_at IS NULL;

ALTER TABLE public.user_email_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_email_tokens_owner_select" ON public.user_email_tokens;
CREATE POLICY "user_email_tokens_owner_select" ON public.user_email_tokens
  FOR SELECT USING (auth.uid() = user_id);

-- Token generator: 12 chars from crockford base32 alphabet (no I, L, O, U).
CREATE OR REPLACE FUNCTION public.generate_email_token()
RETURNS text AS $$
DECLARE
  alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  result text := '';
  i int;
  rand_byte int;
BEGIN
  FOR i IN 1..12 LOOP
    rand_byte := (random() * 32)::int;
    IF rand_byte > 31 THEN rand_byte := 31; END IF;
    result := result || substr(alphabet, rand_byte + 1, 1);
  END LOOP;
  RETURN lower(result);
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Idempotent issuer. Returns the caller's active token, creating one on
-- first call. Retries up to 3 times on token collision (negligibly rare
-- but cheap to handle).
CREATE OR REPLACE FUNCTION public.get_or_create_email_token()
RETURNS text AS $$
DECLARE
  existing text;
  candidate text;
  attempts int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT token INTO existing
  FROM public.user_email_tokens
  WHERE user_id = auth.uid() AND revoked_at IS NULL;

  IF existing IS NOT NULL THEN
    RETURN existing;
  END IF;

  WHILE attempts < 3 LOOP
    candidate := public.generate_email_token();
    BEGIN
      INSERT INTO public.user_email_tokens (user_id, token)
      VALUES (auth.uid(), candidate);
      RETURN candidate;
    EXCEPTION WHEN unique_violation THEN
      attempts := attempts + 1;
    END;
  END LOOP;

  RAISE EXCEPTION 'could not allocate email token after % attempts', attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_or_create_email_token() TO authenticated;

-- Rotate: revoke current and issue a new one.
CREATE OR REPLACE FUNCTION public.rotate_email_token()
RETURNS text AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  UPDATE public.user_email_tokens
  SET revoked_at = now()
  WHERE user_id = auth.uid() AND revoked_at IS NULL;

  RETURN public.get_or_create_email_token();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.rotate_email_token() TO authenticated;

-- Lookup function for the email-ingest worker (uses service role).
-- Returns user_id for an active token, NULL otherwise.
CREATE OR REPLACE FUNCTION public.user_id_for_email_token(p_token text)
RETURNS uuid AS $$
  SELECT user_id
  FROM public.user_email_tokens
  WHERE token = lower(p_token) AND revoked_at IS NULL
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.user_id_for_email_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_id_for_email_token(text) TO service_role;
