-- public.marketplace_categories: deactivate the 2025-07-23 scrape residue.
--
-- WHAT IS IN THERE. 267 rows. Ten are a legitimate seeded tree (Clothing &
-- Fashion, Books & Literature, Health & Beauty, …) and every one of them
-- carries a `description`. The other 257 arrived in a single import burst on
-- 2025-07-23 and are not categories at all:
--   * bare prices as category names — 47.99, 59.99, 99.99, 329.99, 539.99,
--     589.99, 679.99 (79 rows begin with a digit)
--   * merchant and brand names — Tantaly UK, Cerqular, tantabosom
--   * storefront nav labels — All Products, Best Sellers, New Arrival
--   * and explicit product-copy fragments published as CATEGORY NAMES, e.g.
--     "juicy pussy" and "she offers the full trio of sensations: titty-fucking",
--     plus a 160-character masturbation product blurb. 130 rows have a name
--     longer than 40 characters.
--
-- WHY THIS IS SAFE, all measured on prod before writing:
--   * FROZEN. All 267 rows share created_at 2025-07-23; nothing has written to
--     this table in the 14 months since. There is no INSERT path in this repo —
--     every reference in migrations/, src/, functions/, workers/ and scraper/
--     is a SELECT-to-resolve-by-name-or-slug. So there is no producer to seal.
--   * UNREADABLE BY ANON. RLS is enabled, `anon` holds no SELECT grant, and no
--     browse surface reads the table. The only exposure is that `authenticated`
--     holds ALL, so any signed-in user can read the product copy over PostgREST.
--   * Only 11 marketplace_listings rows carry a category_id at all — 3 active
--     and 8 inactive. (An earlier draft of this header said "only 3 ... at all",
--     which was the ACTIVE count quoted as if it were the total. The UPDATE
--     below touches no listing either way: deactivating a category leaves every
--     FK intact.)
--
-- WHY `is_active = false` AND NOT A DELETE. Both resolvers already filter on
-- it — 20260501040000_commit_marketplace_staging_item.sql:85 and
-- 20260713195608_marketplace_commit_classification_gate.sql:109 — so flipping
-- the flag removes these rows from the only code path that reads them, with
-- none of the ceremony a hard DELETE on a content table demands here (the one
-- precedent, nonplace_city_deletion_audit, needed a full jsonb snapshot table
-- as its only way back). Reverting this is one UPDATE.
--
-- The behaviour change is that a staging item whose category text matched
-- "47.99" now resolves to NULL instead of to a junk id. That is the correct
-- outcome, and category_id feeds nothing user-visible (completeness_score
-- reads the `category` TEXT column, not category_id).
--
-- `description IS NULL` IS THE DISCRIMINATOR, and it is the whole predicate.
-- An earlier draft also tested the name shape (leading digit / length > 40 /
-- a name-character class) and that was WRONG IN THE DIRECTION THAT MATTERS:
-- "juicy pussy", "Best Sellers", "Cerqular" and "Doggy" are all name-shaped, so
-- the shape tests would have left exactly the rows this migration exists to
-- retire. Being scraped, not being ugly, is the property.
--
-- The created_at bound is what keeps this soft on preconditions: it cannot
-- touch a legitimate admin-created row (which may also have a NULL description)
-- added between authoring and merge. No row count and no frozen id list.
--
-- DELIBERATELY NOT DONE HERE: dropping the table or the category_id column
-- (still a coordinated change across two commit RPCs, get_marketplace_facets
-- and types.ts, and nothing about the junk makes it cheaper today), and
-- narrowing the `authenticated` grant to SELECT — correct, but it is a grant
-- change on a table already slated for removal and belongs with that PR.

update public.marketplace_categories
   set is_active = false,
       updated_at = now()
 where is_active
   and description is null
   and created_at < timestamptz '2025-07-24';

-- ── Postconditions: assert the REACHED state, positively ────────────────────
do $verify$
declare
  v_seeded  integer;
  v_residue integer;
begin
  -- (a) The seeded tree survived. Counting the rows that must STILL BE THERE,
  --     rather than counting bad rows — a bad-row count returns a reassuring
  --     zero for a table this migration accidentally emptied.
  select count(*) into v_seeded
    from public.marketplace_categories
   where is_active and description is not null;
  if v_seeded < 10 then
    raise exception
      'deactivation reached the seeded tree: only % active seeded categor(y|ies) left, expected >= 10',
      v_seeded;
  end if;

  -- (b) Nothing from the scrape burst is still active.
  select count(*) into v_residue
    from public.marketplace_categories
   where is_active
     and description is null
     and created_at < timestamptz '2025-07-24';
  if v_residue <> 0 then
    raise exception 'scrape residue still active: % row(s)', v_residue;
  end if;

  raise notice 'marketplace_categories: % seeded categories active, scrape residue deactivated', v_seeded;
end
$verify$;
