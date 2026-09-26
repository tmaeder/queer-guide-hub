-- Renaming 49 brands split 6 more of them in two, and migration 2's duplicate
-- check could not see it because it was CASE-SENSITIVE.
--
-- `20260919194058` consolidated 9 pairs of maker pages that the rename in
-- `20260919193550` had given an identical `<title>`. It found them with
-- `group by display_name having count(*) > 1` — **string equality, which is
-- case-sensitive** — while this corpus's own identity function,
-- `marketplace_normalize_brand()`, is `lower(btrim(x))` plus whitespace
-- collapse. Measured on prod 2026-09-20, EIGHT pairs of approved, slugged,
-- listing-bearing brand rows normalise to one brand, and six of them differ
-- only in case:
--
--     AUTOBLOW    / Autoblow     (alura group bv       -> renamed by 193550)
--     CRAZY BULL  / Crazy Bull   (crazy bull hair products ltd)
--     Dorcel      / DORCEL       (1979 sas (teil der marc dorcel group))
--     PASANTE     / Pasante      (advena ltd.)
--     Pjur        / pjur         (pjur group luxembourg s.a)
--     Svakom      / SVAKOM       (svakom europe bv)
--
-- plus the two `20260919194058` already knew about and deliberately left open,
-- `Fort Troff` and `MR. Riegillio`, which differ only in `brand_key`
-- punctuation (`forttroff` / `fort troff`, `mr riegillio` / `mr. riegillio`).
--
-- **CHECK DUPLICATES WITH THE ENTITY'S OWN IDENTITY FUNCTION, NOT `=`.** The
-- rename took its new names from the listings' title prefixes, and a title
-- prefix carries the feed's casing; the incumbent brand row carries whatever
-- casing the registry derived years ago. Nothing forces them to agree, so
-- string equality was always going to miss most of the collisions it was
-- looking for. To a reader and to a crawler, `/marketplace/brands/autoblow`
-- titled "AUTOBLOW" and `/marketplace/brands/alura-group-bv` titled "Autoblow"
-- are the same page twice.
--
-- ── TWO SHAPES, because the clean slug is not always on the right row ──
-- (A) six pairs where the row whose `brand_key` IS `normalize(display_name)`
--     already holds the clean slug. Straight merge, exactly `20260919194058`.
-- (B) `fort troff` and `mr. riegillio`, where the canonical-key row holds a
--     COLLISION ARTIFACT slug (`fort-troff-c6b6`, `mr-riegillio-988d`) and the
--     clean slug sits on the row being retired. Retiring the loser frees the
--     clean slug, and step 4 then moves it onto the survivor — so the URL a
--     human would type keeps working and the `-c6b6` / `-988d` artifact is the
--     one that dies. Doing it the other way round would 404 the good URL and
--     keep the hash.
--
-- ── THE MERGE DIRECTION PUTS A QUEER-OWNED MARKER AT RISK, AND THAT IS THE
--    PART THAT MATTERS MOST ──
-- Both Shape-B losers are the editorially rich rows: `forttroff` carries
-- `ownership_tags = ['queer_owned']`, a hand-written story ("a gay-owned kink
-- brand founded in Atlanta in 2007 by Louis Ceruzzi…") and a website, against a
-- survivor with an empty `ownership_tags` and no story; `mr riegillio` the same.
-- On a queer marketplace `queer_owned` is the single most important claim a
-- brand row can carry, and retiring those rows without it would silently delete
-- it from two real queer-owned brands. Step 1 carries `story`, `website`,
-- `logo_url`/`logo_on_ink` and `ownership_tags` with COALESCE semantics — fill
-- only where the survivor is empty, never overwrite — and postcondition (d)
-- asserts both markers survived BY NAME, because "the merge completed" is
-- equally true of a merge that dropped them.
--
-- ── the survivor's display_name is the one 193550 REVIEWED ──
-- In all six Shape-A pairs the incumbent canonical row and the renamed row
-- disagree about casing, and it would be easy to consolidate onto whichever row
-- happens to survive and silently revert a hand-reviewed decision. So the
-- survivor adopts the name `20260919193550` chose (`Autoblow`, `Crazy Bull`,
-- `DORCEL`, `Pasante`, `pjur`, `SVAKOM`), which also removes three all-caps feed
-- artifacts (`AUTOBLOW`, `CRAZY BULL`, `PASANTE`). Shape B renamed nothing, so
-- both its rows already read `Fort Troff` / `MR. Riegillio` and the incumbent
-- name stands. One rule, no per-row taste.
--
-- ── why re-keying is safe HERE ──
-- The general objection stands (`register_brands()` mints new rows as `pending`
-- and the sitemap is approved-only, so a re-key normally deletes the page it
-- meant to fix), and it does not apply because every survivor already exists as
-- an approved, slugged row. The `do $pre$` block ASSERTS that rather than
-- trusting it, and additionally asserts `brand_key = normalize(final_name)` —
-- so copying this file for a pair whose target is not canonical fails loudly
-- instead of recreating the inconsistency that produced these duplicates.
--
-- ── reversibility ──
-- Nothing is deleted. Each retired row keeps its `brand_key` and records its
-- surviving partner and its prior slug verbatim in `reviewer_note`. Restoring a
-- pair means re-keying its listings back and restoring `status`/`slug` by hand.
--
-- Applied live via MCP, which stamps its own version; this file carries the
-- APPLIED version so `db push` skips it. The `reviewer_note` stamp is the stable
-- string `auto-merge brand-canon`, deliberately NOT a version number, so a
-- renumber can never desynchronise the prod rows from the guard that counts them
-- — the trap `20260919193550` had to document after the fact.


--
-- ── PROVENANCE: this file was RECOVERED, and this commit restores its reasoning ──
-- Applied live via MCP `apply_migration`, which stamps a version and commits
-- nothing, so it reached prod with no repo file. `scripts/recover-migration-drift.mjs`
-- rebuilt it from `schema_migrations.statements` in #3879 and verified it by md5 —
-- the safety net working as designed. What that path CANNOT recover is the comment
-- header, because `statements` records only the parsed statements; its own note says
-- so. This commit puts the reasoning back and changes not one byte of SQL: the
-- statements below are md5-identical to the recovered file and therefore to what
-- prod executed.
--
-- NEVER RE-RUN. `db push` matches on version and skips an applied migration; the
-- file exists so history is complete and a rebuild from zero works.

create temp table _canon (
  survivor_key text primary key,   -- brand_key = normalize(display_name); the row that lives
  loser_key    text not null,      -- the duplicate brand_key, retired
  final_name   text not null,      -- display_name the survivor ends up with
  claim_slug   text                -- non-null only when the clean slug must move off the loser
) on commit drop;

insert into _canon values
  -- Shape A: the canonical-key row already holds the clean slug.
  ('autoblow',      'alura group bv',                        'Autoblow',      null),
  ('crazy bull',    'crazy bull hair products ltd',          'Crazy Bull',    null),
  ('dorcel',        '1979 sas (teil der marc dorcel group)', 'DORCEL',        null),
  ('pasante',       'advena ltd.',                           'Pasante',       null),
  ('pjur',          'pjur group luxembourg s.a',             'pjur',          null),
  ('svakom',        'svakom europe bv',                      'SVAKOM',        null),
  -- Shape B: the clean slug sits on the LOSER, so it is freed and re-claimed.
  ('fort troff',    'forttroff',                             'Fort Troff',    'fort-troff'),
  ('mr. riegillio', 'mr riegillio',                          'MR. Riegillio', 'mr-riegillio');

do $pre$
declare v int; v_txt text;
begin
  -- (1) the survivor must exist, be approved, be slugged, and its key must really
  --     be normalize(its final name).
  select count(*), string_agg(c.survivor_key, ', ') into v, v_txt from _canon c
  where not exists (select 1 from marketplace_brands b
                    where b.brand_key=c.survivor_key and b.status='approved' and b.slug is not null
                      and b.brand_key = marketplace_normalize_brand(c.final_name));
  if v <> 0 then raise exception 'canon-merge: % survivor(s) not an approved slugged canonical row: %', v, v_txt; end if;

  -- (2) the loser must exist and must not be the survivor.
  select count(*) into v from _canon c
  where c.loser_key = c.survivor_key
     or not exists (select 1 from marketplace_brands b where b.brand_key=c.loser_key);
  if v <> 0 then raise exception 'canon-merge: % loser(s) missing or same as survivor', v; end if;

  -- (3) a slug being claimed must currently be held by its OWN loser, nobody
  --     else. The unique index covers every non-null slug regardless of status.
  select count(*) into v from _canon c where c.claim_slug is not null
   and not exists (select 1 from marketplace_brands b where b.slug=c.claim_slug and b.brand_key=c.loser_key);
  if v <> 0 then raise exception 'canon-merge: % claim_slug(s) not held by their loser', v; end if;
end $pre$;

create temp table _before on commit drop as
select c.survivor_key, c.loser_key, c.final_name, c.claim_slug,
       (select slug from marketplace_brands b where b.brand_key=c.survivor_key) as survivor_slug_before,
       (select display_name from marketplace_brands b where b.brand_key=c.survivor_key) as survivor_name_before,
       (select count(*) from marketplace_listings l where l.brand_key=c.survivor_key) as survivor_listings,
       (select count(*) from marketplace_listings l where l.brand_key=c.loser_key) as loser_listings
from _canon c;

-- 1. carry the LOSER's editorial content where the survivor has none. See the
--    queer_owned note above: this step is the reason the merge is not lossy.
update marketplace_brands s
set story         = coalesce(s.story, l.story),
    website       = coalesce(s.website, l.website),
    logo_url      = coalesce(s.logo_url, l.logo_url),
    logo_on_ink   = case when s.logo_url is null and l.logo_url is not null then l.logo_on_ink else s.logo_on_ink end,
    ownership_tags = case when coalesce(array_length(s.ownership_tags,1),0)=0
                          then l.ownership_tags else s.ownership_tags end,
    updated_at    = now()
from _canon c join marketplace_brands l on l.brand_key=c.loser_key
where s.brand_key=c.survivor_key;

-- 2. re-key the loser's listings. `brand_key` is GENERATED, so write `brand`.
update marketplace_listings l set brand = c.final_name, updated_at = now()
from _canon c where l.brand_key = c.loser_key;

-- 3. retire the loser. `slug=NULL` is load-bearing twice over:
--    `get_marketplace_brand()` has no status filter, so rejecting alone leaves
--    the page live over an empty grid — and for Shape B this is what FREES the
--    clean slug for step 4.
update marketplace_brands b
set status='rejected', product_count=0, slug=NULL, reviewed_at=now(), updated_at=now(),
    reviewer_note = coalesce(b.reviewer_note || ' | ','')
      || 'auto-merge brand-canon: same brand as brand_key=' || c.survivor_key
      || ' (both normalise to it); listings re-keyed, editorial content carried. prior slug='
      || coalesce(b.slug,'(null)')
from _canon c where b.brand_key = c.loser_key;

-- 4. Shape B only: move the freed clean slug onto the survivor.
update marketplace_brands b
set slug = c.claim_slug, updated_at = now()
from _canon c where b.brand_key = c.survivor_key and c.claim_slug is not null;

-- 5. adopt the reviewed display_name and restate the count.
update marketplace_brands b
set display_name = c.final_name,
    product_count = (select count(*) from marketplace_listings l
                     where l.brand_key=b.brand_key and l.status='active'),
    updated_at = now()
from _canon c where b.brand_key = c.survivor_key;

do $verify$
declare v int; v_txt text;
begin
  -- a. ZERO same-brand splits remain. This is the invariant `20260919194058`
  --    tried to assert and got wrong, restated with the identity function
  --    instead of `=`.
  select count(*), string_agg(canon, ', ') into v, v_txt from (
    select marketplace_normalize_brand(display_name) as canon
    from marketplace_brands where status='approved' and slug is not null and product_count>0
    group by 1 having count(*)>1) d;
  if v <> 0 then raise exception 'canon-merge: % same-brand split(s) remain: %', v, v_txt; end if;

  -- b. every survivor is self-consistent: brand_key = normalize(display_name)
  --    AND slug = brand_slug(brand_key). Leaving a row inconsistent with its own
  --    derivation rule is what created this class.
  select count(*), string_agg(b.brand_key, ', ') into v, v_txt
  from _before o join marketplace_brands b on b.brand_key=o.survivor_key
  where b.brand_key is distinct from marketplace_normalize_brand(b.display_name)
     or b.slug is distinct from marketplace_brand_slug(b.brand_key);
  if v <> 0 then raise exception 'canon-merge: % survivor(s) not self-consistent: %', v, v_txt; end if;

  -- c. NO LISTING LOST, both halves — "0 on the retired key" alone also passes
  --    if they were deleted.
  select count(*) into v from _before o
  where (select count(*) from marketplace_listings l where l.brand_key=o.survivor_key)
        <> o.survivor_listings + o.loser_listings;
  if v <> 0 then raise exception 'canon-merge: listing totals do not reconcile for % pair(s)', v; end if;
  select count(*) into v from marketplace_listings l where l.brand_key in (select loser_key from _before);
  if v <> 0 then raise exception 'canon-merge: % listing(s) still on a retired brand_key', v; end if;

  -- d. the queer_owned marker and the hand-written stories SURVIVED, by name.
  select count(*) into v from marketplace_brands
   where brand_key in ('fort troff','mr. riegillio')
     and 'queer_owned' = any(ownership_tags) and story is not null and website is not null;
  if v <> 2 then raise exception 'canon-merge: queer_owned/story carried onto only % of 2 rows', v; end if;

  -- e. the clean URLs a human would type still resolve to a live brand.
  select count(*) into v from marketplace_brands
   where slug in ('fort-troff','mr-riegillio','autoblow','crazy-bull','dorcel','pasante','pjur','svakom')
     and status='approved' and product_count>0;
  if v <> 8 then raise exception 'canon-merge: only % of 8 clean slugs are live', v; end if;

  raise notice 'canon-merge OK: 8 pairs merged, 0 splits remain, 0 listings lost, queer_owned carried';
end $verify$;

