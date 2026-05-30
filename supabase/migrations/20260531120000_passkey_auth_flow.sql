-- Passkey (WebAuthn) full sign-in support.
--
-- The logged-out authentication flow creates a challenge BEFORE the user is
-- known (discoverable credentials), so user_id must be nullable. We also move
-- challenge + public-key storage to base64url text columns because that is the
-- exact format @simplewebauthn/server emits and consumes, avoiding lossy int[]
-- / bytea round-trips through PostgREST.

-- Challenges: allow user-less (discoverable) authenticate challenges and store
-- the canonical base64url challenge string.
ALTER TABLE public.passkey_challenges ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.passkey_challenges ALTER COLUMN challenge DROP NOT NULL;
ALTER TABLE public.passkey_challenges ADD COLUMN IF NOT EXISTS challenge_b64 text;

-- Index for the authenticate flow's lookup by challenge id is already covered
-- by the primary key. Add an expiry index to keep cleanup cheap.
CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expires_at
  ON public.passkey_challenges (expires_at);

-- Credentials: store the verified COSE public key as base64url text, plus
-- optional transports/aaguid metadata that @simplewebauthn returns.
ALTER TABLE public.user_passkeys ALTER COLUMN public_key DROP NOT NULL;
ALTER TABLE public.user_passkeys ADD COLUMN IF NOT EXISTS public_key_b64 text;
ALTER TABLE public.user_passkeys ADD COLUMN IF NOT EXISTS transports text[];
ALTER TABLE public.user_passkeys ADD COLUMN IF NOT EXISTS aaguid text;

COMMENT ON COLUMN public.user_passkeys.public_key_b64 IS
  'base64url-encoded COSE public key (from @simplewebauthn verifyRegistrationResponse). Source of truth; legacy bytea public_key kept nullable for back-compat.';
COMMENT ON COLUMN public.passkey_challenges.challenge_b64 IS
  'base64url challenge string from @simplewebauthn generate*Options; user_id is NULL for discoverable authenticate challenges.';
