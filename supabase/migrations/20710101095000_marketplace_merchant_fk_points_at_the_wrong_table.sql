-- `marketplace_listings.merchant_id` references the wrong table, and that is why no
-- marketplace merge can be undone.
--
-- MEASURED ON PROD, 2026-09-12:
--
--     marketplace_listings                                        70,416
--       with a merchant_id                                        69,737
--       whose merchant_id resolves in `marketplace_merchants`     69,737   (100%)
--       whose merchant_id resolves in `affiliate_partners`             0   (0%)
--     marketplace_merchants rows                                      99
--     affiliate_partners rows                                         15
--
-- The constraint says `REFERENCES affiliate_partners(id)` and is flagged
-- `convalidated = true`, so Postgres believes it is enforced while every single row
-- violates it. The DATA is not wrong -- `merchant_id` is a `marketplace_merchants` id,
-- exactly as the ingest path and `marketplace_merchants.api_key_env` / `shop_domain`
-- registry imply. The CONSTRAINT is wrong.
--
-- WHY IT MATTERS RATHER THAN BEING COSMETIC. A referencing-side FK check is skipped when
-- the key column is unchanged, so most writes never notice. Some update patterns do fire
-- it, and one of them is `unmerge_entities`:
--
--     _marketplace_merge_core(keep, drop)  -> SUCCEEDS
--     unmerge_entities(audit_id)           -> 23503 on marketplace_listings_merchant_id_fkey
--
-- Reproduced on prod in a rolled-back transaction against the CURRENT, unmodified
-- functions, so this is pre-existing and not introduced by the reversibility work in
-- 20710101100000/100100. **2,925 of the 2,965 marketplace merges on record involve a
-- listing in this state**, which means marketplace merges have never been undoable --
-- not "undoable but incomplete", but throwing before they change anything. The admin
-- console's Undo button reports failure for them, which is at least honest; the silent
-- half is what the sibling migrations fix.
--
-- THE REPAIR IS THE CONSTRAINT, NOT THE DATA. The tempting alternative -- null the
-- 69,737 orphaned merchant_ids -- would destroy the entire listing->merchant link for the
-- whole catalogue to satisfy a constraint that was pointed at the wrong table. It also
-- would not be a small write: `trg_search_documents_marketplace` fires unscoped on every
-- UPDATE, so it is a 70k-row search-sync storm on a disk-constrained database.
--
-- THE COLUMN HAS TWO WRITERS WITH TWO MEANINGS, AND THAT IS THE REAL STORY. The live
-- `commit_marketplace_staging_item` resolves the merchant as
--
--     SELECT id INTO v_merchant_id FROM public.affiliate_partners
--      WHERE v_merchant_dom = ANY(domains) AND enabled = true
--
-- -- it reads `affiliate_partners` and never mentions `marketplace_merchants`. So the
-- ingest path believes this column holds an affiliate id, while every row in it holds a
-- merchant id. Repointing the FK therefore had to be checked against that writer rather
-- than assumed safe, and the check is decisive: **`affiliate_partners` is the TRAVEL
-- booking registry** -- all 15 rows are Booking.com, FlixBus, GetYourGuide, Airalo,
-- Omio, Trainline, Hotels.com, DiscoverCars and friends -- and
--
--     listings whose merchant_domain matches an enabled affiliate partner domain:  0
--
-- of 70,416. That lookup cannot match a product listing, has never matched one, and
-- leaves `v_merchant_id` NULL on every commit. The rows are filled by the merchant sync
-- instead. So repointing cannot break the commit path: there is no value it produces for
-- this table.
--
-- The residual risk is named rather than hidden: if someone later adds an
-- `affiliate_partners` row whose domain DOES match a product merchant_domain, that commit
-- would then raise 23503 against the repointed FK. The durable fix is to make the commit
-- path resolve `marketplace_merchants` like every other writer, which is a change to what
-- the column MEANS and belongs in its own PR with its own measurement. This migration
-- asserts the premise at apply time so the mismatch cannot land silently.
--
-- `ON DELETE SET NULL` is preserved from the original definition. ADD CONSTRAINT
-- validates by default, so this statement is itself the proof that all 69,737 resolve --
-- if a single row did not, the migration would abort here rather than install a
-- constraint that is false in the same way the old one was.
--
-- NOT ADDRESSED HERE: how the rows came to violate a validated constraint at all. A
-- normal DELETE on `affiliate_partners` would have set them NULL, so they were orphaned
-- by a path that bypassed FK enforcement (a restore, a bulk load, or
-- `session_replication_role = replica`). Whatever it was is not reachable from this
-- schema, and guessing at it in a migration header would be fiction.

ALTER TABLE public.marketplace_listings
  DROP CONSTRAINT marketplace_listings_merchant_id_fkey;

ALTER TABLE public.marketplace_listings
  ADD CONSTRAINT marketplace_listings_merchant_id_fkey
  FOREIGN KEY (merchant_id) REFERENCES public.marketplace_merchants(id) ON DELETE SET NULL;

-- The point of this migration is that a constraint can be `convalidated` and still be
-- false of every row, so asserting "the constraint exists" would repeat the original
-- mistake. Assert the TARGET, and assert that no row violates it.
do $verify$
declare v_target text; v_bad bigint;
begin
  select cl.relname into v_target
  from pg_constraint c
  join pg_class cl on cl.oid = c.confrelid
  where c.conrelid = 'public.marketplace_listings'::regclass
    and c.conname = 'marketplace_listings_merchant_id_fkey';

  if v_target is null then
    raise exception 'marketplace_listings_merchant_id_fkey is missing';
  end if;
  if v_target <> 'marketplace_merchants' then
    raise exception 'marketplace_listings.merchant_id still references %, expected marketplace_merchants', v_target;
  end if;

  select count(*) into v_bad
  from public.marketplace_listings l
  where l.merchant_id is not null
    and not exists (select 1 from public.marketplace_merchants m where m.id = l.merchant_id);
  if v_bad > 0 then
    raise exception '% marketplace_listings rows violate the repointed merchant FK', v_bad;
  end if;

  -- Positive control: a constraint that constrains nothing would also report zero
  -- violations. Prove the column is actually populated and joinable.
  select count(*) into v_bad
  from public.marketplace_listings l
  join public.marketplace_merchants m on m.id = l.merchant_id;
  if v_bad = 0 then
    raise exception 'no marketplace_listings row resolves to a merchant -- the check above proved nothing';
  end if;

  -- The premise that makes this safe: `commit_marketplace_staging_item` still resolves
  -- merchant_id out of `affiliate_partners`, and that is only harmless while no product
  -- listing can match an affiliate partner's domain. If that ever stops being true, this
  -- migration's reasoning is void and the commit path must be repointed first -- so fail
  -- here rather than install a constraint the ingest path will start violating.
  select count(*) into v_bad
  from public.marketplace_listings l
  where l.merchant_domain is not null
    and exists (select 1 from public.affiliate_partners a
                 where a.enabled and l.merchant_domain = any(a.domains));
  if v_bad > 0 then
    raise exception
      '% listings match an affiliate partner domain; commit_marketplace_staging_item would write an affiliate id into a column now constrained to marketplace_merchants. Repoint that lookup first.', v_bad;
  end if;

  raise notice 'merchant FK repointed to marketplace_merchants';
end $verify$;
