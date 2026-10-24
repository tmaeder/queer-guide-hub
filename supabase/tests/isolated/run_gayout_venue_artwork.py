#!/usr/bin/env python3
"""Exercise real publisher-media DML against protected and malformed captures."""
import ast
import os
from pathlib import Path
import subprocess
import tempfile
ROOT=Path(__file__).resolve().parents[3]
PG=Path(os.environ.get('PG_BINDIR','/opt/homebrew/opt/postgresql@17/bin'))
tree=ast.parse(Path(__file__).with_name('run_gayout_venue_details.py').read_text())
schema=next(ast.literal_eval(n.value)for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='schema'for t in n.targets)).split('insert into fixture select')[0]
schema+='''
alter table venues add column images text[]default '{}',add column verified boolean default false;
alter table organizations add column images text[]default '{}',add column logo_url text,add column cover_image_url text;
alter table entity_quality_findings add column evidence jsonb default '{}';
create table image_assets(id uuid,url text,content_hash text,is_flagged boolean default false,status text default 'active');
create table image_asset_links(asset_id uuid,entity_id uuid);
insert into fixture select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,null from generate_series(1,32)n;
insert into countries select c,'DE'from fixture;
insert into venues(id,name,organization_id,country_id,city_id,latitude,longitude)select v,'Venue '||n,o,c,city,50,8 from fixture;
insert into organizations(id,name,primary_venue_id,country_id,city_id)select o,'Venue '||n,v,c,city from fixture;
create table source_body as select n,jsonb_build_object('@type','BarOrPub','name','Venue '||n,'url','https://www.gayout.com/europe/germany/city/bars/venue-'||n,
 'address',jsonb_build_object('addressCountry','DE'),'geo',jsonb_build_object('latitude',50,'longitude',8))body,now()observed_at from fixture;
insert into venue_sources(id,venue_id,source_slug,source_url,payload_hash,payload)
 select s,v,'gayout',body->>'url',repeat('a',64),jsonb_build_object('raw',jsonb_build_object('source','gayout'),
 'normalized',jsonb_build_object('metadata',jsonb_build_object('gayout_numeric_id',n)),
 'detail_enrichment',jsonb_build_object('contract','gayout_registered_venue_details:v1','human_reviewed',false,'http_status',200,
 'source_json_text',body::text,'source_json_sha256',encode(extensions.digest(body::text,'sha256'),'hex'),'observed_at',observed_at))
 from fixture join source_body using(n);
insert into entity_quality_findings(entity_type,entity_id,dimension)select 'organization',o,'media'from fixture;
create table proofs as select n,jsonb_build_object('contract','gayout_registered_venue_artwork:v1','human_reviewed',false,
 'id',v.id,'name',v.name,'source_id',s.id,'source_url',s.source_url,'payload_hash',s.payload_hash,'expected_updated_at',v.updated_at,
 'publisher_venue_id',n,'source_json_text',body::text,'source_json_sha256',encode(extensions.digest(body::text,'sha256'),'hex'),
 'source_observed_at',observed_at,'url','https://www.gayout.com/uploads/venues/'||n||'/publisher.jpg',
 'listed_artwork_urls',jsonb_build_array('https://www.gayout.com/uploads/venues/'||n||'/publisher.jpg'),
 'probe',jsonb_build_object('passed',true,'status',200,'mime','image/jpeg','format','jpeg','width',1200,'height',800,'bytes',100000,
 'sha256',repeat(md5(n::text),2),'observed_at',now()))p from fixture f join venues v on v.id=f.v join venue_sources s on s.id=f.s join source_body using(n);
update organizations set claim_status='claimed'where id=(select o from fixture where n=2);
update organizations set field_provenance=field_provenance||'{"images":{"source":"human"}}'where id=(select o from fixture where n=3);
update venues set verified=true where id=(select v from fixture where n=4);
insert into content_revisions select 'venues',v,'human',array['images']from fixture where n=5;
update organizations set images=array['https://human.example/photo.jpg']where id=(select o from fixture where n=6);
insert into venue_review_queue select v,'images','open'from fixture where n=7;
update entity_quality_findings set waived_by=gen_random_uuid()where entity_id=(select o from fixture where n=8);
update proofs set p=jsonb_set(p,'{probe,width}','240')where n=9;
update proofs set p=jsonb_set(p,'{probe,bytes}','5000')where n=10;
update proofs set p=jsonb_set(p,'{url}','"https://www.gayout.com/uploads/venues/999/publisher.jpg"')where n=11;
update proofs set p=jsonb_set(p,'{source_observed_at}',to_jsonb(now()-interval '2 hours'))where n=12;
update proofs set p=jsonb_set(p,'{payload_hash}','"changed"')where n=13;
-- A changed JSON-LD body must fail even if its replacement hash is internally consistent.
update proofs set p=jsonb_set(p,'{source_json_text}',to_jsonb(jsonb_set((p->>'source_json_text')::jsonb,'{geo,latitude}','51')::text))where n=14;
update proofs set p=jsonb_set(p,'{source_json_text}',to_jsonb(jsonb_set((p->>'source_json_text')::jsonb,'{address,addressCountry}','"FR"')::text))where n=15;
update proofs set p=jsonb_set(p,'{source_json_text}',to_jsonb(jsonb_set((p->>'source_json_text')::jsonb,'{name}','"Other business"')::text))where n=16;
update proofs set p=jsonb_set(p,'{source_json_sha256}',to_jsonb(encode(extensions.digest(p->>'source_json_text','sha256'),'hex')))where n in(14,15,16);
insert into venue_field_provenance select v,'images','human','[]',1,true,now()from fixture where n=17;
insert into proofs select *from proofs where n=18;
update proofs set p=jsonb_set(p,'{probe,sha256}',to_jsonb(repeat('b',64)))where n in(19,20);
insert into image_assets values(gen_random_uuid(),'https://www.gayout.com/uploads/venues/21/publisher.jpg',null,true,'active');
update organizations set roles=array['venue','merchant']where id=(select o from fixture where n=22);
update proofs set p=jsonb_set(p,'{source_json_sha256}','"invalid"')where n=23;
update proofs set p=jsonb_set(p,'{probe,mime}','"text/html"')where n=24;
update proofs set p=jsonb_set(p,'{probe,width}','0')where n=25;
update venues set verification_status='verified'where id=(select v from fixture where n=26);
update venue_sources set payload=payload||'{"artwork_enrichment":{"previous":true}}'where id=(select s from fixture where n=27);
insert into image_assets values(md5('asset28')::uuid,'https://elsewhere.example/reused.jpg',repeat(md5('28'),2),false,'active');
insert into image_asset_links values(md5('asset28')::uuid,md5('unrelated')::uuid);
update proofs set p=jsonb_set(p,'{url}','"https://www.gayout.com/uploads/venues/29/pexels_publisher.jpg"')where n=29;
update venues set category='cruising'where id=(select v from fixture where n=30);
update organizations set last_verified_at=now()where id=(select o from fixture where n=31);
update organizations set country_id=gen_random_uuid()where id=(select o from fixture where n=32);
create table before_v as select id,to_jsonb(v)row from venues v;
create table before_o as select id,to_jsonb(o)row from organizations o;
create table before_s as select id,to_jsonb(s)row from venue_sources s;
create table before_f as select to_jsonb(f)row from entity_quality_findings f;
select set_config('matching.gayout_artwork_proofs',(select jsonb_agg(p)::text from proofs),false);
'''
operator=(ROOT/'scripts/data-quality/promote-gayout-venue-artwork.sql').read_text()
operator=operator.replace('\ncommit;',"\ncreate temporary table if not exists native_receipts(id bigint generated always as identity,result jsonb);insert into native_receipts(result)select current_setting('matching.gayout_artwork_result')::jsonb;\ncommit;")
apply=operator.replace('do $repair$',"select set_config('matching.gayout_artwork_dry_run','false',true);\ndo $repair$",1)
assertions='''
do $$declare f record;current_v jsonb;current_o jsonb;current_s jsonb;begin
 assert(select(result->>'eligible')::int from native_receipts order by id desc limit 1)=1;
 for f in select *from fixture loop
  select to_jsonb(v)into current_v from venues v where id=f.v;select to_jsonb(o)into current_o from organizations o where id=f.o;select to_jsonb(s)into current_s from venue_sources s where id=f.s;
  if f.n=1 then
   assert current_v#>>'{images,0}'='https://www.gayout.com/uploads/venues/1/publisher.jpg';
   assert current_o#>>'{images,0}'=current_v#>>'{images,0}';
   assert current_o->'quality_checked_at'='null'::jsonb;
   assert current_v-array['images','updated_at']=(select row-array['images','updated_at']from before_v where id=f.v);
   assert current_o-array['images','field_provenance','quality_checked_at','updated_at']=(select row-array['images','field_provenance','quality_checked_at','updated_at']from before_o where id=f.o);
   assert(current_o->'field_provenance')-'images'=(select(row->'field_provenance')-'images'from before_o where id=f.o);
   assert(current_s->'payload')-'artwork_enrichment'=(select(row->'payload')-'artwork_enrichment'from before_s where id=f.s);
  else
   assert current_v=(select row from before_v where id=f.v),'Protected venue changed '||f.n;
   assert current_o=(select row from before_o where id=f.o),'Protected profile changed '||f.n;
   assert current_s=(select row from before_s where id=f.s),'Protected source changed '||f.n;
  end if;
 end loop;
 assert(select jsonb_agg(row order by row::text)from before_f)=(select jsonb_agg(to_jsonb(finding_row)order by to_jsonb(finding_row)::text)from entity_quality_findings finding_row),'Artwork writer fabricated findings';
end $$;
'''
dry="do $$begin assert(select(result->>'eligible')::int from native_receipts order by id desc limit 1)=1;assert not exists(select 1 from before_v b join venues v using(id)where b.row<>to_jsonb(v));assert not exists(select 1 from before_o b join organizations o using(id)where b.row<>to_jsonb(o));end$$;"
repeat="do $$begin assert(select(result->>'eligible')::int from native_receipts order by id desc limit 1)=0;end$$;"
with tempfile.TemporaryDirectory(prefix='qg-gayout-artwork-')as tmp:
 data=Path(tmp)/'data'
 subprocess.run([str(PG/'initdb'),'-D',str(data),'-A','trust','--no-locale','--wal-segsize=1'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55510 -c listen_addresses= -c min_wal_size=2MB -c max_wal_size=16MB','-w','start'],check=True,stdout=subprocess.DEVNULL)
 try:subprocess.run([str(PG/'psql'),'-h',tmp,'-p','55510','-d','postgres','-v','ON_ERROR_STOP=1'],input=schema+"select set_config('matching.gayout_artwork_proofs',(select jsonb_agg(p)::text from proofs where n<=17),false);"+operator+dry+apply+assertions+"select set_config('matching.gayout_artwork_proofs',(select jsonb_agg(p)::text from proofs where n>=18),false);"+operator+repeat+apply+repeat+assertions.replace("assert(select(result->>'eligible')::int from native_receipts order by id desc limit 1)=1;",'')+"select set_config('matching.gayout_artwork_proofs',(select jsonb_agg(p)::text from proofs where n<=17),false);"+operator+repeat,text=True,check=True,stdout=subprocess.DEVNULL)
 finally:subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: 32 publisher/media/ownership cases, strict dimensions, dry run, whole-row guards, native findings untouched and replay')
