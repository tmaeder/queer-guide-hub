-- GDPR Art. 20 / Swiss nFADP data portability: self-serve data export.
--
-- Aggregates everything we hold about the caller into one JSON document. Mirrors
-- the data the erasure RPC removes. Special-category free text in the intimate
-- profile is decrypted via the existing SECURITY DEFINER helper intimate_get_my_text()
-- (which itself is scoped to auth.uid()). Self-only.

create or replace function public.export_my_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  result := jsonb_build_object(
    'profile',             (select to_jsonb(p) from profiles p where p.user_id = p_user_id),
    'profile_attic',       (select data from profiles_attic where user_id = p_user_id),
    'intimate_profile',    (select to_jsonb(t) from intimate_profiles t where t.id = p_user_id),
    'intimate_profile_text', (select to_jsonb(x) from public.intimate_get_my_text() x),
    'travel_preferences',  (select jsonb_agg(to_jsonb(x)) from user_travel_preferences x where x.user_id = p_user_id),
    'trips',               (select jsonb_agg(to_jsonb(x)) from trips x where x.owner_id = p_user_id),
    'venue_reviews',       (select jsonb_agg(to_jsonb(x)) from venue_reviews x where x.user_id = p_user_id),
    'marketplace_reviews', (select jsonb_agg(to_jsonb(x)) from marketplace_reviews x where x.user_id = p_user_id),
    'community_posts',     (select jsonb_agg(to_jsonb(x)) from community_posts x where x.user_id = p_user_id),
    'photos',              (select jsonb_agg(to_jsonb(x)) from user_photos x where x.user_id = p_user_id),
    'notifications',       (select jsonb_agg(to_jsonb(x)) from notifications x where x.user_id = p_user_id),
    'venue_checkins',      (select jsonb_agg(to_jsonb(x)) from venue_checkins x where x.user_id = p_user_id),
    'favorites', jsonb_build_object(
      'cities',    (select jsonb_agg(to_jsonb(x)) from city_favorites x where x.user_id = p_user_id),
      'countries', (select jsonb_agg(to_jsonb(x)) from country_favorites x where x.user_id = p_user_id),
      'events',    (select jsonb_agg(to_jsonb(x)) from event_favorites x where x.user_id = p_user_id),
      'news',      (select jsonb_agg(to_jsonb(x)) from news_favorites x where x.user_id = p_user_id),
      'tags',      (select jsonb_agg(to_jsonb(x)) from tag_favorites x where x.user_id = p_user_id),
      'venues',    (select jsonb_agg(to_jsonb(x)) from venue_favorites x where x.user_id = p_user_id)
    )
  );

  return result;
end;
$$;

revoke all on function public.export_my_data(uuid) from public, anon;
grant execute on function public.export_my_data(uuid) to authenticated;
