-- Maker pages: 10 duplicate brand families, and a terminal stamp that outlived its reason.
--
-- Asked to "do the 733 brands with no defensible domain". Measured first, and the premise
-- does not survive measurement:
--
--   * The residue is 733, not the 775/766 CLAUDE.md records.
--   * ALL 733 carry logo_source='no_domain' with a 0.0% hit rate (2026-08-22), against
--     100% for the 116 probed the next day. They were never probed -- the pipeline had no
--     URL to probe. So this is NOT the dead-logo.dev-token cohort, and the re-queue that
--     took venue logos 1,340 -> 6,530 is a provable no-op here.
--   * 732 of 733 DO have merchant domains, and the brand name corroborates NONE of them:
--     equality and prefix-both-ways found 0 when the pass ran, and a substring arm measures
--     0 pairs. 586 sell through exactly one shop, and sole-source is not ownership --
--     taking that domain would publish automicgold.com's mark as "Custom",
--     wildflowersex.com's as "Cal Exotics" and fetchshop.co.uk's as RUFF GEAR, SPARTAS and
--     RG DARK. That is the defect the corroboration rule exists to prevent.
--   * A token arm (shared token >= 7 chars) scored 2 of 7 = 29%, the same precision as the
--     `broader` relation arm this repo already disabled. Its failures are `fantasy` and
--     `jockstraps` matching the RETAILERS ohmyfantasy.com and jockstraps.com: long but
--     generic. LENGTH IS NOT DISTINCTIVENESS. Rejected, and deliberately not shipped.
--
-- So there is no bulk logo fix. What IS available is this file: the cohort is partly a
-- DUPLICATE-ROW problem, and merging a family hands the logo over for free because a
-- sibling row already has one.
--
-- ── 10 families, 12 artifact rows ──
-- Dominant shape is a spacing or accent variant of one brand (mrsleather / "mr s leather",
-- hunkyjunk / "hünkyjunk", mancage / "man cage"). Three families carry a logo on one side
-- only, so the merge newly covers 314 listings: mr s leather 135, the Charlie family 173,
-- vilain garcon 6.
--
-- SURVIVOR RULE: the row with the most listings wins, so the URL the sitemap already
-- advertises survives, and the LOGO IS CARRIED ONTO IT from whichever sibling has one.
-- They are the same brand by construction, so no domain and no new probe is needed. That
-- beats surviving on the logo-bearing row, which would 404 the big page.
--
-- Two deliberate departures, stated rather than silent:
--   * kamasutra survives on `kama sutra` (10 listings) over `j.k. ansell ltd.` (25),
--     because the loser's slug IS a legal entity and retiring that URL is the whole point
--     of 20260919193550.
--   * `vilain garçon` survives WITH its mangled slug `vilain-gar-on` even though the
--     6-listing sibling holds the clean `vilain-garcon`, because re-keying onto the
--     sibling would drop the cedilla from the brand's own name. Accent slug generation is
--     a separate defect and is NOT fixed here.
--   * `realrock` is DEFERRED: 16 vs 14 listings, no logo at stake, and the canonical
--     styling is genuinely ambiguous ("Real Rock" has more listings, "REALROCK" is the
--     Shots line name). A wrong merge is worse than a deferred one.
--
-- ── THREE STALE CLAIMS CORRECTED, all by reading rather than assuming ──
-- (1) 20260919193550 line 36 states "There is **no `marketplace_brand_slug_redirects`
--     table** (checked)". IT EXISTS: 22 rows, maintained by
--     trg_marketplace_brands_slug_redirect, and READ BY get_marketplace_brand(), whose
--     target CTE falls back to `old_slug = p_slug`. That false premise is what blocked
--     re-keying there and was quoted forward into 20260919194058. So a retired maker page
--     can 301 instead of dying, and this file inserts those redirects.
-- (2) 20260919194058's header lists Fort Troff and MR. Riegillio as duplicate pairs "left
--     open". They were already merged (auto-merge brand-canon, 2026-07-04): `forttroff`
--     and `mr riegillio` are rejected with NULL slugs, and fort-troff-c6b6 ->
--     fort-troff / mr-riegillio-988d -> mr-riegillio are live redirect rows. Its
--     postcondition (a) excludes those two names; that exclusion is now unnecessary and
--     this file asserts the invariant WITHOUT it.
-- (3) The trigger only fires when old.slug and new.slug are BOTH non-null, so setting
--     slug=NULL -- the precedent's retirement -- creates no redirect at all. The redirect
--     rows here are therefore inserted explicitly, pointing at the SURVIVOR, which is
--     what makes this a 301 rather than a dead URL.
--
-- ── the stale terminal stamp (the actual bug) ──
-- 3 brands hold their OWN website and are still locked out of the batch forever, because
-- marketplace_brand_logo_candidates() requires logo_fetched_at IS NULL and the
-- 'no_domain' stamp from 2026-08-22 outlived the arrival of a domain: Fort Troff (89),
-- House of Riegillio (107), BOXER Barcelona (26) -- 222 listings. The stamp exists to stop
-- re-offering an unresolvable head; it must not survive the thing that made it
-- unresolvable. Cleared here, and a trigger makes it self-invalidating so this cannot
-- silently regrow.
-- Fort Troff's row says ft-troff.com while its organization says forttroff.com. That
-- disagreement is NOT resolved here -- the engine's own host check (the cellblock13.net ->
-- timoteo.net rule: judge by the url we ASKED for) is the right place for it, and a failed
-- probe records itself honestly.
--
-- ── reversibility ──
-- Nothing is deleted. Each artifact keeps its brand_key and records its prior slug and its
-- canonical partner verbatim in reviewer_note. Mechanism copied from 20260919194058:
-- brand_key is GENERATED over marketplace_listings.brand, so step 3 writes `brand` and the
-- key follows; writing brand_key directly is an error.

begin;

create temp table _fam (artifact_key text primary key, canonical_name text not null) on commit drop;
insert into _fam values
  ('mr s leather',            'mrsleather'),
  ('charlie by matthew zink', 'CharlieByMatthewZink'),
  ('charliebymz',             'CharlieByMatthewZink'),
  ('charlie by mz',           'CharlieByMatthewZink'),
  ('vilain garcon',           'Vilain Garçon'),
  ('j.k. ansell ltd.',        'Kama Sutra'),
  ('hünkyjunk',               'HUNKYJUNK'),
  ('man cage',                'Mancage'),
  ('kink lab',                'Kinklab'),
  ('banana pants',            'BananaPants'),
  ('rssc sports',             'rsscsports'),
  ('backroom gear',           'backroomgear');

-- The canonical name must normalise to a row that already exists and is slugged, or the
-- re-key would mint a page instead of merging into one. Hard, because a typo here is a
-- defect in this file that no later corpus state repairs.
do $pre$
declare v int; v_bad text;
begin
  select count(*), coalesce(string_agg(distinct f.canonical_name, ', '), '')
    into v, v_bad
  from _fam f
  where not exists (
    select 1 from marketplace_brands b
    where b.brand_key = marketplace_normalize_brand(f.canonical_name)
      and b.slug is not null);
  if v <> 0 then
    raise exception 'brand families: % canonical target(s) are not a slugged row: %', v, v_bad;
  end if;
end $pre$;

-- Snapshot BEFORE anything moves: the artifact's slug (about to be NULLed), its logo (about
-- to be carried) and both sides' listing counts (to prove nothing was lost).
create temp table _before on commit drop as
  select f.artifact_key,
         f.canonical_name,
         marketplace_normalize_brand(f.canonical_name) as canonical_key,
         a.id    as artifact_id,
         a.slug  as artifact_slug,
         a.logo_url as artifact_logo_url,
         a.logo_source as artifact_logo_source,
         a.logo_on_ink as artifact_logo_on_ink,
         c.id    as canonical_id,
         c.logo_url is not null as canonical_had_logo,
         (select count(*) from marketplace_listings l where l.brand_key = f.artifact_key) as artifact_listings,
         (select count(*) from marketplace_listings l where l.brand_key = marketplace_normalize_brand(f.canonical_name)) as canonical_listings
  from _fam f
  join marketplace_brands a on a.brand_key = f.artifact_key
  join marketplace_brands c on c.brand_key = marketplace_normalize_brand(f.canonical_name);

-- Soft: an artifact a concurrent session already retired is reported, not fatal.
do $soft$
declare v int;
begin
  select count(*) into v from _fam f
  where not exists (select 1 from _before b where b.artifact_key = f.artifact_key);
  if v <> 0 then
    raise notice 'brand families: % artifact row(s) absent or already retired; skipped', v;
  end if;
end $soft$;

-- 1. Carry the logo onto the survivor where the survivor has none and a sibling does.
--    This is the free-logo half: same brand by construction, so no domain is asserted.
update marketplace_brands c
set logo_url     = b.artifact_logo_url,
    logo_source  = b.artifact_logo_source,
    logo_on_ink  = b.artifact_logo_on_ink,
    logo_fetched_at = now(),
    updated_at   = now()
from _before b
where c.id = b.canonical_id
  and c.logo_url is null
  and b.artifact_logo_url is not null;

-- 2. Redirect the artifact's URL at the survivor BEFORE the slug is dropped.
--    get_marketplace_brand() resolves old_slug when no row holds it, so this is what makes
--    the retirement a 301. The trigger cannot do it: it only fires non-null -> non-null.
insert into public.marketplace_brand_slug_redirects (old_slug, brand_id, reason)
select b.artifact_slug, b.canonical_id, 'merged'
from _before b
where b.artifact_slug is not null
on conflict (old_slug) do update
  set brand_id = excluded.brand_id, reason = excluded.reason, created_at = now();

-- 3. Re-key the listings onto the brand they always belonged to. brand_key follows `brand`.
update marketplace_listings l
set brand = b.canonical_name, updated_at = now()
from _before b
where l.brand_key = b.artifact_key;

-- 4. Retire the now-empty artifact row.
update marketplace_brands a
set status = 'rejected',
    product_count = 0,
    slug = NULL,
    reviewed_at = now(),
    updated_at = now(),
    reviewer_note = coalesce(a.reviewer_note || ' | ', '')
      || 'auto-consolidate brand-family: same brand as "' || b.canonical_name
      || '" under a second brand_key; listings re-keyed, logo carried, slug redirected. prior slug='
      || coalesce(b.artifact_slug, '(null)')
from _before b
where a.id = b.artifact_id;

-- 5. Restate the receiving rows' counts. marketplace_register_brands() only aggregates
--    brands WITH active listings, so it can raise a count but never lower one -- which is
--    why step 4 zeroes the artifacts explicitly instead of waiting for the cron.
update marketplace_brands b
set product_count = (select count(*) from marketplace_listings l
                     where l.brand_key = b.brand_key and l.status = 'active'),
    updated_at = now()
where b.brand_key in (select canonical_key from _before);

-- 6. Clear the stale terminal stamp so the existing engine can probe a domain that arrived
--    after the stamp. Guarded on 'no_domain' + still-no-logo + a website actually present,
--    so it can never clear a stamp that records a real probe.
update marketplace_brands b
set logo_fetched_at = NULL,
    logo_source = NULL,
    updated_at = now()
where b.logo_url is null
  and b.logo_source = 'no_domain'
  and b.logo_fetched_at is not null
  and coalesce(nullif(btrim(b.website), ''),
               (select nullif(btrim(o.website), '') from organizations o where o.id = b.organization_id))
      is not null;

-- 7. Make the stamp self-invalidating. A 'no_domain' stamp records "we had no URL", so the
--    moment a URL appears the stamp is stale by definition; without this, the fix above is
--    a one-shot and the class regrows silently.
create or replace function public.marketplace_brands_clear_stale_logo_stamp()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp' as $fn$
begin
  if new.logo_url is null
     and new.logo_source = 'no_domain'
     and new.logo_fetched_at is not null
     and nullif(btrim(coalesce(new.website, '')), '') is not null
     and nullif(btrim(coalesce(old.website, '')), '') is null then
    new.logo_fetched_at := null;
    new.logo_source := null;
  end if;
  return new;
end $fn$;

drop trigger if exists trg_marketplace_brands_clear_stale_logo_stamp on public.marketplace_brands;
create trigger trg_marketplace_brands_clear_stale_logo_stamp
  before update of website on public.marketplace_brands
  for each row execute function public.marketplace_brands_clear_stale_logo_stamp();

do $verify$
declare
  v_dup int; v_lost int; v_live int; v_open int;
  v_carried int; v_cleared int; v_redirect_ok int; v_rows int; v_listings int;
begin
  -- Positive control FIRST: every zero below is equally satisfied by a probe that sees
  -- nothing. Prove the temp set and the corpus are both populated.
  select count(*), sum(artifact_listings + canonical_listings) into v_rows, v_listings from _before;
  if v_rows < 1 then
    raise exception 'brand families: _before is empty; this migration measured nothing';
  end if;
  if coalesce(v_listings, 0) < 1 then
    raise exception 'brand families: the families hold no listings; the probe is not measuring the corpus';
  end if;
  raise notice 'brand families: % artifact row(s) over % listing(s)', v_rows, v_listings;

  -- a. 20260919194058's invariant, WITHOUT its now-stale Fort Troff / MR. Riegillio
  --    exclusion: no approved+slugged display_name is duplicated.
  select count(*) into v_dup from (
    select display_name from marketplace_brands
    where status = 'approved' and slug is not null
    group by display_name having count(*) > 1) d;
  if v_dup <> 0 then
    raise exception 'brand families: % duplicate approved display_name(s) remain', v_dup;
  end if;

  -- b. NO LISTING WAS LOST. A "0 on the artifact key" check alone also passes if the rows
  --    were deleted, so both halves are asserted.
  select count(*) into v_lost from (
    select b.canonical_key,
           sum(b.artifact_listings) as moved,
           max(b.canonical_listings) as kept
    from _before b group by b.canonical_key) t
  where (select count(*) from marketplace_listings l where l.brand_key = t.canonical_key)
        <> t.moved + t.kept;
  if v_lost <> 0 then
    raise exception 'brand families: listing totals do not reconcile for % family(ies)', v_lost;
  end if;

  select count(*) into v_live from marketplace_listings l
  where l.brand_key in (select artifact_key from _before);
  if v_live <> 0 then
    raise exception 'brand families: % listing(s) still on an artifact brand_key', v_live;
  end if;

  -- c. every artifact is retired and unreachable by its own slug.
  select count(*) into v_open from marketplace_brands a
  join _before b on b.artifact_id = a.id
  where a.status <> 'rejected' or a.slug is not null or coalesce(a.product_count, 0) <> 0;
  if v_open <> 0 then
    raise exception 'brand families: % artifact row(s) not fully retired', v_open;
  end if;

  -- d. THE REDIRECT ACTUALLY WORKS. Asserted through the real consumer, not by counting
  --    rows in the redirect table -- a row that resolves to nothing would satisfy that.
  select count(*) into v_redirect_ok from _before b
  where b.artifact_slug is not null
    and exists (select 1 from get_marketplace_brand(b.artifact_slug) g
                where g.brand_key = b.canonical_key);
  if v_redirect_ok <> (select count(*) from _before where artifact_slug is not null) then
    raise exception 'brand families: only % retired slug(s) resolve to their survivor', v_redirect_ok;
  end if;

  -- e. the free-logo half landed: every survivor in a family that had a logo on either
  --    side now has one.
  select count(*) into v_carried from (
    select b.canonical_id from _before b
    group by b.canonical_id
    having bool_or(b.artifact_logo_url is not null) or bool_or(b.canonical_had_logo)) t
  join marketplace_brands c on c.id = t.canonical_id
  where c.logo_url is null;
  if v_carried <> 0 then
    raise exception 'brand families: % survivor(s) in a logo-bearing family still have no logo', v_carried;
  end if;

  -- f. the stale stamp is gone wherever a domain exists, and the trigger is attached.
  select count(*) into v_cleared from marketplace_brands
  where logo_url is null and logo_source = 'no_domain' and logo_fetched_at is not null
    and nullif(btrim(coalesce(website, '')), '') is not null;
  if v_cleared <> 0 then
    raise exception 'brand families: % brand(s) still carry a no_domain stamp over their own website', v_cleared;
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.marketplace_brands'::regclass
      and tgname = 'trg_marketplace_brands_clear_stale_logo_stamp'
      and not tgisinternal) then
    raise exception 'brand families: the self-invalidating stamp trigger is not attached';
  end if;

  raise notice 'brand families verified: % artifacts retired and redirected, logos carried, stale stamps cleared', v_rows;
end $verify$;

commit;
