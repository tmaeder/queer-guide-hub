-- Compact intimate discovery filters, including the full consent-forward kink
-- taxonomy. Cross-user kink rows remain behind the existing per-category
-- visibility ladder; selecting a filter does not bypass a person's sharing
-- choice.

create or replace function public.intimate_discover(
  p_city_id uuid default null,
  p_roles text[] default null,
  p_kink_item_slugs text[] default null,
  p_age_bands text[] default null,
  p_body_types text[] default null,
  p_limit int default 200
)
returns table(
  user_id uuid,
  display_name text,
  avatar_url text,
  discovery_city_id uuid,
  role text[],
  into_tags text[],
  body_type text,
  age_band text,
  height_cm integer,
  last_active_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_viewer uuid := auth.uid();
begin
  if v_viewer is null or not public.is_intimate_eligible(v_viewer) then
    return;
  end if;

  return query
  select
    ip.id,
    p.display_name,
    p.avatar_url,
    ip.discovery_city_id,
    ip.role,
    ip.into_tags,
    ip.body_type,
    ip.age_band,
    ip.height_cm,
    ip.last_active_at
  from public.intimate_profiles ip
  join public.profiles p on p.id = ip.id
  where ip.id <> v_viewer
    and ip.opted_in_at is not null
    and ip.moderation_status = 'approved'
    and public.is_intimate_eligible(ip.id)
    and not public.intimate_is_blocked(ip.id, v_viewer)
    and (p_city_id is null or ip.discovery_city_id = p_city_id)
    and (coalesce(cardinality(p_roles), 0) = 0 or ip.role && p_roles)
    and (coalesce(cardinality(p_age_bands), 0) = 0 or ip.age_band = any(p_age_bands))
    and (coalesce(cardinality(p_body_types), 0) = 0 or ip.body_type = any(p_body_types))
    and (
      coalesce(cardinality(p_kink_item_slugs), 0) = 0
      or exists (
        select 1
        from public.kink_items ki
        where ki.is_active
          and ki.slug = any(p_kink_item_slugs)
          and (
            (
              ki.unified_tag_slug is not null
              and (
                ki.unified_tag_slug = any(ip.into_tags)
                or replace(ki.unified_tag_slug, 'intimate-', '') = any(ip.into_tags)
              )
            )
            or exists (
              select 1
              from public.kink_ratings kr
              join public.kink_category_visibility kv
                on kv.user_id = kr.user_id
               and kv.category_id = ki.category_id
              where kr.user_id = ip.id
                and kr.item_id = ki.id
                and kr.rating in ('favorite', 'like', 'curious', 'maybe')
                and public.kink_access_rank(v_viewer, ip.id)
                    >= public.kink_tier_rank(kv.tier)
            )
          )
      )
    )
  order by ip.last_active_at desc nulls last, ip.id
  limit least(greatest(coalesce(p_limit, 200), 1), 200);
end;
$$;

revoke all on function public.intimate_discover(uuid, text[], text[], text[], text[], int)
  from public, anon;
grant execute on function public.intimate_discover(uuid, text[], text[], text[], text[], int)
  to authenticated;
