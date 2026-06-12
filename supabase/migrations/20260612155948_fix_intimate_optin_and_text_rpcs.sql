-- Intimate activation was broken two ways (found 2026-06-11 while reproducing
-- "Activate" errors):
--
-- 1. intimate_enforce_optin still required profiles.verified_email — the email
--    requirement was removed as a product decision (PR #1589). The check was
--    also unreachable-correct: it looked up profiles by id = new.id, but
--    profiles.id is the row PK, not the auth uid, so it read no row and
--    rejected EVERY opt-in with "verified email required". Drop the email
--    check; the 18+ consent check stays.
--
-- 2. intimate_get_my_text / intimate_set_text call pgp_sym_decrypt/encrypt
--    with SET search_path = 'public', but pgcrypto lives in the `extensions`
--    schema → 42883 on every call. Schema-qualify the calls.

CREATE OR REPLACE FUNCTION public.intimate_enforce_optin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.opted_in_at is not null and (old.opted_in_at is null or old.opted_in_at <> new.opted_in_at) then
    if new.consent_18plus_at is null then
      raise exception 'intimate: 18+ consent required to opt in' using errcode = '22023';
    end if;
  end if;
  new.updated_at := now();
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.intimate_set_text(p_about text, p_looking text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare k text := public.intimate_profile_key();
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.intimate_profiles
     set about_intimate_enc = case when p_about is null then null else extensions.pgp_sym_encrypt(p_about, k) end,
         looking_for_enc   = case when p_looking is null then null else extensions.pgp_sym_encrypt(p_looking, k) end,
         updated_at = now()
   where id = auth.uid();
end; $function$;

CREATE OR REPLACE FUNCTION public.intimate_get_my_text()
RETURNS TABLE(about_intimate text, looking_for text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare k text := public.intimate_profile_key();
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  return query
    select
      case when ip.about_intimate_enc is null then null else extensions.pgp_sym_decrypt(ip.about_intimate_enc, k) end,
      case when ip.looking_for_enc  is null then null else extensions.pgp_sym_decrypt(ip.looking_for_enc, k) end
    from public.intimate_profiles ip where ip.id = auth.uid();
end; $function$;
