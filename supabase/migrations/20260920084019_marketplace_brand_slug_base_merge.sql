-- Five more maker pages were the same brand twice, and `normalize_brand` is
-- structurally unable to see them.
--
-- `20260920083621` fixed the eight splits that `marketplace_normalize_brand()`
-- can detect. That function is `lower(btrim(x))` plus whitespace collapse — it
-- **does not strip punctuation**, while `marketplace_brand_slug()` replaces every
-- `[^a-z0-9]+` run with `-`. So two rows can produce the same SLUG and still
-- normalise differently, and those pairs were invisible to the previous
-- migration's strongest test. Measured on prod 2026-09-20:
--
--     b-Vibe        (b-vibe)       / B Vibe       (b vibe)
--     MR S LEATHER  (mr s leather) / Mr-S-Leather (mr-s-leather)
--     OUCH          (ouch)         / Ouch!        (ouch!)
--     Rocks-Off     (rocks-off)    / Rocks off    (rocks off)
--     Strap-On-Me   (strap-on-me)  / Strap On Me  (strap on me)
--
-- **THE IDENTITY FUNCTION FOR THIS TABLE IS `marketplace_brand_slug(brand_key)`,
-- NOT `normalize_brand(display_name)`.** The slug is what the URL space is keyed
-- on and what the UNIQUE index enforces, so two rows sharing a slug base ARE one
-- maker page split in two, whatever their `brand_key` says. Postcondition (a)
-- uses the slug base and (b) keeps the weaker test as well, so this file cannot
-- pass by regressing what `20260920083621` fixed.
--
-- ── the fingerprint was the slug uniquifier, and the obvious regex is WRONG ──
-- `20260702150000` backfills a colliding slug with a suffix, so these rows carry
-- `-e3a1`, `-77da`, `-7434`, `-7b42` and `-2`. That suffix is the visible symptom
-- of the whole class. It was considered as a standing invariant ("no advertised
-- slug ends in a collision uniquifier") and **REJECTED, measured**: `-[0-9a-f]{4}$`
-- also matches `vaux-by-cb13`, where `cb13` is CellBlock 13 — part of the brand's
-- actual name — so the rule would condemn a legitimate slug. And it would have
-- missed `rocks-off-2` entirely, since the older backfill used a NUMERIC
-- uniquifier. The slug-base grouping finds all five and flags nothing real;
-- a suffix regex does neither.
--
-- ── NO display_name is changed, and that is deliberate ──
-- Three survivors keep a name that is arguably worse than the one on the row
-- being retired (`MR S LEATHER` over `Mr-S-Leather`, `OUCH` over `Ouch!`). The
-- title-prefix corroboration this programme uses throughout returns evidence for
-- only two of the five — `b-Vibe Vibrating Snug Plug` and `Strap-On-Me …`,
-- both confirming the survivor's existing name — and NONE for `ouch` or
-- `mr s leather`. `Ouch!` is very likely the real mark and `Mr. S. Leather`
-- certainly is, but neither is corroborated and `Mr-S-Leather` is itself a
-- hyphen-for-space feed artifact, so inventing the correct rendering is out of
-- scope. Under-reaching is the correct error; left for a human.
--
-- ── the survivor is whichever row is already self-consistent ──
-- All five survivors satisfy `brand_key = normalize(display_name)` AND
-- `slug = brand_slug(brand_key)` after this runs, which is why no name needed
-- changing: picking the consistent row and keeping its name are the same choice.
-- Two are Shape B (`rocks-off`, `strap-on-me`), where the clean slug sat on the
-- LOSER — retiring it frees the slug and step 4 moves it onto the survivor, so
-- `/marketplace/brands/rocks-off` keeps working and `rocks-off-2` is what dies.
--
-- ── nothing editorial is at risk in this batch, and it was checked ──
-- Unlike `20260920083621`, where both Shape-B losers carried
-- `ownership_tags = ['queer_owned']` and a hand-written story, all ten rows here
-- have empty `ownership_tags`, no story, no logo and no website. The carry step
-- is kept anyway so the file is safe to copy.
--
-- Applied live via MCP; the file carries the APPLIED version so `db push` skips
-- it, and the `reviewer_note` stamp stays the version-free `auto-merge
-- brand-canon` shared with `20260920083621`.


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

create temp table _canon (survivor_key text primary key, loser_key text not null,
                          final_name text not null, claim_slug text) on commit drop;
insert into _canon values
  ('b-vibe',       'b vibe',       'b-Vibe',       null),
  ('mr s leather', 'mr-s-leather', 'MR S LEATHER', null),
  ('ouch',         'ouch!',        'OUCH',         null),
  ('rocks-off',    'rocks off',    'Rocks-Off',    'rocks-off'),
  ('strap-on-me',  'strap on me',  'Strap-On-Me',  'strap-on-me');

do $pre$
declare v int; v_txt text;
begin
  -- the survivor must be approved, slugged, and self-consistent on BOTH
  -- derivations once its (possibly claimed) slug is in place.
  select count(*), string_agg(c.survivor_key,', ') into v, v_txt from _canon c
  where not exists (select 1 from marketplace_brands b where b.brand_key=c.survivor_key
                    and b.status='approved' and b.slug is not null
                    and b.brand_key = marketplace_normalize_brand(c.final_name)
                    and marketplace_brand_slug(b.brand_key) = coalesce(c.claim_slug, b.slug));
  if v <> 0 then raise exception 'canon2: % survivor(s) fail the premise: %', v, v_txt; end if;

  select count(*) into v from _canon c where c.loser_key=c.survivor_key
    or not exists (select 1 from marketplace_brands b where b.brand_key=c.loser_key);
  if v <> 0 then raise exception 'canon2: % loser(s) missing or same as survivor', v; end if;

  select count(*) into v from _canon c where c.claim_slug is not null
   and not exists (select 1 from marketplace_brands b where b.slug=c.claim_slug and b.brand_key=c.loser_key);
  if v <> 0 then raise exception 'canon2: % claim_slug(s) not held by their loser', v; end if;

  -- and the pair must really be ONE brand: identical slug base. This is the
  -- premise the whole file rests on, so it is asserted rather than eyeballed.
  select count(*) into v from _canon c
   where marketplace_brand_slug(c.survivor_key) is distinct from marketplace_brand_slug(c.loser_key);
  if v <> 0 then raise exception 'canon2: % pair(s) do not share a slug base', v; end if;
end $pre$;

create temp table _before on commit drop as
select c.*, (select count(*) from marketplace_listings l where l.brand_key=c.survivor_key) as sn,
            (select count(*) from marketplace_listings l where l.brand_key=c.loser_key) as ln
from _canon c;

update marketplace_brands s
set story=coalesce(s.story,l.story), website=coalesce(s.website,l.website),
    logo_url=coalesce(s.logo_url,l.logo_url),
    logo_on_ink=case when s.logo_url is null and l.logo_url is not null then l.logo_on_ink else s.logo_on_ink end,
    ownership_tags=case when coalesce(array_length(s.ownership_tags,1),0)=0 then l.ownership_tags else s.ownership_tags end,
    updated_at=now()
from _canon c join marketplace_brands l on l.brand_key=c.loser_key where s.brand_key=c.survivor_key;

update marketplace_listings l set brand=c.final_name, updated_at=now()
from _canon c where l.brand_key=c.loser_key;

update marketplace_brands b
set status='rejected', product_count=0, slug=NULL, reviewed_at=now(), updated_at=now(),
    reviewer_note=coalesce(b.reviewer_note||' | ','')
      ||'auto-merge brand-canon: same brand as brand_key='||c.survivor_key
      ||' (identical slug base); listings re-keyed, editorial content carried. prior slug='||coalesce(b.slug,'(null)')
from _canon c where b.brand_key=c.loser_key;

update marketplace_brands b set slug=c.claim_slug, updated_at=now()
from _canon c where b.brand_key=c.survivor_key and c.claim_slug is not null;

update marketplace_brands b
set display_name=c.final_name,
    product_count=(select count(*) from marketplace_listings l where l.brand_key=b.brand_key and l.status='active'),
    updated_at=now()
from _canon c where b.brand_key=c.survivor_key;

do $verify$
declare v int; v_txt text;
begin
  -- a. ZERO splits by SLUG BASE — the strong test, the one that found these.
  select count(*), string_agg(cs,', ') into v, v_txt from (
    select marketplace_brand_slug(brand_key) cs from marketplace_brands
    where status='approved' and slug is not null and product_count>0 group by 1 having count(*)>1) d;
  if v <> 0 then raise exception 'canon2: % slug-base split(s) remain: %', v, v_txt; end if;

  -- b. and zero by the weaker test, so this cannot pass by undoing 20260920083621.
  select count(*) into v from (
    select marketplace_normalize_brand(display_name) k from marketplace_brands
    where status='approved' and slug is not null and product_count>0 group by 1 having count(*)>1) d;
  if v <> 0 then raise exception 'canon2: % normalise-split(s) remain', v; end if;

  -- c. survivors self-consistent on both derivations.
  select count(*), string_agg(b.brand_key,', ') into v, v_txt
  from _before o join marketplace_brands b on b.brand_key=o.survivor_key
  where b.brand_key is distinct from marketplace_normalize_brand(b.display_name)
     or b.slug is distinct from marketplace_brand_slug(b.brand_key);
  if v <> 0 then raise exception 'canon2: % survivor(s) not self-consistent: %', v, v_txt; end if;

  -- d. no listing lost, both halves.
  select count(*) into v from _before o
   where (select count(*) from marketplace_listings l where l.brand_key=o.survivor_key) <> o.sn + o.ln;
  if v <> 0 then raise exception 'canon2: listing totals do not reconcile for % pair(s)', v; end if;
  select count(*) into v from marketplace_listings l where l.brand_key in (select loser_key from _before);
  if v <> 0 then raise exception 'canon2: % listing(s) still on a retired key', v; end if;

  -- e. every clean URL live; every uniquifier artifact released.
  select count(*) into v from marketplace_brands
   where slug in ('b-vibe','mr-s-leather','ouch','rocks-off','strap-on-me')
     and status='approved' and product_count>0;
  if v <> 5 then raise exception 'canon2: only % of 5 clean slugs live', v; end if;
  select count(*) into v from marketplace_brands
   where slug in ('b-vibe-e3a1','mr-s-leather-77da','ouch-7434','rocks-off-2','strap-on-me-7b42');
  if v <> 0 then raise exception 'canon2: % uniquifier slug(s) still held', v; end if;

  raise notice 'canon2 OK: 5 pairs merged, 0 splits by either test, 0 listings lost';
end $verify$;

