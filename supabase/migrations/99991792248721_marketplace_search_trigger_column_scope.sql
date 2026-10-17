-- Every marketplace product page view rebuilt that listing's search document.
--
-- `trg_search_documents_marketplace` was `AFTER INSERT OR DELETE OR UPDATE ... FOR
-- EACH ROW` with NO column list, so any UPDATE enqueued a reindex. One of the
-- writers is `increment_listing_views()`:
--
--   UPDATE public.marketplace_listings
--      SET views_count = COALESCE(views_count,0) + 1 WHERE id = ...
--
-- and `views_count` is referenced NOWHERE in `search_documents_index_marketplace`
-- (asserted below, not assumed). So a view bump enqueued a job whose output is a
-- byte-identical document: a DELETE + INSERT with six to_tsvector calls, two
-- i18n_to_tsv calls, a tag join through tag_assignments_norm + unified_tags, and a
-- join to image_assets. User traffic was driving the reindex cron.
--
-- MEASURED ON PROD, in a rolled-back transaction, on a real eligible listing:
--   queue rows for that listing   start 0 -> after views_count bump 1 -> after title change 2
-- The waste is reproduced, not inferred. Corpus-wide, `sum(views_count)` is
-- 248,275 across 9,344 listings -- that many redundant rebuilds to date.
--
-- WHY IT MATTERS BEYOND THE WASTED WORK. `search_reindex_drain` is the largest
-- single consumer on this instance: `* * * * *`, 16.35s average over the last 339
-- runs, ~390 min/day -- a 27% duty cycle -- with 9 failures per 6h and 2,255
-- lifetime budget-cap stops. marketplace_listings is 47,813 of the 60,906 queue
-- inserts in the current stats window (78%). The drain itself is correctly built
-- (it collapses duplicate pairs per claim, has an advisory lock, a 75s budget and
-- a 7-day GC); its cost is enqueue volume, so volume is what this reduces.
--
-- THE SHAPE COPIES `trg_search_documents_organization_upd`, which already does
-- this correctly on the same schema: a column list AND a `WHEN (... IS DISTINCT
-- FROM ...)` clause. Both halves are needed -- `UPDATE OF col` fires when the
-- column merely appears in the SET list, even if the value is unchanged, which is
-- exactly the `views_count = COALESCE(views_count,0)+1` pattern one column over.
--
-- INSERT AND DELETE STAY UNSCOPED and keep their own triggers: a new row always
-- needs indexing and a removed row always needs evicting. Only UPDATE is narrowed.
--
-- `content_rating` IS DELIBERATELY ABSENT AND THAT IS THE SUBTLE PART. The indexer
-- gates search inclusion on it (`coalesce(m.content_rating,'sfw') IN
-- ('sfw','suggestive')`), so it looks like it belongs in the list -- but it is a
-- GENERATED column (`marketplace_content_rating(subcategory, title, description)`).
-- A generated column can never appear in an UPDATE's SET list, so `UPDATE OF
-- content_rating` could NEVER fire: listing it would read as coverage while
-- providing none. Its three base columns are all listed, so a change to it always
-- arrives with a change to something that does fire. The same reasoning covers the
-- other four generated columns (title_normalized, subcategory_slug, brand_key,
-- boutique_score), none of which the indexer reads.
--
-- TWO COLUMNS ARE LISTED THAT THE INDEXER DOES NOT READ, on purpose: `status` and
-- `duplicate_of_id`. Neither is referenced in the indexer, but both gate visibility
-- through derived state -- `marketplace_refresh_overview_eligibility()` turns
-- status/duplicate_of_id into `overview_eligible`, and `_marketplace_merge_core`
-- sets duplicate_of_id. The asymmetry is deliberate: an extra column costs a few
-- redundant reindexes, a missing one leaves a merged or deactivated listing in
-- public search. Err toward firing.
--
-- NOT DONE HERE. `trg_search_documents_event` (10,728 updates) and
-- `trg_search_documents_news` (2,046) have the same unscoped shape and are the
-- obvious next candidates, but neither has a proven non-indexed hot writer the way
-- marketplace has `increment_listing_views`, and scoping a trigger without knowing
-- which writer it is protecting risks dropping a reindex that matters. They want
-- their own measurement.

set local lock_timeout = '5s';

drop trigger if exists trg_search_documents_marketplace on public.marketplace_listings;

create trigger trg_search_documents_marketplace_ins
  after insert on public.marketplace_listings
  for each row execute function search_documents_sync('marketplace');

create trigger trg_search_documents_marketplace_del
  after delete on public.marketplace_listings
  for each row execute function search_documents_sync('marketplace');

create trigger trg_search_documents_marketplace_upd
  after update of
    title, description, business_name, brand, category, subcategory,
    title_i18n, description_i18n,
    department, subcategory_group, subcategory_fine,
    sizes, colors, attributes,
    business_type, merchant_domain, featured,
    quality_score, deprecated_at,
    price_usd, price, slug,
    overview_image_asset_id, overview_eligible,
    status, duplicate_of_id
  on public.marketplace_listings
  for each row
  when (
       old.title                   is distinct from new.title
    or old.description             is distinct from new.description
    or old.business_name           is distinct from new.business_name
    or old.brand                   is distinct from new.brand
    or old.category                is distinct from new.category
    or old.subcategory             is distinct from new.subcategory
    or old.title_i18n              is distinct from new.title_i18n
    or old.description_i18n        is distinct from new.description_i18n
    or old.department              is distinct from new.department
    or old.subcategory_group       is distinct from new.subcategory_group
    or old.subcategory_fine        is distinct from new.subcategory_fine
    or old.sizes                   is distinct from new.sizes
    or old.colors                  is distinct from new.colors
    or old.attributes              is distinct from new.attributes
    or old.business_type           is distinct from new.business_type
    or old.merchant_domain         is distinct from new.merchant_domain
    or old.featured                is distinct from new.featured
    or old.quality_score           is distinct from new.quality_score
    or old.deprecated_at           is distinct from new.deprecated_at
    or old.price_usd               is distinct from new.price_usd
    or old.price                   is distinct from new.price
    or old.slug                    is distinct from new.slug
    or old.overview_image_asset_id is distinct from new.overview_image_asset_id
    or old.overview_eligible       is distinct from new.overview_eligible
    or old.status                  is distinct from new.status
    or old.duplicate_of_id         is distinct from new.duplicate_of_id
  )
  execute function search_documents_sync('marketplace');

comment on function public.increment_listing_views(uuid) is
  'Bumps views_count only. views_count is deliberately absent from '
  'trg_search_documents_marketplace_upd''s column list: it is not read by '
  'search_documents_index_marketplace, so a bump cannot change the search '
  'document. Adding it would make every product page view rebuild that '
  'listing''s document through the search_reindex_drain cron.';

-- ------------------------------------------------------------- postconditions
do $verify$
declare
  v_cols      text[];
  v_indexed   text[];
  v_generated text[];
  v_missing   text[];
  v_def       text;
begin
  -- the old unscoped trigger is gone and the three replacements exist
  if exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
             where c.relname='marketplace_listings' and t.tgname='trg_search_documents_marketplace') then
    raise exception 'the unscoped trg_search_documents_marketplace still exists';
  end if;
  if (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
      where c.relname='marketplace_listings'
        and t.tgname in ('trg_search_documents_marketplace_ins',
                         'trg_search_documents_marketplace_del',
                         'trg_search_documents_marketplace_upd')) <> 3 then
    raise exception 'expected the three replacement marketplace search triggers';
  end if;

  -- the UPDATE trigger's actual column list, read from the catalog
  select array_agg(a.attname::text order by a.attname) into v_cols
  from pg_trigger t
  join pg_class c on c.oid=t.tgrelid
  join pg_attribute a on a.attrelid=t.tgrelid and a.attnum = any(t.tgattr)
  where c.relname='marketplace_listings' and t.tgname='trg_search_documents_marketplace_upd';

  if v_cols is null then
    raise exception 'trg_search_documents_marketplace_upd carries no column list -- it is unscoped';
  end if;

  -- THE POINT OF THE MIGRATION: a view bump must not reach the queue.
  if 'views_count' = any(v_cols) then
    raise exception 'views_count is in the trigger column list -- every product view would reindex';
  end if;

  -- A WHEN clause is required too: UPDATE OF fires on SET-list membership alone.
  select pg_get_triggerdef(t.oid) into v_def
  from pg_trigger t join pg_class c on c.oid=t.tgrelid
  where c.relname='marketplace_listings' and t.tgname='trg_search_documents_marketplace_upd';
  if position(' WHEN (' in v_def) = 0 then
    raise exception 'trg_search_documents_marketplace_upd has no WHEN clause';
  end if;

  -- DRIFT GUARD: every marketplace_listings column the indexer reads must either be
  -- in the trigger list or be generated (in which case its base columns carry it).
  -- This is what keeps the fix durable if the indexer gains a column later.
  select array_agg(distinct m[1]) into v_indexed
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral regexp_matches(
         regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g'),
         -- [a-z0-9_] not [a-z_]: title_i18n / description_i18n carry digits, and a
         -- class without them truncates to title_i / description_i and the guard
         -- then reports its own regex as uncovered columns (observed on the first run).
         '\mm\.([a-z0-9_]+)', 'g') m
  where n.nspname='public' and p.proname='search_documents_index_marketplace';

  select coalesce(array_agg(a.attname::text), '{}') into v_generated
  from pg_attribute a
  where a.attrelid='public.marketplace_listings'::regclass
    and a.attnum>0 and not a.attisdropped and a.attgenerated<>'';

  select coalesce(array_agg(c), '{}') into v_missing
  from unnest(v_indexed) c
  where c <> 'id'
    and not (c = any(v_cols))
    and not (c = any(v_generated));

  if cardinality(v_missing) > 0 then
    raise exception 'indexer reads marketplace_listings column(s) % that the UPDATE trigger does not cover (and are not generated)', v_missing;
  end if;

  -- content_rating is generated, so it can never fire UPDATE OF; its base columns must be listed.
  if not ('subcategory' = any(v_cols) and 'title' = any(v_cols) and 'description' = any(v_cols)) then
    raise exception 'content_rating is generated from (subcategory,title,description); all three must be in the trigger list';
  end if;
end $verify$;
