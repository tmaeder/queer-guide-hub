-- CRITICAL SECURITY FIX
-- public.get_vault_secret had no internal role check, returns
-- decrypted vault secrets, and defaulted to PUBLIC EXECUTE per Postgres
-- function ACL. Anyone with a Supabase API key (anon or authenticated)
-- could SELECT public.get_vault_secret('any_name') and read every vault
-- secret.
--
-- Lock down to service_role only. Existing explicit grants to
-- service_role + postgres remain. The implicit PUBLIC grant is revoked.
-- Edge functions should already be using service_role; if any breaks,
-- the fix is to grant only the specific role that needs that secret,
-- not to widen this back open.
--
-- Already applied to prod via Supabase MCP on 2026-05-02.
-- Ref: docs/security-definer-function-audit.md

REVOKE EXECUTE ON FUNCTION public.get_vault_secret(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_vault_secret(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_vault_secret(text) FROM authenticated;
