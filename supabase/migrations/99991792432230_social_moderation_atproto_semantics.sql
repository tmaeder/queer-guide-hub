-- Social safety basics with AT Protocol (Bluesky) semantics.
--
-- Shapes are taken from the atproto lexicons rather than invented, so a later
-- Bluesky integration can pass them through unchanged:
--   * user_muted_words  = app.bsky.actor.defs#mutedWord
--                         (value, targets content|tag, actorTarget all|exclude-following, expiresAt)
--   * community_posts.labels = com.atproto.label.defs#selfLabels values, limited to
--                         Bluesky's global adult/graphic self-labels
--   * user_moderation_prefs = the adultContentEnabled + labels part of
--                         @atproto/api ModerationPrefs (hide|warn|ignore per label)
--
-- Mutes are private (as on Bluesky): owner-only RLS, never readable by the muted
-- account. Filtering happens client-side through @atproto/api moderatePost, the
-- same decision function the Bluesky app uses.
--
-- Also fixes two defects found while wiring this:
--   1. visibility='followers' posts were visible to nobody but the author — the read
--      policy only had (own OR public). Followers can now read them.
--   2. user_follows read policy was `true` and the follow graph is an outing risk on
--      this platform: now signed-in only, and hidden across a block.

-- 1. Mutes --------------------------------------------------------------------
create table if not exists public.user_mutes (
  muter_id   uuid not null references auth.users(id) on delete cascade,
  muted_id   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  constraint user_mutes_not_self check (muter_id <> muted_id)
);
alter table public.user_mutes enable row level security;
drop policy if exists "user_mutes owner" on public.user_mutes;
create policy "user_mutes owner" on public.user_mutes
  for all to authenticated
  using ((select auth.uid()) = muter_id)
  with check ((select auth.uid()) = muter_id);
revoke all on public.user_mutes from anon, public;
grant select, insert, delete on public.user_mutes to authenticated;

-- 2. Muted words (app.bsky.actor.defs#mutedWord) ------------------------------
create table if not exists public.user_muted_words (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  value        text not null check (char_length(btrim(value)) between 1 and 100),
  targets      text[] not null default array['content','tag']
               check (cardinality(targets) >= 1 and targets <@ array['content','tag']),
  actor_target text not null default 'all' check (actor_target in ('all','exclude-following')),
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, value)
);
alter table public.user_muted_words enable row level security;
drop policy if exists "user_muted_words owner" on public.user_muted_words;
create policy "user_muted_words owner" on public.user_muted_words
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on public.user_muted_words from anon, public;
grant select, insert, update, delete on public.user_muted_words to authenticated;

-- 3. Moderation prefs (subset of @atproto/api ModerationPrefs) ----------------
create table if not exists public.user_moderation_prefs (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  adult_content_enabled boolean not null default false,
  label_prefs           jsonb not null default '{}'::jsonb
                        check (jsonb_typeof(label_prefs) = 'object'),
  updated_at            timestamptz not null default now()
);
alter table public.user_moderation_prefs enable row level security;
drop policy if exists "user_moderation_prefs owner" on public.user_moderation_prefs;
create policy "user_moderation_prefs owner" on public.user_moderation_prefs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on public.user_moderation_prefs from anon, public;
grant select, insert, update on public.user_moderation_prefs to authenticated;

-- 4. Self-labels on posts (Bluesky global self-label values) ------------------
alter table public.community_posts
  add column if not exists labels text[] not null default '{}';
alter table public.community_posts drop constraint if exists community_posts_labels_check;
alter table public.community_posts add constraint community_posts_labels_check
  check (labels <@ array['porn','sexual','nudity','graphic-media']);

-- 5. Followers-only posts become readable by followers ------------------------
drop policy if exists "Community posts read" on public.community_posts;
create policy "Community posts read" on public.community_posts
  for select using (
    (
      ((select auth.uid()) = user_id)
      or (visibility = 'public')
      or (visibility = 'followers' and exists (
            select 1 from public.user_follows f
            where f.follower_id = (select auth.uid())
              and f.following_id = community_posts.user_id))
    )
    and not public.is_blocked(user_id, (select auth.uid()))
  );

-- 6. Follow graph: signed-in only, hidden across a block ----------------------
drop policy if exists "User follows read" on public.user_follows;
create policy "User follows read" on public.user_follows
  for select to authenticated using (
    not public.is_blocked(follower_id, (select auth.uid()))
    and not public.is_blocked(following_id, (select auth.uid()))
  );
revoke all on public.user_follows from anon;

-- Postconditions ---------------------------------------------------------------
do $verify$
begin
  if has_table_privilege('anon', 'public.user_mutes', 'select')
     or has_table_privilege('anon', 'public.user_muted_words', 'select')
     or has_table_privilege('anon', 'public.user_moderation_prefs', 'select')
     or has_table_privilege('anon', 'public.user_follows', 'select') then
    raise exception 'social moderation: anon can read a private social table';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'community_posts_labels_check') then
    raise exception 'social moderation: labels CHECK missing';
  end if;
end
$verify$;
