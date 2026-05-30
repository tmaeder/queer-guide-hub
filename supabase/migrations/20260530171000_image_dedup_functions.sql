-- Image deduplication helpers for the image_assets registry.
--
-- 1. Exact dedup: collapse_duplicate_image_assets() collapses byte-identical
--    assets (same content_hash, written by the image-ingest worker) — the older
--    row wins, newer rows are marked superseded and re-pointed at the keeper.
-- 2. Near-dup infra: hamming_hex() + find_near_duplicate_assets() are ready for
--    perceptual hashes (phash) once those are populated; they no-op while phash
--    is null.

-- ── Hamming distance over two equal-length hex strings (64-bit phash) ────────
create or replace function public.hamming_hex(a text, b text)
returns integer
language sql
immutable
strict
as $$
  select case
    when a is null or b is null or length(a) <> length(b) then null
    else length(replace((('x' || lpad(a, 16, '0'))::bit(64)
                       # ('x' || lpad(b, 16, '0'))::bit(64))::text, '0', ''))
  end
$$;

comment on function public.hamming_hex(text, text) is
  'Hamming distance between two 16-char (64-bit) hex strings, e.g. perceptual hashes. NULL on length mismatch.';

-- ── Near-duplicate lookup by perceptual hash ────────────────────────────────
create or replace function public.find_near_duplicate_assets(
  p_phash text,
  p_max_hamming integer default 6
)
returns table (id uuid, url text, phash text, distance integer)
language sql
stable
as $$
  select a.id, a.url, a.phash, public.hamming_hex(a.phash, p_phash) as distance
  from public.image_assets a
  where a.phash is not null
    and a.status = 'active'
    and length(a.phash) = length(p_phash)
    and public.hamming_hex(a.phash, p_phash) <= p_max_hamming
  order by distance asc
$$;

comment on function public.find_near_duplicate_assets(text, integer) is
  'Active assets whose perceptual hash is within p_max_hamming of p_phash, nearest first.';

-- ── Exact-duplicate collapse (content_hash) ─────────────────────────────────
create or replace function public.collapse_duplicate_image_assets(p_limit integer default 500)
returns integer
language plpgsql
as $$
declare
  v_collapsed integer := 0;
  v_rows integer;
  v_group record;
begin
  -- Each group of active assets sharing a content_hash: keep the oldest,
  -- supersede the rest.
  for v_group in
    select content_hash, min(created_at) as keep_created
    from public.image_assets
    where content_hash is not null and status = 'active'
    group by content_hash
    having count(*) > 1
    limit p_limit
  loop
    with keeper as (
      select id
      from public.image_assets
      where content_hash = v_group.content_hash and status = 'active'
      order by created_at asc, id asc
      limit 1
    )
    update public.image_assets a
    set status = 'superseded',
        superseded_by_id = (select id from keeper)
    where a.content_hash = v_group.content_hash
      and a.status = 'active'
      and a.id <> (select id from keeper);
    get diagnostics v_rows = row_count;
    v_collapsed := v_collapsed + v_rows;
  end loop;
  return v_collapsed;
end
$$;

comment on function public.collapse_duplicate_image_assets(integer) is
  'Collapse byte-identical (content_hash) active image_assets: oldest wins, newer marked superseded. Returns rows superseded.';
