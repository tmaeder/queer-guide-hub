-- The intimate profile no longer requires a verified email (product decision
-- 2026-06-11). The frontend gate in IntimateOnboard is removed in the same
-- change; drop the trigger that silently cleared opt-in when an email became
-- unverified, so DB behavior matches. 18+ consent gating is untouched.

DROP TRIGGER IF EXISTS intimate_clear_optin_on_email_unverify_trg ON public.profiles;
DROP FUNCTION IF EXISTS public.intimate_clear_optin_on_email_unverify();
