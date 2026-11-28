-- Optional detail fields, round 2. Editor-entered only: every row starts NULL,
-- and nothing generates, infers or backfills these values.
--
-- Exposure, checked per table:
--   events, marketplace_listings, queer_villages: table-level SELECT for anon +
--     authenticated (no column allowlist); the detail pages read '*'. Nothing to
--     grant.
--   news_sources: anon holds a COLUMN allowlist since 22000101100200, so the
--     three listen links are granted to anon explicitly below. Admins and
--     moderators already UPDATE this table through RLS ("Admins can update news
--     sources") and the table-level authenticated grant.
--   news_stories: summary already exists (always NULL). Readers had SELECT, but
--     nobody could write it: the only policy is "public read". An UPDATE policy
--     for admin/moderator/editor plus a column-scoped UPDATE grant makes it
--     editable from the story page; no other column becomes writable.
-- None of these are added to search indexing.

alter table public.events
  add column if not exists admission_rules text,
  add column if not exists dress_code text;

alter table public.marketplace_listings
  add column if not exists event_date timestamptz,
  add column if not exists billing_interval text,
  add column if not exists recipient text;

alter table public.marketplace_listings
  add constraint marketplace_listings_billing_interval_known
    check (billing_interval in ('one_time', 'week', 'month', 'year'));

alter table public.queer_villages
  add column if not exists best_time_to_visit text,
  add column if not exists suits text;

alter table public.news_sources
  add column if not exists apple_podcasts_url text,
  add column if not exists spotify_url text,
  add column if not exists youtube_url text;

alter table public.news_sources
  add constraint news_sources_apple_podcasts_url_https check (apple_podcasts_url ~ '^https://'),
  add constraint news_sources_spotify_url_https check (spotify_url ~ '^https://'),
  add constraint news_sources_youtube_url_https check (youtube_url ~ '^https://');

grant select (apple_podcasts_url, spotify_url, youtube_url) on public.news_sources to anon;

revoke update on public.news_stories from anon, authenticated;
grant update (summary) on public.news_stories to authenticated;

drop policy if exists "editors update news_stories" on public.news_stories;
create policy "editors update news_stories" on public.news_stories
  for update to authenticated
  using (public.has_any_role_jwt(array['admin', 'moderator', 'editor']::public.app_role[]))
  with check (public.has_any_role_jwt(array['admin', 'moderator', 'editor']::public.app_role[]));

comment on column public.events.admission_rules is 'Entry requirements, e.g. "Members only", "ID required". Editor-entered.';
comment on column public.events.dress_code is 'Dress code. Editor-entered.';
comment on column public.marketplace_listings.event_date is 'Date of the event a ticket is for. Editor-entered.';
comment on column public.marketplace_listings.billing_interval is 'How a membership or service is billed. Editor-entered; one_time|week|month|year.';
comment on column public.marketplace_listings.recipient is 'Who a donation goes to. Editor-entered.';
comment on column public.queer_villages.best_time_to_visit is 'When to visit the district. Editor-entered.';
comment on column public.queer_villages.suits is 'Who the district suits. Editor-entered.';
comment on column public.news_sources.apple_podcasts_url is 'Podcast show on Apple Podcasts. Editor-entered, https only.';
comment on column public.news_sources.spotify_url is 'Podcast show on Spotify. Editor-entered, https only.';
comment on column public.news_sources.youtube_url is 'Podcast show on YouTube. Editor-entered, https only.';
