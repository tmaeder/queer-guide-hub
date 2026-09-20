-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260920084019 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
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
  select count(*), string_agg(cs,', ') into v, v_txt from (
    select marketplace_brand_slug(brand_key) cs from marketplace_brands
    where status='approved' and slug is not null and product_count>0 group by 1 having count(*)>1) d;
  if v <> 0 then raise exception 'canon2: % slug-base split(s) remain: %', v, v_txt; end if;

  select count(*) into v from (
    select marketplace_normalize_brand(display_name) k from marketplace_brands
    where status='approved' and slug is not null and product_count>0 group by 1 having count(*)>1) d;
  if v <> 0 then raise exception 'canon2: % normalise-split(s) remain', v; end if;

  select count(*), string_agg(b.brand_key,', ') into v, v_txt
  from _before o join marketplace_brands b on b.brand_key=o.survivor_key
  where b.brand_key is distinct from marketplace_normalize_brand(b.display_name)
     or b.slug is distinct from marketplace_brand_slug(b.brand_key);
  if v <> 0 then raise exception 'canon2: % survivor(s) not self-consistent: %', v, v_txt; end if;

  select count(*) into v from _before o
   where (select count(*) from marketplace_listings l where l.brand_key=o.survivor_key) <> o.sn + o.ln;
  if v <> 0 then raise exception 'canon2: listing totals do not reconcile for % pair(s)', v; end if;
  select count(*) into v from marketplace_listings l where l.brand_key in (select loser_key from _before);
  if v <> 0 then raise exception 'canon2: % listing(s) still on a retired key', v; end if;

  select count(*) into v from marketplace_brands
   where slug in ('b-vibe','mr-s-leather','ouch','rocks-off','strap-on-me')
     and status='approved' and product_count>0;
  if v <> 5 then raise exception 'canon2: only % of 5 clean slugs live', v; end if;
  select count(*) into v from marketplace_brands
   where slug in ('b-vibe-e3a1','mr-s-leather-77da','ouch-7434','rocks-off-2','strap-on-me-7b42');
  if v <> 0 then raise exception 'canon2: % uniquifier slug(s) still held', v; end if;

  raise notice 'canon2 OK: 5 pairs merged, 0 splits by either test, 0 listings lost';
end $verify$;;
