-- Tag DQ Phase 3 — image provenance.
--
-- The plan says: backfill license/source for 1,215 images and alt text for all
-- of them. Measured on prod 2026-08-23, MOST OF THAT IS NOT ACHIEVABLE AS DATA
-- WORK, and one half of it is not a defect at all. Both findings below are the
-- deliverable; the code is small because the honest scope is small.
--
-- ## Where the 1,204 unlicensed images actually live
--
--   host                     n     no_license   has_qid
--   supabase.co (mirrored)   945        945        637
--   img.queer.guide          248        248         59
--   upload.wikimedia.org     328          4        326
--   data: SVG placeholder    294          0        211
--   unsplash / pexels          7          7          5
--
-- The 1,193 self-hosted ones CANNOT have their license recovered from the
-- database. Their filenames are `<tag-slug>-<unix-ms>.jpg` — the source
-- filename was not preserved, `image_source` is null on all of them,
-- `image_attribution` is null on all of them, and `image_prompt` (which would
-- prove they were generated rather than sourced) is null on all of them too.
-- Nothing links the stored bytes back to an origin. Writing a license we cannot
-- prove would be a false attribution claim on someone else's photograph, which
-- is strictly worse than a null. They stay null, and the Phase 5 ratchet stops
-- the number growing.
--
-- Note the data: URIs are NOT part of the problem — all 294 gradient
-- placeholders already carry a license (they are generated, so we own them).
--
-- ## image_without_alt is not an accessibility defect
--
-- The Phase 5 metric shipped with the comment "WCAG 1.1.1 on every page
-- rendering a tag image". That claim is wrong and this migration retracts it.
-- Every render path already handles a missing alt correctly:
--
--   src/components/tags/index/TagIndexCard.tsx:60   alt=""        (hardcoded)
--   src/components/tags/MoreLikeThisByTag.tsx:90    alt=""        (hardcoded)
--   src/components/tags/FollowedTagsFeed.tsx:93     alt=""        (hardcoded)
--   src/pages/TagDetail.tsx:457                     alt={image_alt ?? ''}
--
-- An empty alt on an image whose meaning is already carried by the adjacent tag
-- name is the CORRECT treatment, not a failure — and inventing prose to fill
-- 1,204 alt attributes would replace a correct empty alt with a fabricated
-- description of a photo nobody has looked at. The metric is renamed to say
-- what it measures (a column, not a barrier) and the false claim is removed.

-- ---------------------------------------------------------------------------
-- What IS recoverable: images actually hosted on Wikimedia Commons. 324 of the
-- 328 already carry provenance; this makes the remaining 4 self-healing and
-- keeps working for any Commons image added later.
--
-- Matching is by `imageinfo[].url` compared against unified_tags.image_url —
-- an exact string equality on the URL we already hold. The obvious alternative,
-- deriving the Commons title from the URL's last path segment, requires
-- percent-DECODING (`..._SML_%28589261692%29.jpg`) which Postgres has no
-- builtin for, and a decoding bug would silently attach one file's license to
-- another file's photo.
create or replace function public.run_tag_image_provenance_sync(p_limit int default 200)
returns table (considered int, updated int, api_errors int, unmatched int)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_considered int := 0; v_updated int := 0; v_apierr int := 0; v_unmatched int := 0;
begin
  perform public.assert_admin_or_internal();
  set local statement_timeout = '120s';
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '15');
  perform extensions.http_set_curlopt('CURLOPT_USERAGENT',
    'QueerGuide/1.0 (https://queer.guide; contact@queer.guide)');

  -- Actor, not bypass: 20260904100000 blocks system:% actors from touching a
  -- human_reviewed tag, and a license recovered from Commons is exactly the
  -- kind of fact a curator would want written.
  perform set_config('app.actor', 'job:tag_image_provenance_sync', true);

  create temp table _todo on commit drop as
    select id, image_url,
           -- last path segment, still percent-encoded: safe to paste into a URL
           regexp_replace(image_url, '^.*/', '') as fname
      from public.unified_tags
     where status = 'active' and merged_into_id is null
       and image_url like 'https://upload.wikimedia.org/%'
       and (image_license is null or image_source is null
            or nullif(btrim(coalesce(image_attribution, '')), '') is null)
     order by id
     limit greatest(p_limit, 0);
  select count(*) into v_considered from _todo;
  if v_considered = 0 then
    considered := 0; updated := 0; api_errors := 0; unmatched := 0; return next; return;
  end if;

  create temp table _fetch on commit drop as
    -- Two levels: a window function cannot appear in GROUP BY, so the row
    -- number is materialised first and grouped in the outer CTE. Same shape as
    -- the medical-codes sync this is modelled on.
    with ids as (
      select fname, (row_number() over (order by fname) - 1) as rn from _todo
    ), grp as (
      select rn / 25 as g, string_agg('File:' || fname, '|' order by fname) as titles
        from ids group by rn / 25
    )
    select g.g,
      (extensions.http_get(
        'https://commons.wikimedia.org/w/api.php?action=query&format=json'
        || '&prop=imageinfo&iiprop=url|extmetadata&titles=' || g.titles)).content as raw
    from grp g;
  select count(*) into v_apierr from _fetch where raw is null or left(raw, 1) <> '{';

  create temp table _page on commit drop as
    -- split_part(..., '?', 1) is LOAD-BEARING. Commons appends its own
    -- analytics query string to the url it returns
    -- (`...jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&...`),
    -- so a bare equality against unified_tags.image_url matches nothing and the
    -- whole update silently becomes a no-op that reports updated=0 and reads as
    -- "there was nothing to do". Caught by running the real API before shipping.
    select split_part(p.value -> 'imageinfo' -> 0 ->> 'url', '?', 1)            as url,
           p.value -> 'imageinfo' -> 0 -> 'extmetadata'                         as meta
      from _fetch f
      cross join lateral jsonb_each((f.raw::jsonb) -> 'query' -> 'pages') p
     where f.raw is not null and left(f.raw, 1) = '{'
       and p.value -> 'imageinfo' -> 0 ->> 'url' is not null;

  -- Commons returns Artist and ImageDescription as HTML. Strip tags and decode
  -- the handful of entities that survive, or the page publishes markup.
  with clean as (
    select url,
           nullif(btrim(meta -> 'LicenseShortName' ->> 'value'), '') as lic,
           nullif(btrim(regexp_replace(
             replace(replace(replace(replace(
               coalesce(meta -> 'Artist' ->> 'value', ''),
               '&amp;','&'),'&quot;','"'),'&#039;',''''),'&nbsp;',' '),
             '<[^>]*>', '', 'g')), '')                                as artist,
           nullif(btrim(regexp_replace(
             replace(replace(replace(replace(
               coalesce(meta -> 'ImageDescription' ->> 'value', ''),
               '&amp;','&'),'&quot;','"'),'&#039;',''''),'&nbsp;',' '),
             '<[^>]*>', '', 'g')), '')                                as descr
      from _page
  )
  update public.unified_tags u
     set image_license     = coalesce(u.image_license, c.lic),
         image_attribution = coalesce(nullif(btrim(u.image_attribution), ''), c.artist),
         image_source      = coalesce(u.image_source,
                               'https://commons.wikimedia.org/wiki/File:' || t.fname),
         image_alt         = coalesce(nullif(btrim(u.image_alt), ''), left(c.descr, 300))
    from _todo t
    join clean c on c.url = t.image_url
   where u.id = t.id
     and (c.lic is not null or c.artist is not null or c.descr is not null);
  get diagnostics v_updated = row_count;

  select count(*) into v_unmatched
    from _todo t where not exists (select 1 from _page p where p.url = t.image_url);

  considered := v_considered; updated := v_updated;
  api_errors := v_apierr; unmatched := v_unmatched;
  return next;
end;
$fn$;

comment on function public.run_tag_image_provenance_sync(int) is
  'Recovers license/attribution/source/alt for tag images hosted on Wikimedia Commons, matching by exact imageinfo URL. Self-hosted images (supabase.co, img.queer.guide) are NOT recoverable — their source filename, image_source, image_attribution and image_prompt are all null, so no origin can be proven; see 20260921100000.';

revoke all on function public.run_tag_image_provenance_sync(int) from public, anon;
grant execute on function public.run_tag_image_provenance_sync(int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Retract the false WCAG claim from the Phase 5 gate, and add a counter that
-- separates "no provenance and never will have" from "recoverable".
create or replace function public.tag_hygiene_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare v jsonb;
begin
  perform assert_admin_or_internal();

  with active as (
    select * from unified_tags where status = 'active' and merged_into_id is null
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'active_tags', (select count(*) from active),
      'categories',  (select count(*) from tag_categories),
      'assignments', (select count(*) from unified_tag_assignments)
    ),
    'uncategorized_active', (
      select count(*) from active where category_id is null
        and slug !~ '^(mat|vibe|occ|dept|attr|own|rating)-'),
    'dangling_category_id', (
      select count(*) from unified_tags u where u.category_id is not null
        and not exists (select 1 from tag_categories c where c.id = u.category_id)),
    'image_without_license', (
      select count(*) from active where image_url is not null and image_license is null),
    -- Recoverable subset: hosted on Commons, so the API can still supply it.
    -- The rest is unrecoverable by construction, which is why the total above
    -- is a ratchet and not a target.
    'commons_image_without_license', (
      select count(*) from active
       where image_url like 'https://upload.wikimedia.org/%' and image_license is null),
    -- NOT an accessibility gate. Every render path already emits alt="" when
    -- this is null, which is correct for an image whose meaning is carried by
    -- the adjacent tag name. Tracked because a populated alt is better prose
    -- for the detail-page hero, not because its absence is a barrier.
    'image_alt_column_empty', (
      select count(*) from active where image_url is not null
        and nullif(btrim(image_alt), '') is null),
    'assignment_to_non_active_tag', (
      select count(*) from unified_tag_assignments a
       where not exists (select 1 from active t where t.id = a.tag_id)),
    'nonclean_entity_type', (
      select count(*) from unified_tag_assignments
       where entity_type <> lower(btrim(entity_type))),
    'duplicate_active_name', (
      select count(*) from (
        select 1 from active group by lower(btrim(name)) having count(*) > 1) d),
    'redirect_to_non_canonical', (
      select count(*) from tag_slug_redirects r
        join unified_tags t on t.id = r.tag_id
       where t.status <> 'active' or t.merged_into_id is not null),
    'sensitive_without_description', (
      select count(*) from active
       where (is_sensitive or is_adult)
         and coalesce(nullif(btrim(description), ''), short_description) is null),
    'indexable_without_description', (
      select count(*) from active
       where seo_indexable
         and coalesce(nullif(btrim(description), ''), short_description) is null)
  ) into v;

  return v;
end;
$fn$;
