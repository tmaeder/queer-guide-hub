-- Retire the orphaned glossary asset links (2026-10-10)
-- ----------------------------------------------------------------------------
-- `image_asset_links` carries 6,371 rows at `entity_type = 'tag'`, role
-- `cover`, over 3,267 distinct assets. They render NOWHERE: the 2026-08-28
-- photography retirement (20261003100000) nulled `unified_tags.image_url`, and
-- that column is what every reader surface uses. So this deletes dead weight,
-- not live content -- but it is dead weight shaped exactly like data, which is
-- the reason to remove it rather than leave it.
--
-- WHAT IS IN THERE, measured rather than assumed. Three cohorts:
--
--   3,407 links /   360 assets  `image_source='gradient'`, license CC0
--   2,027 links / 2,027 assets  Supabase Storage `tag-images/*`, license NULL
--     937 links /   880 assets  `upload.wikimedia.org`, license 'Wikimedia Commons'
--
-- The gradient cohort is the one that makes this urgent. Those 360 assets are
-- `data:image/svg+xml` placeholders assigned ROUND-ROBIN, and their `alt_text`
-- names a DIFFERENT tag than the row they sit on -- one asset whose alt reads
-- "burrata-cheese" is linked to `forgiveness`, `locktober`, `cum-on-command-coc`
-- and `yoni`; another reading "Nudist sauna" to `espresso` and `anovulation`.
-- 115 assets are linked to 11+ tags each, worst 18. There is no correspondence
-- between asset and tag anywhere in that cohort.
--
-- The Wikimedia cohort looks salvageable and is not. Hand-read, 16 of the
-- highest-usage rows gave ~6 defensible: `dildo` -> LGBT_history_museum.jpg,
-- `harness` -> Armures, reserves du musee de l'Armee (medieval armour),
-- `cum` -> Sca_fell_massif2010.JPG (a mountain), `unicorn` -> "Unicorn spider
-- outline", `hindu` -> India-locator-map-blank.svg. That is the namesake-chimera
-- class this repo already documents for tag Wikidata links, one medium over.
--
-- WHY THE LINKS AND NOT THE ASSETS. `image_asset_links` is a many-to-many
-- usage registry and an asset may legitimately be linked by another entity
-- type; deleting assets would reach outside the glossary. The R2 objects and
-- the `image_assets` rows are untouched, so with this snapshot the delete is
-- reversible by re-inserting the saved tuples.
--
-- ORDERING: this file MUST sort below 99991791616269_tag_image_contract, which
-- creates a partial unique index making one asset the cover of at most one tag.
-- That index CANNOT be built while this data exists -- 411 assets are the cover
-- of two or more tags -- so cleanup first is a hard dependency, not a
-- preference. Verified by building the index in a rolled-back transaction on
-- prod before this file existed: it failed with 23505.
--
-- No `app.actor` declaration: this touches `image_asset_links` only and never
-- `unified_tags`, so `log_unified_tag_change()`'s human_reviewed guard -- the
-- one the retirement migration's first push died on -- is not on this path.

-- ── 1. Preserve ─────────────────────────────────────────────────────────────

create table if not exists public.tag_image_link_retirement (
  asset_id    uuid        not null,
  entity_id   uuid        not null,
  role        text        not null,
  sort_order  integer,
  added_by    uuid,
  added_at    timestamptz,
  asset_url   text,
  asset_alt   text,
  asset_source  text,
  asset_license text,
  retired_at  timestamptz not null default now(),
  primary key (asset_id, entity_id, role)
);

comment on table public.tag_image_link_retirement is
  'Snapshot of the entity_type=''tag'' rows of image_asset_links, taken by the '
  '2026-10-10 orphaned-link retirement before they were deleted. Reversal '
  'source of record. The asset_* columns are denormalised from image_assets so '
  'the snapshot stays interpretable if an asset is later pruned; no FK, so it '
  'outlives both the tag and the asset. Service-role only.';

alter table public.tag_image_link_retirement enable row level security;

-- `entity_type` is not stored: every row in here is a tag link by construction,
-- and a column that can only hold one value invites a reader to filter on it.
insert into public.tag_image_link_retirement
  (asset_id, entity_id, role, sort_order, added_by, added_at,
   asset_url, asset_alt, asset_source, asset_license)
select l.asset_id, l.entity_id, l.role, l.sort_order, l.added_by, l.added_at,
       a.url, a.alt_text, a.source, a.license
  from public.image_asset_links l
  left join public.image_assets a on a.id = l.asset_id
 where l.entity_type = 'tag'
on conflict (asset_id, entity_id, role) do nothing;

-- ── 2. Clear ────────────────────────────────────────────────────────────────

delete from public.image_asset_links where entity_type = 'tag';

-- ── 3. Verify ───────────────────────────────────────────────────────────────
-- Positive postconditions: assert the state this file exists to REACH, not a
-- count of rows in the bad state. "0 rows left in a bad state" also passes when
-- the table has gone missing, which is the vacuous-assertion class this repo
-- has hit in five separate migrations.

do $verify$
declare
  v_left     integer;
  v_snapshot integer;
  v_assets   integer;
begin
  select count(*) into v_left from public.image_asset_links where entity_type = 'tag';
  if v_left <> 0 then
    raise exception 'tag links remain after the delete: % rows', v_left;
  end if;

  select count(*) into v_snapshot from public.tag_image_link_retirement;
  if v_snapshot < 6000 then
    raise exception
      'the snapshot holds only % rows -- it was measured at 6,371 on 2026-10-10, '
      'so a number this low means the insert did not run and the delete above '
      'destroyed the only copy', v_snapshot;
  end if;

  -- The assets themselves must SURVIVE. This is the half a "delete the tag
  -- images" change gets wrong: cascading to image_assets would reach other
  -- entity types, and the R2 objects are the reversal path.
  select count(*) into v_assets
    from public.image_assets a
   where exists (select 1 from public.tag_image_link_retirement r where r.asset_id = a.id);
  if v_assets = 0 then
    raise exception 'every snapshotted asset is gone from image_assets -- the delete cascaded';
  end if;

  raise notice 'tag image links retired: % snapshotted, % assets intact', v_snapshot, v_assets;
end
$verify$;
