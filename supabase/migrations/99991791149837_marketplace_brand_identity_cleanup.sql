-- Rows in marketplace_brands that are not brands: a shop's own product line, a
-- print-on-demand fulfiller, and a generic "Other" bucket.
--
-- WHY THE 733-row no-logo cohort was the wrong frame. 99991791111093's entry ends by
-- naming "brand-identity cleanup" as open, and re-measured here the cohort is **724**,
-- not 733 -- it moves, so re-derive it rather than quoting this file. More to the point,
-- counting these rows as "brands without a logo" treats them as a LOGO problem. They are
-- not: nine of them are listings misattributed away from a parent brand that already HAS
-- a logo, and three are not brands at all. No amount of domain research fixes either.
--
-- SELECTION -- the signature that finds them is not the one that identifies them:
--   * A generic-name regex (custom|default|other|series|printful|...) returns 17 rows and
--     OVER-REACHES on four real brands: `Master Series` is XR Brands' line (5 merchants),
--     `Hard Line Prosthetics` and `Desire Collection by NS Novelties` are real, and
--     `jo` is **System JO**, the lubricant brand, which a `length(brand_key) <= 2` arm
--     would have deleted outright. The regex narrows what a human reads; it does not decide.
--   * Single-merchant is NOT evidence of a non-brand. `SPARTAS`, `RG DARK`, `LEADER` and
--     `RUFF GEAR` are fetchshop.co.uk-only and are real lines.
-- What decides each row is its LISTING TITLES, read by hand, and the three dispositions
-- below are deliberately different. Collapsing them into one sweep is how a later pass
-- takes the loosest group's licence and applies it to the rest.
--
-- GROUP A -- MERGE into a parent that already exists and already has a logo (9 rows).
-- Each is a product line sold on the parent's OWN shop, so the listings belong to the
-- parent and the line name is a variant label, not a maker.
--   custom   800 -> automic gold  automicgold.com; titles are bespoke rings
--                                 ("14k Champagne Gold ... Custom Ring, size 7")
--   a series 132 -> nattaup       nattaup.com; "Adjustable Chain Trunk", harnesses
--   b series 124 -> nattaup       nattaup.com; bras, sports shorts
--   f series  53 -> nattaup       nattaup.com; "3-Resist Long-Sleeve Vest"
--   v series  41 -> nattaup       nattaup.com; "Classic Ice Silk High-Cut Brief"
--   p series   3 -> nattaup       nattaup.com; scented paper
--   di        58 -> kink3d        DECIDED BY THE TITLES, not by the name: `di` holds
--                                 "Baby Cobra (Aqua Blue)" and kink3d holds "Baby Cobra
--                                 **Chastity Kit** (Aqua Blue)" -- same products, same
--                                 colourways. KINK3D makes the Baby Cobra.
--   hd        11 -> cuffed        "HD carabiner / chain / lock" -- hardware for cuffed's
--                                 own restraint range ("ankle leathstraints")
--   jo        10 -> system jo     A NAMING duplicate, not a product line, and the ONLY
--                                 merge here that gains no logo coverage (System JO has
--                                 none). Titles are literally "JO Agape pH Balanced
--                                 Lubricant", so the brand is System JO.
-- `nattaup` carries **5** listings while its own five SERIES rows hold 353 -- the parent
-- is tiny because its lines are siphoning its catalogue.
--
-- GROUP B -- RETIRE, no defensible parent (3 rows). These are NOT merged, and the reason
-- is the same corroboration rule that governs logo domains: a shop is not a brand.
--   printful 125  A print-on-demand FULFILLER. The titles are Marek Richard's designs
--                 ("Alien Vibes All Over Gym Shorts"); Printful printed them. There is no
--                 `marek richard` brand row, and minting one is brand CREATION -- a
--                 different decision with its own evidence bar.
--   printify   9  Same shape on shop.autostraddle.com.
--   other     14  THE ONE THAT INVERTS. wetforher.com's generic bucket, and merging it
--                 into `Wet For Her` was the obvious move and is WRONG: it holds
--                 "Booty Sparks Rainbow - Anal Plug" (XR Brands) and "Buck Off - FTM
--                 Stroker" (Perfect Fit), i.e. third-party goods the shop RESELLS, while
--                 Wet For Her's own range is trademarked ("Beanze Feelskin(TM)"). Merging
--                 would attribute XR Brands products to Wet For Her -- exactly the
--                 retailer-as-brand defect the whole corroboration requirement exists to
--                 prevent.
-- Their listings KEEP their `brand` text. That text is what the shop said, and rewriting
-- it would invent a maker; retiring the row is what removes it from the directory.
--
-- GROUP C -- REFUSED, named so a later pass does not re-propose them. `Master Series`,
-- `Hard Line Prosthetics`, `Desire Collection by NS Novelties` are real brands the
-- selection regex caught; a postcondition asserts all three survive.
--
-- `marketplace_listings.brand_key` is GENERATED ALWAYS AS marketplace_normalize_brand(brand),
-- so the write target is `brand` and the key follows. Read off information_schema, not assumed.
--
-- NO DDL. 99991791111093 deadlocked (40P01) on `drop trigger ... on marketplace_brands`
-- because its own transaction had already UPDATEd that table, so a concurrent writer held a
-- row lock it needed released for ACCESS EXCLUSIVE. This file touches no DDL at all, so that
-- class cannot recur here.
--
-- Soft on preconditions, hard on the goal: a row a concurrent session already retired or
-- re-keyed is reported and skipped. `db push` stops at the first failing file and takes
-- every migration queued behind it, so an exact-match premise is a repo-wide blast radius.

-- 1) Freeze the plan and the pre-state in one place, so every later step and every
--    postcondition reads the same set.
create temp table _bic_plan (
  artifact_key   text primary key,
  canonical_key  text,            -- null = retire
  kind           text not null check (kind in ('merge','retire'))
) on commit drop;

insert into _bic_plan (artifact_key, canonical_key, kind) values
  ('custom',   'automic gold', 'merge'),
  ('a series', 'nattaup',      'merge'),
  ('b series', 'nattaup',      'merge'),
  ('f series', 'nattaup',      'merge'),
  ('v series', 'nattaup',      'merge'),
  ('p series', 'nattaup',      'merge'),
  ('di',       'kink3d',       'merge'),
  ('hd',       'cuffed',       'merge'),
  ('jo',       'system jo',    'merge'),
  ('printful', null,           'retire'),
  ('printify', null,           'retire'),
  ('other',    null,           'retire');

create temp table _bic_before on commit drop as
select p.artifact_key,
       p.canonical_key,
       p.kind,
       a.id            as artifact_id,
       a.slug          as artifact_slug,
       a.status        as artifact_status,
       a.product_count as artifact_count,
       c.id            as canonical_id,
       c.display_name  as canonical_name,
       c.logo_url is not null as canonical_has_logo,
       (select count(*) from marketplace_listings l where l.brand_key = p.artifact_key) as listings_before
from _bic_plan p
join marketplace_brands a on a.brand_key = p.artifact_key
left join marketplace_brands c on c.brand_key = p.canonical_key
where a.status <> 'rejected'                     -- already retired by someone else: skip
  and (p.kind = 'retire' or c.id is not null);   -- a merge with no parent is not actionable

do $pre$
declare
  v_planned integer;
  v_actionable integer;
  v_missing text;
begin
  select count(*) into v_planned from _bic_plan;
  select count(*) into v_actionable from _bic_before;

  if v_actionable < v_planned then
    select string_agg(p.artifact_key, ', ' order by p.artifact_key) into v_missing
    from _bic_plan p
    where not exists (select 1 from _bic_before b where b.artifact_key = p.artifact_key);
    raise notice 'brand-identity cleanup: % of % rows actionable; skipped: %',
      v_actionable, v_planned, coalesce(v_missing, '(none)');
  end if;

  -- The file exists to change something. Zero actionable rows means the premise is gone
  -- and a silent no-op would report success.
  if v_actionable = 0 then
    raise exception 'brand-identity cleanup: no actionable rows; every planned artifact is already retired or has no parent';
  end if;
end $pre$;

-- 2) Redirect each merged artifact's URL at its parent BEFORE the slug is dropped.
--    get_marketplace_brand() resolves old_slug when no row holds it, which is what makes
--    the retirement a 301. Retired rows (group B) get NO redirect: there is no target, and
--    a non-brand's URL should stop resolving.
insert into public.marketplace_brand_slug_redirects (old_slug, brand_id, reason)
select b.artifact_slug, b.canonical_id, 'merged'
from _bic_before b
where b.kind = 'merge' and b.artifact_slug is not null
on conflict (old_slug) do update
  set brand_id = excluded.brand_id, reason = excluded.reason, created_at = now();

-- 3) Re-key the merged lines' listings onto the brand they belong to.
--    `brand_key` is generated from `brand`, so writing `brand` moves both.
update marketplace_listings l
set brand = b.canonical_name, updated_at = now()
from _bic_before b
where b.kind = 'merge' and l.brand_key = b.artifact_key;

-- 4) Retire every artifact row -- both groups. Group A is now empty (its listings moved);
--    group B keeps its listings and simply stops being a brand.
update marketplace_brands a
set status        = 'rejected',
    product_count = 0,
    slug          = NULL,
    reviewed_at   = now(),
    updated_at    = now(),
    reviewer_note = coalesce(a.reviewer_note || ' | ', '')
      || case when b.kind = 'merge'
           then 'auto-identity-cleanup: product line of "' || b.canonical_name
                || '" sold on that brand''s own shop; listings re-keyed, slug redirected. prior slug='
                || coalesce(b.artifact_slug, '(null)')
           else 'auto-identity-cleanup: not a brand (print-on-demand fulfiller or generic bucket); '
                || 'no defensible parent, so listings keep their source brand text. prior slug='
                || coalesce(b.artifact_slug, '(null)')
         end
from _bic_before b
where a.id = b.artifact_id;

-- 5) Restate the receiving brands' counts. marketplace_register_brands() only aggregates
--    brands WITH active listings, so it can raise a count but never lower one -- which is
--    why step 4 zeroes the artifacts explicitly instead of waiting for the cron.
update marketplace_brands c
set product_count = (select count(*) from marketplace_listings l
                     where l.brand_key = c.brand_key and l.status = 'active'),
    updated_at = now()
where c.brand_key in (select canonical_key from _bic_before where kind = 'merge');

-- 6) Postconditions. Positive controls first: every "count is zero" below is equally
--    satisfied by a probe that cannot see any rows at all.
do $verify$
declare
  v_brands_total   integer;
  v_scope          integer;
  v_not_retired    integer;
  v_slug_left      integer;
  v_count_left     integer;
  v_merge_stranded integer;
  v_retire_lost    integer;
  v_redirects      integer;
  v_controls       integer;
  v_grew           integer;
begin
  -- Control A: the brands table is populated. Without this, every assertion passes
  -- vacuously against an empty or unreadable table.
  select count(*) into v_brands_total from marketplace_brands;
  if v_brands_total < 1000 then
    raise exception 'brand-identity cleanup: marketplace_brands reads only % rows; the probe is not measuring a populated table', v_brands_total;
  end if;

  select count(*) into v_scope from _bic_before;

  -- The goal, stated positively: every row this file undertook to retire is retired,
  -- holds no slug, and reports no listings of its own.
  select count(*) into v_not_retired
  from _bic_before b join marketplace_brands a on a.id = b.artifact_id
  where a.status <> 'rejected';
  if v_not_retired <> 0 then
    raise exception 'brand-identity cleanup: % of % artifact rows are still not rejected', v_not_retired, v_scope;
  end if;

  select count(*) into v_slug_left
  from _bic_before b join marketplace_brands a on a.id = b.artifact_id
  where a.slug is not null;
  if v_slug_left <> 0 then
    raise exception 'brand-identity cleanup: % artifact rows still hold a slug', v_slug_left;
  end if;

  select count(*) into v_count_left
  from _bic_before b join marketplace_brands a on a.id = b.artifact_id
  where coalesce(a.product_count, 0) <> 0;
  if v_count_left <> 0 then
    raise exception 'brand-identity cleanup: % artifact rows still report a product_count', v_count_left;
  end if;

  -- Group A: no listing may still carry a merged line's key.
  select count(*) into v_merge_stranded
  from _bic_before b
  join marketplace_listings l on l.brand_key = b.artifact_key
  where b.kind = 'merge';
  if v_merge_stranded <> 0 then
    raise exception 'brand-identity cleanup: % listings still carry a merged line brand_key', v_merge_stranded;
  end if;

  -- Group B: the MIRROR. Their listings must still exist and still carry their own brand
  -- text -- a sweep that nulled or re-keyed them would satisfy every check above.
  select count(*) into v_retire_lost
  from _bic_before b
  where b.kind = 'retire'
    and (select count(*) from marketplace_listings l where l.brand_key = b.artifact_key) <> b.listings_before;
  if v_retire_lost <> 0 then
    raise exception 'brand-identity cleanup: % retired rows lost listings; group B must keep its source brand text', v_retire_lost;
  end if;

  -- Every merged slug resolves at its parent.
  select count(*) into v_redirects
  from _bic_before b
  join public.marketplace_brand_slug_redirects r
    on r.old_slug = b.artifact_slug and r.brand_id = b.canonical_id
  where b.kind = 'merge' and b.artifact_slug is not null;
  if v_redirects <> (select count(*) from _bic_before where kind = 'merge' and artifact_slug is not null) then
    raise exception 'brand-identity cleanup: only % merged slugs redirect at their parent', v_redirects;
  end if;

  -- Control B: the three real brands the selection regex also matched must survive.
  -- Without this, a sweep that retired them too would pass every assertion above.
  select count(*) into v_controls
  from marketplace_brands
  where brand_key in ('master series', 'hard line prosthetics', 'desire collection by ns novelties')
    and status = 'approved' and slug is not null;
  if v_controls <> 3 then
    raise exception 'brand-identity cleanup: only % of 3 refused control brands are still approved with a slug', v_controls;
  end if;

  -- Each receiving brand ended up with more listings than the line it absorbed.
  select count(*) into v_grew
  from (select distinct canonical_key, canonical_id from _bic_before where kind = 'merge') m
  join marketplace_brands c on c.id = m.canonical_id
  where c.product_count > 0;
  if v_grew <> (select count(distinct canonical_key) from _bic_before where kind = 'merge') then
    raise exception 'brand-identity cleanup: a receiving brand reports no listings after the merge';
  end if;

  raise notice 'brand-identity cleanup verified: % artifact rows retired, 0 stranded, % merged slugs redirected, 3 controls intact',
    v_scope, v_redirects;
end $verify$;
