create temp table _brand_rename (old_name text primary key, new_name text not null, arm text not null) on commit drop;

insert into _brand_rename (old_name, new_name, arm) values
  ('Esterel Production','Ruf','a'),
  ('HK Nalone Electronic Technology Co., Ltd.','Nalone','a'),
  ('J.K. Ansell Ltd.','Kamasutra','a'),
  ('Playful Toys, Inc.','B Swish','a'),
  ('Blanche Industries GmbH','FRÖHLE','a'),
  ('BIORIUS','Shunga Erotic Art','a'),
  ('Advena Ltd.','Pasante','a'),
  ('Shenzhen J&L Technology Co., Ltd.','Pretty Love','a'),
  ('Euroscents','Tentacion','a'),
  ('SARL Rolling Skulls','CUT4MEN','a'),
  ('Scala 2.0 B.V.','Toyjoy','a'),
  ('MAPA GmbH','Billy Boy','a'),
  ('Finaflex','Stimul8','a'),
  ('THEMIS ARUnterstützung UG','Lovense','a'),
  ('Ohdoki AS','The Handy','a'),
  ('Alura Group BV','Autoblow','a'),
  ('CSSL Office 2','Bathmate','a'),
  ('Danatoys Aps','Dansex','a'),
  ('M.P.I. Pharmaceutica GmbH','Masculan','a'),
  ('Wonderboys','Cloneboy','a'),
  ('1979 SAS (Teil der Marc Dorcel Group)','DORCEL','a'),
  ('LoveBusiness B.V.','BodyGliss','a'),
  ('KESSEL medintim GmbH','Medintim','a');

insert into _brand_rename (old_name, new_name, arm) values
  ('Crazy Bull Hair Products Ltd','Crazy Bull','b'),
  ('Kiiroo B.V.','Kiiroo','b'),
  ('Svakom Europe BV','SVAKOM','b'),
  ('Orgie Company / Beautyenigma LDA','Orgie','b'),
  ('INTT Cosmetics / INTTW Euro Cosmetics LDA','INTT','b'),
  ('The Swede Company AB','Swede','b'),
  ('pjur group Luxembourg S.A','pjur','b'),
  ('Mystim GmbH','Mystim','b'),
  ('Secret Play S.L','Secret Play','b'),
  ('Private Media Group, Inc.','Private','b'),
  ('XPOWER Manufacture Inc.','XPOWER','b'),
  ('chilirose Wholesale','Chilirose','b'),
  ('Creative Conceptions Kft.','Creative Conceptions','b'),
  ('SHOTS BV','Shots','b'),
  ('Control Feel S.r.l.','Control','b'),
  ('FAIR SQUARED GmbH','Fair Squared','b'),
  ('Andromedical, S.L.','Andromedical','b'),
  ('Kheper Games Inc.','Kheper Games','b'),
  ('LifeStyles Healthcare Pte. Ltd.','LifeStyles','b'),
  ('WUG Functional Gums SL','WUG','b'),
  ('Spartacus Enterprises','Spartacus','b'),
  ('Hidden Desires Limited','Hidden Desires','b'),
  ('Salzgeber & Co. Medien GmbH','Salzgeber','b'),
  ('SUPER GAY UNDERWEAR | Official Online Store','Super Gay Underwear','b'),
  ('LA MAISON KOMANDŌ | LMK','LA MAISON KOMANDŌ','b'),
  ('Magnetic Poetry INC','Magnetic Poetry','b');

create temp table _brand_before on commit drop as
  select b.id, b.brand_key, b.slug, b.display_name, b.status, b.product_count
  from marketplace_brands b join _brand_rename r on r.old_name = b.display_name;

create temp table _listings_before on commit drop as
  select l.brand_key, count(*) n from marketplace_listings l
  where l.brand_key in (select brand_key from _brand_before) group by 1;

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
declare v_reached int; v_moved int; v_listing int; v_ctrl int; v_bad text;
begin
  select count(*) into v_reached from marketplace_brands b join _brand_rename r on r.new_name = b.display_name
   where b.id in (select id from _brand_before);
  if v_reached <> 49 then raise exception 'brand rename: % of 49 rows reached the new display_name', v_reached; end if;

  select count(*) into v_moved from marketplace_brands b join _brand_before o on o.id = b.id
   where b.slug is distinct from o.slug or b.brand_key is distinct from o.brand_key or b.status is distinct from o.status;
  if v_moved <> 0 then raise exception 'brand rename: % rows moved slug/brand_key/status', v_moved; end if;

  select count(*) into v_listing from _listings_before o
   full join (select brand_key, count(*) n from marketplace_listings
              where brand_key in (select brand_key from _brand_before) group by 1) n on n.brand_key = o.brand_key
   where o.n is distinct from n.n;
  if v_listing <> 0 then raise exception 'brand rename: listing counts changed for % brand_keys', v_listing; end if;

  select count(*), string_agg(c.name, ', ') into v_ctrl, v_bad
  from (values ('Spectrum Boutique'),('Mein Shop'),('Atixo GmbH'),('Lubry GmbH'),('CNEX AIE, S.L'),
    ('Guangdong Xise Industrial Company Ltd'),('W. W. Norton & Company'),('Westridge Laboratories Inc'),
    ('Rebelz Games'),('Jens Bruggemann Werbefotogafie'),('Kweer Cards / Peachy Kings'),('Darkness Sensations')
  ) c(name) where not exists (select 1 from marketplace_brands b where b.display_name = c.name);
  if v_ctrl <> 0 then raise exception 'brand rename: % control row(s) lost their name: %', v_ctrl, v_bad; end if;

  raise notice 'brand rename OK: 49 renamed, 0 URLs moved, 0 listings re-attributed, 12 controls intact';
end $verify$;