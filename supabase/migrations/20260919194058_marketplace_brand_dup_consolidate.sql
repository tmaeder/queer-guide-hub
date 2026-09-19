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

update marketplace_listings l set brand = c.canonical_name, updated_at = now()
from _consol c where l.brand_key = c.artifact_key;

update marketplace_brands b
set status='rejected', product_count=0, slug=NULL, reviewed_at=now(), updated_at=now(),
    reviewer_note = coalesce(b.reviewer_note || ' | ','')
      || 'auto-consolidate brand-dup: same brand as "' || c.canonical_name
      || '" under a second brand_key; listings re-keyed. prior slug=' || coalesce(b.slug,'(null)')
from _consol c where b.brand_key = c.artifact_key;

update marketplace_brands b
set product_count = (select count(*) from marketplace_listings l
                     where l.brand_key=b.brand_key and l.status='active'),
    updated_at = now()
where b.brand_key in (select canonical_key from _before);

do $verify$
declare v_dup int; v_lost int; v_live int; v_slug int;
begin
  select count(*) into v_dup from (
    select display_name from marketplace_brands
    where status='approved' and slug is not null group by display_name having count(*)>1) d
  where d.display_name not in ('Fort Troff','MR. Riegillio');
  if v_dup <> 0 then raise exception 'consolidate: % duplicate approved display_name(s) remain', v_dup; end if;

  select count(*) into v_lost from _before o
  where (select count(*) from marketplace_listings l where l.brand_key=o.canonical_key)
        <> o.artifact_listings + o.canonical_listings;
  if v_lost <> 0 then raise exception 'consolidate: listing totals do not reconcile for % pair(s)', v_lost; end if;

  select count(*) into v_live from marketplace_listings l
   where l.brand_key in (select artifact_key from _before);
  if v_live <> 0 then raise exception 'consolidate: % listing(s) still on an artifact brand_key', v_live; end if;

  select count(*) into v_slug from _before o join marketplace_brands b on b.brand_key=o.canonical_key
   where b.slug is distinct from o.canonical_slug;
  if v_slug <> 0 then raise exception 'consolidate: % canonical slug(s) moved', v_slug; end if;

  raise notice 'consolidate OK: 9 pairs merged, 0 listings lost, 0 canonical slugs moved';
end $verify$;