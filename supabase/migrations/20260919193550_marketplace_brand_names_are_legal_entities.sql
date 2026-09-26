-- 49 maker pages were titled after a factory, a compliance firm or a shop's own chrome.
--
-- `marketplace_listings.brand` is taken VERBATIM from a Shopify feed's `vendor`
-- field. `99100101143000` closed the case where that field held a PO number;
-- this closes the case where it holds a LEGAL ENTITY. Since #3839 every
-- approved brand is advertised in `sitemap-brands.xml` (871 `<loc>`, verified
-- on prod), and `functions/_lib/detail.ts` `brandDetail` renders
-- `display_name` into the `<title>`, the `<h1>` and the Brand JSON-LD — so
-- these strings are now public page titles Google is invited to crawl.
--
-- ── the field is the EU RESPONSIBLE PERSON, and one row proves it ──
-- `BIORIUS` held a maker page over 26 listings. BIORIUS is a cosmetics
-- regulatory-compliance company; it sells nothing. It appears because GPSR /
-- cosmetics law requires an EU "responsible person" to be named, and
-- ohmyfantasy.com maps that party into `vendor`. Every one of its 26 listings
-- is titled `Shunga Erotic Art - …`. Alongside it: `THEMIS ARUnterstützung UG`
-- (all 8 listings `Lovense`), `CSSL Office 2` (all 7 `Bathmate`),
-- `MAPA GmbH` (all 10 `Billy Boy`), `Westridge Laboratories Inc` (all 10 `ID`).
--
-- Measured on prod 2026-09-19: **223 distinct brands over 6,400 listings come
-- from ohmyfantasy.com alone**, 98 of them approved+slugged and therefore in
-- the sitemap. This is ONE merchant's field mapping, not scattered noise.
--
-- ── the second signal is the TITLE, and it is what makes this safe ──
-- 97.6% of that merchant's titles are `<Brand> - <Product> - <Variant>`, so the
-- real brand is on the row already. Nothing here is inferred from the shape of
-- a name: every rename below is corroborated by the listings' own titles, which
-- is the rule this repo applies to city links, news links and brand logos —
-- never resolve an entity by name alone.
--
-- ── WHY display_name AND NOT A RE-KEY ──
-- The obvious fix is to rewrite `marketplace_listings.brand` so the identity is
-- right. It was rejected, measured:
--   * `brand_key` is GENERATED over `brand`, and `slug` is derived from
--     `brand_key` under a UNIQUE index — so re-keying MOVES the maker page URL.
--   * There is **no `marketplace_brand_slug_redirects` table** (checked
--     `pg_tables` and the migration tree). A moved slug is a hard 404 on a URL
--     `sitemap-brands.xml` is advertising right now.
--   * `marketplace_register_brands()` inserts new rows as `'pending'`, and the
--     sitemap is approved-only — so a re-key would ALSO delete the maker page
--     it was meant to fix, until someone re-approved it.
-- Renaming `display_name` fixes every surface a reader or a crawler sees and
-- moves no URL. The cost is stated rather than hidden: `brand_key` and `slug`
-- keep the old string, so `/marketplace/brands/hk-nalone-electronic-technology-co-ltd`
-- will render "Nalone". An ugly URL on a correct page beats a pretty URL that
-- 404s, and it stays convertible into a real slug move the day a redirect table
-- exists.
--
-- ── the rename is DURABLE with no producer change, and that is measured ──
-- `20260706061952` made `marketplace_register_brands()` refresh `display_name`
-- only `WHEN status = 'pending'`, precisely so a curator's correction is never
-- clobbered. All 49 rows here are `approved`, so the weekly sync cannot undo
-- this. **No change is made to `brandFromVendor()`**, deliberately: it rejects a
-- LETTERLESS vendor, every row here has letters, and a blanket "strip legal
-- suffixes" rule would corrupt `W. W. Norton & Company`, `Love Inc` and
-- `Plesur Company`, whose suffixes are part of the real name. A new PENDING row
-- from this merchant is a review-queue item, not a published page.
--
-- ── no human authored any of these names ──
-- 38 of the 49 carry a `reviewer_id` and 11 a `reviewer_note`, and every note
-- is the same machine string — `auto 2026-08-22 DQ pass: … approved for brand
-- page only, no ownership claim`. 0 of 49 carry a `story`. Approving a row is
-- not authoring its name. Checked before writing, not assumed.
--
-- ── TWO CLASSES, because the licence differs ──
-- (a) WRONG ENTITY -> a brand claim. Requires the titles to name exactly ONE
--     brand. A second real brand under the row STRIKES it.
-- (b) LEGAL-SUFFIX / STORE-CHROME DROP. The name is already the brand and only
--     `GmbH`/`B.V.`/`Ltd`/`| Official Online Store` comes off. No brand claim is
--     made, so a second title prefix is irrelevant here.
-- Merging the two into one list is how a later pass takes (b)'s licence and
-- applies it to a row that needs (a)'s evidence.
--
-- ── what was DELIBERATELY NOT renamed, with the reason per row ──
--   * `Spectrum Boutique` (2,522 listings — the LARGEST brand row in the
--     catalogue) and `Mein Shop`: a multi-brand retailer published as a brand.
--     There is no real brand to rename to, and inventing one is the defect.
--   * `Atixo GmbH` (Grey Velvet 33 / Saresia 7), `Vinergy GmbH` (Mister Size 18
--     / Secura 6), `O-PRODUCTS B.V.` (KIOTOS 14 / PIXEY 8), `R&S consumer goods
--     gmbH` (VITALIS 10 / My.Size 4), `COMPENDIUM GmbH`, `SXWell
--     BelgiumRiverside`, `XR EURP BV`, `CNEX AIE, S.L`, `EDC Retail B.V.`,
--     `AMOR Gummiwaren GmbH` (6 brands), `Lubry GmbH` (9 brands),
--     `Guangdong Xise Industrial Company Ltd` (Xise 2 / Shequ 1): the row
--     legitimately spans several brands. Renaming would HIDE listings under a
--     brand they do not belong to. `Orion` (83 brands, 1,359 listings) and
--     `Dreamlove` (74) are the same class and are not approved, so they are not
--     in the sitemap.
--   * `W. W. Norton & Company`, `Love Inc`, `Plesur Company`: the suffix is part
--     of the real name.
--   * `Westridge Laboratories Inc` -> the brand really is `ID`, and a maker page
--     titled "ID" is worse than the status quo. Expanding it to "ID Lubricants"
--     would be invention. Under-reaching is the correct error.
--   * `Rebelz Games` -> `JOKE ITEMS` is a CATEGORY;
--     `Jens Bruggemann Werbefotogafie` -> `Sonstige` is German for "Other";
--     `Kweer Cards / Peachy Kings` is two real brands joined by a slash;
--     `Hott Products`, `Titanmen`, `Barcode`, `PalmPower`, `Silicone`,
--     `Addiction by BMS`, `CharlieByMZ`, `Charlie By Matthew Zink`,
--     `Alba Optics`, `DI - On Demand`, `RodeoH & Blush`, `Pride Packages`:
--     the title prefix is a PRODUCT NAME, a pack size or a fragment, not a
--     brand. The prefix measurement narrows what a human reads; it does not
--     decide, and 22 of the 71 machine-surfaced candidates were struck by hand.
--   * `Darkness Sensations` -> `Darkness`: arguably a sub-line, not provably
--     wrong. Left alone.
--
-- ── the row this file's own brief said to protect ──
-- `1979 SAS (Teil der Marc Dorcel Group)` is renamed to `DORCEL`. All 5 of its
-- listings are titled `DORCEL - …`. `99100101143000` calls it "the one brand in
-- the directory that starts with a digit and is REAL", which is true of the
-- LEGAL ENTITY and was only ever a statement that that migration's letterless
-- predicate could not reach it. It is not a warrant that the name is a good
-- brand name.
--
-- ── `Salzgeber` is why the multi-brand test needed a human ──
-- `Salzgeber & Co. Medien GmbH` (444 listings) shows 11 distinct title prefixes
-- and so trips the distributor test — but the prefixes are FILM TITLES ("Als wir
-- tanzten", "George Grosz in Amerika"). It is a film label, Salzgeber IS the
-- correct brand for those films, and it takes the (b) suffix drop.
--
-- ── THE FILENAME AND THE INTERNAL STAMP DELIBERATELY DISAGREE ──
-- This was applied live via MCP `apply_migration`, which stamps the version from
-- its OWN call timestamp and ignores the name passed to it — the trap CLAUDE.md
-- records. It was authored as `99991789846273` (allocated by
-- `scripts/next-migration-version.mjs`) and prod recorded `20260919193550`, so
-- the FILE carries the APPLIED version: that is what `db push` matches on to
-- skip it, and what stops `check-migration-drift.mjs` seeing a remote version
-- with no repo file.
-- The `auto-rename 99991789846273` string inside `reviewer_note` is left exactly
-- as authored, because it is already written into 49 prod rows and is the key the
-- guard test counts by. It is an identifier, not a claim about the filename. Do
-- not "fix" either side to match the other: rewriting the notes breaks the
-- count, renaming the file breaks the file↔history match.
--
-- ── reversibility ──
-- Nothing is deleted and no identity moves. The prior name is appended to
-- `reviewer_note` verbatim, so every row is restorable by hand. Each UPDATE is
-- guarded on the CURRENT `display_name`, which makes the file idempotent and
-- means it can never overwrite a name a human changes after this is authored.

begin;

create temp table _brand_rename (old_name text primary key, new_name text not null, arm text not null) on commit drop;

-- (a) WRONG ENTITY -> the single brand the listings' own titles prove.
insert into _brand_rename (old_name, new_name, arm) values
  ('Esterel Production',                        'Ruf',               'a'),
  ('HK Nalone Electronic Technology Co., Ltd.', 'Nalone',            'a'),
  ('J.K. Ansell Ltd.',                          'Kamasutra',         'a'),
  ('Playful Toys, Inc.',                        'B Swish',           'a'),
  ('Blanche Industries GmbH',                   'FRÖHLE',            'a'),
  ('BIORIUS',                                   'Shunga Erotic Art', 'a'),
  ('Advena Ltd.',                               'Pasante',           'a'),
  ('Shenzhen J&L Technology Co., Ltd.',         'Pretty Love',       'a'),
  ('Euroscents',                                'Tentacion',         'a'),
  ('SARL Rolling Skulls',                       'CUT4MEN',           'a'),
  ('Scala 2.0 B.V.',                            'Toyjoy',            'a'),
  ('MAPA GmbH',                                 'Billy Boy',         'a'),
  ('Finaflex',                                  'Stimul8',           'a'),
  ('THEMIS ARUnterstützung UG',                 'Lovense',           'a'),
  ('Ohdoki AS',                                 'The Handy',         'a'),
  ('Alura Group BV',                            'Autoblow',          'a'),
  ('CSSL Office 2',                             'Bathmate',          'a'),
  ('Danatoys Aps',                              'Dansex',            'a'),
  ('M.P.I. Pharmaceutica GmbH',                 'Masculan',          'a'),
  ('Wonderboys',                                'Cloneboy',          'a'),
  ('1979 SAS (Teil der Marc Dorcel Group)',     'DORCEL',            'a'),
  ('LoveBusiness B.V.',                         'BodyGliss',         'a'),
  ('KESSEL medintim GmbH',                      'Medintim',          'a');

-- (b) LEGAL-SUFFIX / STORE-CHROME DROP. No brand claim; the name is already the
-- brand. `INTT`/`Orgie`/`Autoblow` had only CASE variants under them, so those
-- rows are single-brand once folded.
insert into _brand_rename (old_name, new_name, arm) values
  ('Crazy Bull Hair Products Ltd',                 'Crazy Bull',           'b'),
  ('Kiiroo B.V.',                                  'Kiiroo',               'b'),
  ('Svakom Europe BV',                             'SVAKOM',               'b'),
  ('Orgie Company / Beautyenigma LDA',             'Orgie',                'b'),
  ('INTT Cosmetics / INTTW Euro Cosmetics LDA',    'INTT',                 'b'),
  ('The Swede Company AB',                         'Swede',                'b'),
  ('pjur group Luxembourg S.A',                    'pjur',                 'b'),
  ('Mystim GmbH',                                  'Mystim',               'b'),
  ('Secret Play S.L',                              'Secret Play',          'b'),
  ('Private Media Group, Inc.',                    'Private',              'b'),
  ('XPOWER Manufacture Inc.',                      'XPOWER',               'b'),
  ('chilirose Wholesale',                          'Chilirose',            'b'),
  ('Creative Conceptions Kft.',                    'Creative Conceptions', 'b'),
  ('SHOTS BV',                                     'Shots',                'b'),
  ('Control Feel S.r.l.',                          'Control',              'b'),
  ('FAIR SQUARED GmbH',                            'Fair Squared',         'b'),
  ('Andromedical, S.L.',                           'Andromedical',         'b'),
  ('Kheper Games Inc.',                            'Kheper Games',         'b'),
  ('LifeStyles Healthcare Pte. Ltd.',              'LifeStyles',           'b'),
  ('WUG Functional Gums SL',                       'WUG',                  'b'),
  ('Spartacus Enterprises',                        'Spartacus',            'b'),
  ('Hidden Desires Limited',                       'Hidden Desires',       'b'),
  ('Salzgeber & Co. Medien GmbH',                  'Salzgeber',            'b'),
  ('SUPER GAY UNDERWEAR | Official Online Store',  'Super Gay Underwear',  'b'),
  ('LA MAISON KOMANDŌ | LMK',                      'LA MAISON KOMANDŌ',    'b'),
  ('Magnetic Poetry INC',                          'Magnetic Poetry',      'b');

-- Snapshot the identity columns so the "no URL moved" postcondition asserts what
-- this file PROMISES rather than a condition derived from the same statement
-- that changed things. `20810101100100` aborted `db push` on main by asserting a
-- proxy instead of the real claim.
create temp table _brand_before on commit drop as
  select b.id, b.brand_key, b.slug, b.display_name, b.status, b.product_count
  from marketplace_brands b join _brand_rename r on r.old_name = b.display_name;

create temp table _listings_before on commit drop as
  select l.brand_key, count(*) n
  from marketplace_listings l
  where l.brand_key in (select brand_key from _brand_before)
  group by 1;

update marketplace_brands b
set display_name = r.new_name,
    updated_at   = now(),
    reviewer_note = coalesce(b.reviewer_note || ' | ', '')
      || 'auto-rename 99991789846273 (' || r.arm || '): vendor field held a legal entity / store chrome, '
      || 'not a brand; corroborated by the listings'' own title prefix. prior display_name='
      || b.display_name
from _brand_rename r
where b.display_name = r.old_name;

do $verify$
declare
  v_reached int;
  v_moved   int;
  v_listing int;
  v_ctrl    int;
  v_bad     text;
begin
  -- 1. every row this file undertook to rename now reads the new name.
  select count(*) into v_reached
  from marketplace_brands b join _brand_rename r on r.new_name = b.display_name
  where b.id in (select id from _brand_before);
  if v_reached <> 49 then
    raise exception 'brand rename: % of 49 rows reached the new display_name', v_reached;
  end if;

  -- 2. NO URL MOVED. This is the whole reason display_name was chosen over a
  --    re-key, so it is asserted against a pre-change snapshot, not inferred.
  select count(*) into v_moved
  from marketplace_brands b join _brand_before o on o.id = b.id
  where b.slug is distinct from o.slug
     or b.brand_key is distinct from o.brand_key
     or b.status is distinct from o.status;
  if v_moved <> 0 then
    raise exception 'brand rename: % rows moved slug/brand_key/status — must move none', v_moved;
  end if;

  -- 3. no listing was re-attributed. This file must not touch attribution.
  select count(*) into v_listing
  from _listings_before o
  full join (
    select brand_key, count(*) n from marketplace_listings
    where brand_key in (select brand_key from _brand_before) group by 1
  ) n on n.brand_key = o.brand_key
  where o.n is distinct from n.n;
  if v_listing <> 0 then
    raise exception 'brand rename: listing counts changed for % brand_keys', v_listing;
  end if;

  -- 4. CONTROLS. Each struck row stands for one reason for striking it, so a
  --    sweep that renamed more than the reviewed 49 fails here. "49 rows
  --    reached" alone is equally satisfied by a pass that also took these.
  select count(*), string_agg(c.name, ', ') into v_ctrl, v_bad
  from (values
    ('Spectrum Boutique'),                      -- multi-brand retailer, nothing to rename to
    ('Mein Shop'),                              -- placeholder, no recoverable brand
    ('Atixo GmbH'),                             -- 2 real brands (Grey Velvet / Saresia)
    ('Lubry GmbH'),                             -- 9 real brands
    ('CNEX AIE, S.L'),                          -- 3 real brands
    ('Guangdong Xise Industrial Company Ltd'),  -- 2 real brands (Xise / Shequ)
    ('W. W. Norton & Company'),                 -- "Company" is part of the real name
    ('Westridge Laboratories Inc'),             -- real brand is "ID"; under-reach on purpose
    ('Rebelz Games'),                           -- prefix "JOKE ITEMS" is a category
    ('Jens Bruggemann Werbefotogafie'),         -- prefix "Sonstige" = German "Other"
    ('Kweer Cards / Peachy Kings'),             -- two real brands joined
    ('Darkness Sensations')                     -- arguably a sub-line, not provably wrong
  ) c(name)
  where not exists (select 1 from marketplace_brands b where b.display_name = c.name);
  if v_ctrl <> 0 then
    raise exception 'brand rename: % control row(s) no longer carry their original name: %', v_ctrl, v_bad;
  end if;

  raise notice 'brand rename OK: 49 renamed, 0 URLs moved, 0 listings re-attributed, 12 controls intact';
end $verify$;

commit;
