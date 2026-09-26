-- Renaming 49 maker pages created 9 pairs of maker pages with the SAME title.
--
-- `20260919193550` renamed `display_name` on 49 approved brand rows whose feed
-- `vendor` field held a legal entity, a compliance firm or store chrome. It
-- deliberately did NOT touch `brand_key`, because `slug` derives from it and
-- there is no brand slug-redirect table — a re-key would 404 a URL
-- `sitemap-brands.xml` is advertising.
--
-- The consequence it did not predict: for 9 of the 49, the clean brand ALREADY
-- had its own brand row, so the rename produced two approved, sitemapped maker
-- pages with an identical `<title>` — `/marketplace/brands/cssl-office-2` and
-- `/marketplace/brands/bathmate` both titled "Bathmate". Duplicate titles across
-- sitemapped URLs is the exact signal #3839 existed to improve, so the rename
-- traded one SEO defect for a smaller one. This closes it.
--
-- ── WHY A RE-KEY IS SAFE HERE AND UNSAFE IN GENERAL ──
-- The objection that blocked re-keying in `20260919193550` was that
-- `marketplace_register_brands()` inserts new rows as `'pending'` while the
-- sitemap is approved-only, so re-keying would DELETE the maker page it set out
-- to fix. That objection does not apply to these 9, and the reason is measured
-- rather than assumed: **every canonical target already exists, is already
-- `approved`, and already carries its own clean slug** (`bathmate`, `kiiroo`,
-- `lovense`, `shots`, `pretty-love`, `secret-play`, `kheper-games`,
-- `creative-conceptions`, `super-gay-underwear`). Nothing is minted, nothing is
-- unpublished, and the surviving URL is one the sitemap already advertises.
-- The migration ASSERTS that precondition rather than trusting it, and aborts if
-- any target is not an approved slugged row — so copying this file for a pair
-- where the target does not exist fails loudly instead of silently deleting a
-- maker page.
--
-- ── the NULL slug is load-bearing, not tidiness ──
-- `get_marketplace_brand(p_slug)` has NO status filter — it is `WHERE b.slug =
-- p_slug` and deliberately serves unapproved rows so admins can preview pending
-- brands. Setting `status='rejected'` alone would leave all 9 artifact pages
-- live at their old URLs over an empty product grid. With a NULL slug the lookup
-- cannot match and the page takes its existing dead-end branch. That is
-- `99100101143000`'s finding, reused verbatim.
--
-- ── `brand_key` is GENERATED ──
-- over `brand` on `marketplace_listings`, so step 1 writes `brand` and the key
-- follows. Writing `brand_key` directly is an error.
--
-- ── the two duplicates left standing are NOT mine ──
-- `Fort Troff` (`fort-troff` 29 / `fort-troff-c6b6` 60) and `MR. Riegillio`
-- (`mr-riegillio` 18 / `mr-riegillio-988d` 588) were duplicated BEFORE either
-- migration — `reviewer_note` carries no rename stamp on them — so duplicate
-- display names are a pre-existing condition in this table, not something the
-- rename invented. They are excluded by name from postcondition (a) so the
-- invariant reads as a decision rather than an oversight. Both need a
-- `brand_key` merge whose surviving slug is the UGLY one (`-c6b6`, `-988d`),
-- which is a different decision about which URL to keep, and is left open.
--
-- ── reversibility ──
-- Nothing is deleted. The artifact row keeps its `brand_key` and records its
-- prior slug and its canonical partner verbatim in `reviewer_note`. Restoring a
-- pair means re-keying the listings back and restoring `status`/`slug` by hand.
-- Applied live via MCP, which stamped `20260919194058`; the file carries that
-- version so `db push` skips it. The `reviewer_note` stamp is the stable string
-- `auto-consolidate brand-dup` rather than a version number, deliberately, so a
-- renumber can never desynchronise the data from the guard that counts it.

begin;

create temp table _consol (artifact_key text primary key, canonical_name text not null) on commit drop;
insert into _consol values
  ('cssl office 2',                               'Bathmate'),
  ('creative conceptions kft.',                   'Creative Conceptions'),
  ('kheper games inc.',                           'Kheper Games'),
  ('kiiroo b.v.',                                 'Kiiroo'),
  ('themis arunterstützung ug',                   'Lovense'),
  ('shenzhen j&l technology co., ltd.',           'Pretty Love'),
  ('secret play s.l',                             'Secret Play'),
  ('shots bv',                                    'Shots'),
  ('super gay underwear | official online store', 'Super Gay Underwear');

-- Precondition: every canonical target must ALREADY be an approved, slugged row.
-- This is what makes the re-key safe, so it is checked, not assumed.
do $pre$
declare v int;
begin
  select count(*) into v from _consol c
  where not exists (
    select 1 from marketplace_brands b
    where b.brand_key = marketplace_normalize_brand(c.canonical_name)
      and b.status='approved' and b.slug is not null);
  if v <> 0 then raise exception 'consolidate: % canonical target(s) are not an approved, slugged row', v; end if;
end $pre$;

create temp table _before on commit drop as
  select c.artifact_key, c.canonical_name,
         marketplace_normalize_brand(c.canonical_name) as canonical_key,
         (select count(*) from marketplace_listings l where l.brand_key=c.artifact_key) as artifact_listings,
         (select count(*) from marketplace_listings l where l.brand_key=marketplace_normalize_brand(c.canonical_name)) as canonical_listings,
         (select slug from marketplace_brands b where b.brand_key=marketplace_normalize_brand(c.canonical_name)) as canonical_slug
  from _consol c;

-- 1. re-key the listings onto the brand they always belonged to.
update marketplace_listings l set brand = c.canonical_name, updated_at = now()
from _consol c where l.brand_key = c.artifact_key;

-- 2. retire the now-empty artifact row.
update marketplace_brands b
set status='rejected', product_count=0, slug=NULL, reviewed_at=now(), updated_at=now(),
    reviewer_note = coalesce(b.reviewer_note || ' | ','')
      || 'auto-consolidate brand-dup: same brand as "' || c.canonical_name
      || '" under a second brand_key; listings re-keyed. prior slug=' || coalesce(b.slug,'(null)')
from _consol c where b.brand_key = c.artifact_key;

-- 3. restate the receiving rows' counts. `marketplace_register_brands()` only
--    ever aggregates brands with active listings, so it can RAISE a count but
--    never lower one — which is also why step 2 had to zero the artifacts
--    explicitly rather than wait for the weekly cron to notice.
update marketplace_brands b
set product_count = (select count(*) from marketplace_listings l
                     where l.brand_key=b.brand_key and l.status='active'),
    updated_at = now()
where b.brand_key in (select canonical_key from _before);

do $verify$
declare v_dup int; v_lost int; v_live int; v_slug int;
begin
  -- a. no approved+slugged display_name is duplicated, except the two
  --    pre-existing pairs named above.
  select count(*) into v_dup from (
    select display_name from marketplace_brands
    where status='approved' and slug is not null group by display_name having count(*)>1) d
  where d.display_name not in ('Fort Troff','MR. Riegillio');
  if v_dup <> 0 then raise exception 'consolidate: % duplicate approved display_name(s) remain', v_dup; end if;

  -- b. NO LISTING WAS LOST. The canonical key must now hold both sides' rows.
  --    A "0 listings on the artifact key" check alone would also pass if the
  --    listings had been deleted, so both halves are asserted.
  select count(*) into v_lost from _before o
  where (select count(*) from marketplace_listings l where l.brand_key=o.canonical_key)
        <> o.artifact_listings + o.canonical_listings;
  if v_lost <> 0 then raise exception 'consolidate: listing totals do not reconcile for % pair(s)', v_lost; end if;

  select count(*) into v_live from marketplace_listings l
   where l.brand_key in (select artifact_key from _before);
  if v_live <> 0 then raise exception 'consolidate: % listing(s) still on an artifact brand_key', v_live; end if;

  -- c. the SURVIVING URL did not move. That is the whole reason this shape was
  --    chosen over renaming the canonical row to match the artifact.
  select count(*) into v_slug from _before o join marketplace_brands b on b.brand_key=o.canonical_key
   where b.slug is distinct from o.canonical_slug;
  if v_slug <> 0 then raise exception 'consolidate: % canonical slug(s) moved', v_slug; end if;

  raise notice 'consolidate OK: 9 pairs merged, 0 listings lost, 0 canonical slugs moved';
end $verify$;

commit;
