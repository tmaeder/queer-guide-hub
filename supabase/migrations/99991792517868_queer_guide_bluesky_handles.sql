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

-- Usernames are also subdomains now, so the names of real queer.guide hosts
-- (and obvious service/brand names) must never be claimable: a member called
-- "img" would otherwise be able to present img.queer.guide as their identity.
insert into public.reserved_usernames (name, reason) values
  ('admin', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('api', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('app', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('assets', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('assistant', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('atproto', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('blog', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('bluesky', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('bsky', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('cdn', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('dev', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('docs', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('extract', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('go', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('help', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('img', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('inbox', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('ingest', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('links', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('mail', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('nominatim', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('ntfy', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('search', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('staging', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('status', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('submit', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('team', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('tiles', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('travel', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('trip', 'infrastructure subdomain — cannot be a name.queer.guide handle'),
  ('www', 'infrastructure subdomain — cannot be a name.queer.guide handle')
on conflict do nothing;

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
  if not exists (select 1 from public.reserved_usernames where name = 'img') then
    raise exception 'queer guide handles: infrastructure subdomains are not reserved';
  end if;
  if exists (select 1 from public.bluesky_identities where use_queer_guide_handle) then
    raise notice 'queer guide handles: opt-in rows already present';
  end if;
end
$verify$;
