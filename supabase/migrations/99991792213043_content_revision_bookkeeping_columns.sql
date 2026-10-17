-- content_revisions is 27% of the database, and 87.5% of it is one timestamp.
--
-- `content_revisions` + its entity index measure 5,348 MB + 926 MB = 6.3 GB of a
-- 23 GB instance, the largest object in the schema. Measured 2026-10-17:
--
--   rows                8,479,622 over 33 days  (~257k/day)
--   bytes/row           661
--   actor_kind=system   8,294,054 (97.8%)
--
-- 50010101100000 budgeted this at "~573 bytes/revision" and "~5,400 content rows
-- touched per day", projecting 1.2 GB/yr and a steady state near 290 MB. The
-- BYTES figure was accurate -- 661 against 573, so the changed-columns-delta
-- decision did its job. The VOLUME assumption was wrong by ~48x.
--
-- Where it comes from, over the last 200,000 revisions:
--
--   marketplace_brands.quality_checked_at    162,200   (81.1%)
--   organizations.quality_checked_at          12,753    (6.4%)
--   news_articles.trust_score,last_verified_at 3,070
--   marketplace_listings.quality_score         2,489
--   ... everything else                       < 1,700 each
--
-- The producer is `business-brand-quality-refresh` (cron `11-59/15 * * * *`, i.e.
-- FOUR passes an hour) calling `refresh_business_brand_quality()`, which stamps
-- `quality_checked_at` on all 5,177 brand rows every pass. 4 x 5,177 = 20,708,
-- which is the per-hour count observed exactly, for hour after hour.
--
-- So a content-versioning trail is spending ~328 MB/day recording a "when did I
-- last look at this" marker that carries no content at all.
--
-- THE MECHANISM FOR THIS ALREADY EXISTS AND WAS SIMPLY NOT POPULATED. This
-- migration adds no feature. `content_versioned_tables.ignore_columns` is read by
-- `log_content_revision()`, which filters changed keys through
-- `NOT (key = ANY (v_ignore))` and then, if nothing survives, returns without
-- writing a row -- under its own comment, "Only bookkeeping columns moved --
-- nothing worth a row." The early exit was built for precisely this case. Check
-- whether the capability exists before building it; a starved registry and a
-- missing feature look identical from the symptom.
--
-- The additions follow the convention already in the table rather than inventing
-- one: every registered table ignores `updated_at`; `events` already ignores
-- `last_verified_at`; `marketplace_listings` already ignores `quality_dimensions_at`.
-- These are the same class -- "when did a job last touch this" stamps and a view
-- counter that churns on reads.
--
-- DELIBERATELY NOT ADDED: `trust_score`, `quality_score`, `completeness_score`.
-- They are derived and recomputed nightly, so there is a case for ignoring them
-- too -- but they are also a signal a human might legitimately want history for,
-- and together they are under 3% of the volume. Taking the unambiguous 87.5% needs
-- no judgement call; the scores can be argued separately on their own evidence.
--
-- This does NOT retroactively shrink the table. The 8.5M existing rows stay, and
-- `content_revision_prune` (`20 2 * * *`) only deletes system rows older than 90
-- days -- the table was created 2026-09-14, so it has never deleted anything and
-- will not until ~2026-12-13. What this changes is the slope: ~497k/day of new
-- revisions at the current cadence, of which ~87.5% stop being written.

update public.content_versioned_tables
   set ignore_columns = (
         select array_agg(distinct c order by c)
           from unnest(ignore_columns || array['quality_checked_at']) c)
 where table_name in ('marketplace_brands', 'organizations');

update public.content_versioned_tables
   set ignore_columns = (
         select array_agg(distinct c order by c)
           from unnest(ignore_columns || array['last_verified_at', 'views_count']) c)
 where table_name = 'news_articles';

update public.content_versioned_tables
   set ignore_columns = (
         select array_agg(distinct c order by c)
           from unnest(ignore_columns
                       || array['link_checked_at', 'attributes_extracted_at', 'views_count']) c)
 where table_name = 'marketplace_listings';

do $verify$
declare
  v_missing          text;
  v_rows             int;
  v_before           bigint;
  v_id               uuid;
  v_bookkeeping_revs bigint := -1;
  v_content_revs     bigint := -1;
begin
  -- 1. Every name in EVERY registry row must be a real column. `ignore_columns` is
  -- plain text with no constraint tying it to the catalog, so a typo is not an
  -- error -- it is an entry that silently never matches, which looks exactly like
  -- a working exclusion until someone measures the volume again. Checked across
  -- the whole registry, not only the rows this file touches.
  select string_agg(format('%s.%s', t.table_name, col), ', ')
    into v_missing
    from public.content_versioned_tables t,
         unnest(t.ignore_columns) col
   where not exists (
     select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = t.table_name
        and c.column_name = col);
  if v_missing is not null then
    raise exception 'ignore_columns names column(s) that do not exist: %', v_missing;
  end if;

  -- 2. The four rows this file targets must now carry the new entries.
  select count(*) into v_rows
    from public.content_versioned_tables
   where (table_name in ('marketplace_brands', 'organizations')
            and ignore_columns @> array['quality_checked_at'])
      or (table_name = 'news_articles'
            and ignore_columns @> array['last_verified_at', 'views_count'])
      or (table_name = 'marketplace_listings'
            and ignore_columns @> array['link_checked_at', 'attributes_extracted_at', 'views_count']);
  if v_rows <> 4 then
    raise exception 'expected 4 registry rows updated, found %', v_rows;
  end if;

  -- 3. `updated_at` must survive on all four. The array is rebuilt rather than
  -- appended to, so a mistake here would silently drop the exclusion every table
  -- has had since the trail was created.
  select count(*) into v_rows
    from public.content_versioned_tables
   where table_name in ('marketplace_brands', 'organizations',
                        'news_articles', 'marketplace_listings')
     and ignore_columns @> array['updated_at'];
  if v_rows <> 4 then
    raise exception 'updated_at was dropped from % of 4 rows', 4 - v_rows;
  end if;

  -- 4. BEHAVIOURAL, and the only check that proves the trail still works. A
  -- registry assertion passes equally against a trigger that has stopped
  -- recording anything at all, which would be a far worse outcome than the
  -- bloat this file exists to slow.
  --
  -- It runs inside a SUBTRANSACTION that rolls itself back: the inner block
  -- mutates a real brand row, records what the trigger did into variables, then
  -- raises a sentinel so PostgreSQL undoes the writes, and the verdicts are
  -- asserted afterwards from the captured numbers. A probe that writes to
  -- production data and then tries to tidy up after itself is the worse design --
  -- a first draft of this did exactly that and its cleanup matched "the most
  -- recent description-only revision for this table", which on a live instance is
  -- just as likely to be somebody else's row, and would have reverted a real
  -- brand description and deleted a real audit row.
  -- `story` is the brand prose field and is unambiguously content. Deliberately
  -- not `display_name`, which is non-null on all 5,177 stamped rows but feeds
  -- `brand_key`/`slug` derivation, so mutating it could pull extra columns into
  -- the delta and make the "exactly 1 revision" assertion test the wrong thing.
  -- Note `marketplace_brands` has no `description` column at all -- a first draft
  -- assumed one and failed at 42703 on the dry run. The seven ignore_columns
  -- names were checked against the catalog; the probe's own column was not.
  select id into v_id from public.marketplace_brands
   where quality_checked_at is not null and story is not null limit 1;

  if v_id is null then
    raise notice 'no suitable marketplace_brands row; behavioural check skipped';
  else
    begin
      select count(*) into v_before from public.content_revisions
       where source_table = 'marketplace_brands' and source_id = v_id;

      -- 4a. A bookkeeping-only update must record NOTHING.
      update public.marketplace_brands
         set quality_checked_at = quality_checked_at + interval '1 second'
       where id = v_id;
      select count(*) - v_before into v_bookkeeping_revs
        from public.content_revisions
       where source_table = 'marketplace_brands' and source_id = v_id;

      -- 4b. A real content change on the SAME row must still record. Without this
      -- half, 4a is satisfied by a dead trigger.
      update public.marketplace_brands
         set story = story || ' probe'
       where id = v_id;
      select count(*) - v_before - v_bookkeeping_revs into v_content_revs
        from public.content_revisions
       where source_table = 'marketplace_brands' and source_id = v_id;

      raise exception 'ROLLBACK_BEHAVIOURAL_PROBE';
    exception
      when others then
        if sqlerrm <> 'ROLLBACK_BEHAVIOURAL_PROBE' then
          raise;
        end if;
    end;

    if v_bookkeeping_revs <> 0 then
      raise exception 'bookkeeping-only update still recorded % revision(s)', v_bookkeeping_revs;
    end if;
    if v_content_revs <> 1 then
      raise exception 'content change recorded % revisions, expected exactly 1', v_content_revs;
    end if;
  end if;

  raise notice 'content_revisions: bookkeeping columns excluded; trail verified live on both halves';
end $verify$;
