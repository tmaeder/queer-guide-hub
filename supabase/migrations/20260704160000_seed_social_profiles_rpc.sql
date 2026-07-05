-- Pillar B: pure-SQL seeder for social_profiles.
--
-- The social-card-refresh edge function previously scanned entity tables in JS
-- and filtered with PostgREST `.neq(col, {})`, which does not match jsonb — so
-- it seeded nothing. This RPC extracts enrichable (bluesky/mastodon/spotify/
-- soundcloud) handles across every entity social column and inserts the missing
-- ones as `pending`, returning the count newly seeded. The edge function calls
-- it for the `seed` step; the resolver then enriches pending rows via the
-- image-cdn worker (avatars mirrored to R2).

create or replace function public.seed_social_profiles()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  with u as (
    select social_links as j from venues where social_links <> '{}'::jsonb
    union all select social_links from events where social_links <> '{}'::jsonb
    union all select social_links from cities where social_links <> '{}'::jsonb
    union all select social from organizations where social <> '{}'::jsonb
    union all select social_media from marketplace_listings where social_media <> '{}'::jsonb
    union all select social_links from personalities where social_links <> '{}'::jsonb
    union all select social_links from queer_villages where social_links <> '{}'::jsonb
  ),
  cand as (
    select distinct 'bluesky'::text platform,
      lower(regexp_replace(j->>'bluesky','^https?://(?:www\.)?bsky\.app/profile/([^/?#]+).*$','\1')) handle,
      j->>'bluesky' profile_url
    from u where j ? 'bluesky' and (j->>'bluesky') ~ 'bsky\.app/profile/[^/?#]+'
    union all
    select distinct 'spotify',
      regexp_replace(j->>'spotify','^https?://open\.spotify\.com/(?:artist|user|show)/([^/?#]+).*$','\1'),
      j->>'spotify'
    from u where j ? 'spotify' and (j->>'spotify') ~ 'open\.spotify\.com/(?:artist|user|show)/[^/?#]+'
    union all
    select distinct 'soundcloud',
      lower(regexp_replace(j->>'soundcloud','^https?://(?:www\.)?soundcloud\.com/([^/?#]+).*$','\1')),
      j->>'soundcloud'
    from u where j ? 'soundcloud' and (j->>'soundcloud') ~ 'soundcloud\.com/[^/?#]+'
    union all
    select distinct 'mastodon',
      regexp_replace(j->>'mastodon','^https?://([a-z0-9.-]+)/@([a-z0-9_.]+).*$','\2@\1'),
      j->>'mastodon'
    from u where j ? 'mastodon' and (j->>'mastodon') ~ '^https?://[a-z0-9.-]+/@[a-z0-9_.]+'
  ),
  ins as (
    insert into public.social_profiles (platform, handle, profile_url, status)
    select platform, handle, profile_url, 'pending' from cand
    where handle is not null and handle <> ''
    on conflict (platform, handle) do nothing
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end;
$$;

grant execute on function public.seed_social_profiles() to service_role;
