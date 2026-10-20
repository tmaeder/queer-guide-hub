-- Sign in with Bluesky (Phase 4 of the AT Protocol standards plan).
--
-- The OAuth tokens never reach Queer Guide: @atproto/oauth-client-browser is a
-- public client and keeps them in the user's browser. What the server keeps is
-- the PUBLIC identity — the account's DID and handle — so the profile can show
-- "on Bluesky" and later phases (name.queer.guide handles, feeds) can key on
-- the DID. One Bluesky account per Queer Guide account and vice versa.
--
-- community_posts.at_uri / at_cid record a cross-post in the author's own repo
-- (app.bsky.feed.post), so deleting the post here can delete it there too.

create table if not exists public.bluesky_identities (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  did       text not null unique check (did ~ '^did:(plc|web):[A-Za-z0-9._:%-]+$'),
  handle    text not null check (char_length(handle) between 3 and 253),
  linked_at timestamptz not null default now()
);
alter table public.bluesky_identities enable row level security;
drop policy if exists "bluesky_identities owner" on public.bluesky_identities;
create policy "bluesky_identities owner" on public.bluesky_identities
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on public.bluesky_identities from anon, public;
grant select, insert, update, delete on public.bluesky_identities to authenticated;

alter table public.community_posts
  add column if not exists at_uri text check (at_uri is null or at_uri ~ '^at://'),
  add column if not exists at_cid text;

do $verify$
begin
  if has_table_privilege('anon', 'public.bluesky_identities', 'select') then
    raise exception 'bluesky identity: anon can read bluesky_identities';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'community_posts' and column_name = 'at_uri') then
    raise exception 'bluesky identity: community_posts.at_uri missing';
  end if;
end
$verify$;
