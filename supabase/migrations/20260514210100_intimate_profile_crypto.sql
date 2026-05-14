-- pgcrypto wrappers for intimate_profiles free-text fields.
-- Key resolution order: vault.secrets.intimate_profile_key (preferred),
-- else app.settings.intimate_profile_key (GUC fallback for local dev).
-- Owner-only access enforced by RLS on the underlying table.

create or replace function public.intimate_profile_key()
returns text
language plpgsql
stable
security definer
set search_path = public, vault
as $$
declare
  k text;
begin
  begin
    select decrypted_secret into k
      from vault.decrypted_secrets
      where name = 'intimate_profile_key';
  exception when undefined_table then
    k := null;
  end;
  if k is null or k = '' then
    k := current_setting('app.settings.intimate_profile_key', true);
  end if;
  if k is null or k = '' then
    raise exception 'intimate_profile_key secret missing';
  end if;
  return k;
end;
$$;

revoke all on function public.intimate_profile_key() from public;

create or replace function public.intimate_set_text(
  p_about text,
  p_looking text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := public.intimate_profile_key();
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  update public.intimate_profiles
     set about_intimate_enc = case
           when p_about is null then null
           else pgp_sym_encrypt(p_about, k)
         end,
         looking_for_enc = case
           when p_looking is null then null
           else pgp_sym_encrypt(p_looking, k)
         end,
         updated_at = now()
   where id = auth.uid();
end;
$$;

grant execute on function public.intimate_set_text(text, text) to authenticated;

create or replace function public.intimate_get_my_text()
returns table(about_intimate text, looking_for text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  k text := public.intimate_profile_key();
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  return query
    select
      case when ip.about_intimate_enc is null then null
           else pgp_sym_decrypt(ip.about_intimate_enc, k) end,
      case when ip.looking_for_enc is null then null
           else pgp_sym_decrypt(ip.looking_for_enc, k) end
    from public.intimate_profiles ip
    where ip.id = auth.uid();
end;
$$;

grant execute on function public.intimate_get_my_text() to authenticated;
