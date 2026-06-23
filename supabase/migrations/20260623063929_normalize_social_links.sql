-- Normalize social media storage across entities + social-profile card cache.
--
-- Standardizes on a jsonb `social_links` map (platformKey -> full URL), matching
-- the existing personalities/profiles convention. Adds the column where missing,
-- folds venues.instagram + venues.organizer_handles into it, and keeps the legacy
-- venues.instagram column mirrored for any code still reading it.
--
-- Reused as-is (no new column): organizations.social (jsonb), marketplace_listings.social_media (jsonb).

-- 1. Add social_links to the entities that lack any normalized jsonb social column.
alter table public.events           add column if not exists social_links jsonb not null default '{}'::jsonb;
alter table public.cities           add column if not exists social_links jsonb not null default '{}'::jsonb;
alter table public.queer_villages   add column if not exists social_links jsonb not null default '{}'::jsonb;
alter table public.venues           add column if not exists social_links jsonb not null default '{}'::jsonb;

-- 2. Backfill venues from the legacy instagram + organizer_handles columns.
--    Small (~30 rows) so no batching needed; values are canonicalized on read.
update public.venues
set social_links = coalesce(social_links, '{}'::jsonb)
  || coalesce(organizer_handles, '{}'::jsonb)
  || case
       when instagram is not null and instagram <> '' then
         jsonb_build_object(
           'instagram',
           case when instagram ~* '^https?://' then instagram
                else 'https://instagram.com/' || ltrim(instagram, '@') end)
       else '{}'::jsonb
     end
where coalesce(social_links, '{}'::jsonb) = '{}'::jsonb
  and ((instagram is not null and instagram <> '')
       or (organizer_handles is not null and organizer_handles <> '{}'::jsonb));

-- 3. Keep legacy venues.instagram populated from social_links (BEFORE trigger,
--    mutates NEW only — no extra row write, no search-reindex storm).
create or replace function public.sync_venue_instagram_from_social()
returns trigger
language plpgsql
as $$
begin
  if (new.social_links ? 'instagram')
     and (new.instagram is null or new.instagram = '') then
    new.instagram := new.social_links ->> 'instagram';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_venue_instagram on public.venues;
create trigger trg_sync_venue_instagram
  before insert or update of social_links on public.venues
  for each row execute function public.sync_venue_instagram_from_social();

-- 4. social_profiles: server-side cache for privacy-safe link cards (Pillar B).
--    Images are mirrored to R2; clients never contact the source platform.
create table if not exists public.social_profiles (
  id              uuid primary key default gen_random_uuid(),
  platform        text not null,
  handle          text not null,
  profile_url     text,
  display_name    text,
  bio             text,
  avatar_asset_id uuid references public.image_assets(id) on delete set null,
  avatar_url      text,
  follower_count  bigint,
  last_items      jsonb not null default '[]'::jsonb,
  status          text  not null default 'pending'
                    check (status in ('pending','resolved','fallback','error')),
  error           text,
  fetched_at      timestamptz,
  refresh_after   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (platform, handle)
);

create index if not exists idx_social_profiles_refresh
  on public.social_profiles (refresh_after)
  where status in ('resolved','fallback');

alter table public.social_profiles enable row level security;

-- Public-readable (only resolved/fallback cards); writes are service-role only.
drop policy if exists social_profiles_public_read on public.social_profiles;
create policy social_profiles_public_read
  on public.social_profiles for select
  using (status in ('resolved','fallback'));

grant select on public.social_profiles to anon, authenticated;
