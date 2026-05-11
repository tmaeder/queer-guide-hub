-- Duplicate finder RPCs for the media library

-- Exact duplicates: same content_hash
create or replace function public.find_exact_duplicates()
returns table (
  group_hash text,
  asset_id uuid,
  url text,
  thumbnail_url text,
  file_size bigint,
  created_at timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select
    ia.content_hash as group_hash,
    ia.id as asset_id,
    ia.url,
    ia.thumbnail_url,
    ia.bytes as file_size,
    ia.created_at
  from image_assets ia
  where ia.status = 'active'
    and ia.content_hash is not null
    and ia.content_hash in (
      select content_hash
      from image_assets
      where status = 'active' and content_hash is not null
      group by content_hash
      having count(*) > 1
    )
  order by ia.content_hash, ia.created_at;
$$;

-- Visual duplicates: phash hamming distance within threshold
-- Uses bit_count on XOR of hex-encoded perceptual hashes.
-- Returns pairs grouped by the earlier asset.
create or replace function public.find_visual_duplicates(
  p_hamming_threshold int default 8,
  p_limit int default 200
)
returns table (
  asset_a uuid,
  asset_b uuid,
  url_a text,
  url_b text,
  thumb_a text,
  thumb_b text,
  hamming_distance int
)
language sql stable security definer
set search_path = public
as $$
  select
    a.id as asset_a,
    b.id as asset_b,
    a.url as url_a,
    b.url as url_b,
    a.thumbnail_url as thumb_a,
    b.thumbnail_url as thumb_b,
    bit_count(
      decode(lpad(a.phash, 16, '0'), 'hex')::bit(64)
      # decode(lpad(b.phash, 16, '0'), 'hex')::bit(64)
    )::int as hamming_distance
  from image_assets a
  join image_assets b
    on a.id < b.id
    and a.phash is not null
    and b.phash is not null
    and a.status = 'active'
    and b.status = 'active'
  where bit_count(
    decode(lpad(a.phash, 16, '0'), 'hex')::bit(64)
    # decode(lpad(b.phash, 16, '0'), 'hex')::bit(64)
  )::int <= p_hamming_threshold
  order by bit_count(
    decode(lpad(a.phash, 16, '0'), 'hex')::bit(64)
    # decode(lpad(b.phash, 16, '0'), 'hex')::bit(64)
  )::int
  limit p_limit;
$$;

-- Merge duplicates: re-point all links from source to target, mark source as superseded
create or replace function public.merge_duplicate_images(
  p_keep_id uuid,
  p_remove_ids uuid[]
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  -- Re-point all asset links from remove → keep
  update image_asset_links
  set asset_id = p_keep_id
  where asset_id = any(p_remove_ids)
    and not exists (
      select 1 from image_asset_links existing
      where existing.asset_id = p_keep_id
        and existing.entity_type = image_asset_links.entity_type
        and existing.entity_id = image_asset_links.entity_id
        and existing.role = image_asset_links.role
    );

  -- Delete remaining duplicate links (already exist on target)
  delete from image_asset_links
  where asset_id = any(p_remove_ids);

  -- Mark removed assets as superseded
  update image_assets
  set status = 'superseded',
      superseded_by_id = p_keep_id,
      updated_at = now()
  where id = any(p_remove_ids);
end;
$$;

grant execute on function public.find_exact_duplicates() to authenticated;
grant execute on function public.find_visual_duplicates(int, int) to authenticated;
grant execute on function public.merge_duplicate_images(uuid, uuid[]) to authenticated;
