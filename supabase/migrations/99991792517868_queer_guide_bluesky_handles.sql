-- name.queer.guide as a Bluesky handle (Phase 3 of the AT Protocol plan).
--
-- AT Protocol handle resolution, HTTPS method: GET https://<handle>/.well-known/atproto-did
-- returns the account DID as text/plain. A Worker on *.queer.guide answers that
-- path from atproto_did_for_subdomain(); this migration holds the rules.
--
-- Opt-in only (use_queer_guide_handle, default false), and only for a DID the
-- user proved they control via Sign in with Bluesky (bluesky_identities).
-- A wildcard matches ONE DNS label, so only usernames that are a valid single
-- label qualify: a-z and 0-9 (Queer Guide usernames may also contain . and _,
-- which cannot be a subdomain). A renamed user's old subdomain stops resolving
-- immediately — no redirect, so an old handle cannot be linked to the new one.

alter table public.bluesky_identities
  add column if not exists use_queer_guide_handle boolean not null default false;

create or replace function public.atproto_did_for_subdomain(p_sub text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select b.did
  from public.bluesky_identities b
  join public.profiles p on p.user_id = b.user_id
  where b.use_queer_guide_handle
    and lower(p_sub) ~ '^[a-z0-9]{3,20}$'
    and p.username = lower(p_sub)
  limit 1;
$$;

revoke all on function public.atproto_did_for_subdomain(text) from public;
grant execute on function public.atproto_did_for_subdomain(text) to anon, authenticated, service_role;

do $verify$
begin
  if public.atproto_did_for_subdomain('a.b') is not null
     or public.atproto_did_for_subdomain('x_y') is not null then
    raise exception 'queer guide handles: a multi-label or underscore name resolved';
  end if;
  if exists (select 1 from public.bluesky_identities where use_queer_guide_handle) then
    raise notice 'queer guide handles: opt-in rows already present';
  end if;
end
$verify$;
