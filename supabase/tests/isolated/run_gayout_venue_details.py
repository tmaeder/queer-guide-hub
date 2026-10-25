#!/usr/bin/env python3
"""Validate source-positive writes and protected ownership in a disposable DB."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
def binary(name):
    return str(Path(os.environ['PG_BINDIR']) / name) if os.environ.get('PG_BINDIR') else shutil.which(name)
schema = """
create schema auth;create schema extensions;
create extension pgcrypto with schema extensions;create extension unaccent with schema extensions;
create function auth.uid()returns uuid language sql as $$select null::uuid$$;
create function assert_admin_or_internal()returns void language plpgsql as $$begin return;end$$;
create function haversine_m(numeric,numeric,numeric,numeric)returns numeric language sql immutable as $$
 select sqrt(power(($1-$3)*111320,2)+power(($2-$4)*111320,2))$$;
-- The existing phone helper is tested separately against the native country codec.
create function canonicalize_phone(text,text)returns jsonb language sql immutable as $$
 select case when $1='933 472 424'and $2='AO'then '{"verdict":"ok","e164":"+244933472424"}'::jsonb else '{"verdict":"reject"}'::jsonb end$$;
create table countries(id uuid primary key,code text);
create table organizations(id uuid primary key,name text,primary_venue_id uuid,country_id uuid,city_id uuid,
 duplicate_of_id uuid,status text default 'active',claim_status text default 'unclaimed',last_verified_at timestamptz,
 roles text[]default array['venue'],field_provenance jsonb default '{"identity":{"source":"unified_location"}}',phone text,description text,
 quality_checked_at timestamptz default now()-interval '1 day',updated_at timestamptz default now(),safety_flags jsonb default '{"keep":true}');
create table venues(id uuid primary key,name text,organization_id uuid,country_id uuid,city_id uuid,updated_at timestamptz default now(),
 duplicate_of_id uuid,closed_at timestamptz,category text default 'hotel',latitude numeric default -8.8657789,longitude numeric default 13.1992332,
 phone text,phone_e164 text,description text,status text default 'approved',verification_status text default 'auto',safety_flags jsonb default '{"keep":true}');
create table venue_sources(id uuid primary key,venue_id uuid,source_slug text default 'gayout',source_url text,payload_hash text,payload jsonb,last_seen_at timestamptz);
create table content_revisions(source_table text,source_id uuid,actor_kind text,changed_fields text[]);
create table entity_quality_findings(entity_type text,entity_id uuid,dimension text,state text default 'fail',waived_by uuid,waived_at timestamptz);
create table venue_review_queue(venue_id uuid,field text,status text);
create table venue_field_provenance(venue_id uuid,field text,source text,value jsonb,confidence numeric,is_winning boolean,observed_at timestamptz);
create table fixture(n int,v uuid,o uuid,s uuid,c uuid,city uuid,old_v jsonb,old_o jsonb);
insert into fixture select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,null from generate_series(1,16)n;
insert into countries select c,'AO'from fixture;
insert into organizations(id,name,primary_venue_id,country_id,city_id)select o,'Venue '||n,v,c,city from fixture;
insert into venues(id,name,organization_id,country_id,city_id)select v,'Venue '||n,o,c,city from fixture;
insert into venue_sources(id,venue_id,source_url,payload_hash,payload)
 select s,v,'https://www.gayout.com/africa/angola/luanda/hotels/venue-'||n,repeat('a',64),
 jsonb_build_object('raw',jsonb_build_object('source','gayout'),'normalized',jsonb_build_object('metadata',jsonb_build_object('gayout_numeric_id',n)))from fixture;
insert into entity_quality_findings(entity_type,entity_id,dimension)select 'organization',o,'contact'from fixture;
-- Two description-only and one phone-only case protect existing data.
update venues set phone='+244900000000',phone_e164='+244900000000'where id=(select v from fixture where n=5);
update organizations set phone='+244900000000'where id=(select o from fixture where n=5);
update organizations set description='Existing attributable description stays exactly unchanged.'where id=(select o from fixture where n=14);
update organizations set claim_status='claimed'where id=(select o from fixture where n=3);
insert into content_revisions select 'venues',v,'human',array['phone']from fixture where n=4;
update organizations set roles=array['venue','merchant']where id=(select o from fixture where n=7);
update entity_quality_findings set waived_by=gen_random_uuid(),waived_at=now()where entity_id=(select o from fixture where n=12);
update organizations set field_provenance=field_provenance||'{"phone":"unknown ownership"}'where id=(select o from fixture where n=16);
update fixture f set old_v=to_jsonb(vv),old_o=to_jsonb(oo)from venues vv,organizations oo where vv.id=f.v and oo.id=f.o;
select set_config('matching.gayout_details_proofs',(
 select jsonb_agg(jsonb_build_object('contract','gayout_registered_venue_details:v1','human_reviewed',false,'http_status',200,
 'id',vv.id,'name',vv.name,'source_id',src.id,'source_url',src.source_url,'organization_id',oo.id,
 'country_code','AO','publisher_venue_id',case when pick.n=15 then 999 else pick.n end,
 'expected_updated_at',case when pick.n=11 then vv.updated_at-interval '1 hour'else vv.updated_at end,
 'payload_hash',case when pick.n=6 then repeat('b',64)else src.payload_hash end,
 'observed_at',case when pick.n=10 then now()-interval '2 hours'else now()end,
 'phone_raw',case when pick.n in(2,13)then null else '933 472 424'end,
 'description',body.ld->>'description','source_json_text',body.ld::text,
 'source_json_sha256',encode(extensions.digest(body.ld::text,'sha256'),'hex')))
 from fixture pick join venues vv on vv.id=pick.v join organizations oo on oo.id=pick.o join venue_sources src on src.id=pick.s
 cross join lateral(select jsonb_build_object('@type','LodgingBusiness','name',vv.name,'url',src.source_url,
 'telephone',case when pick.n in(2,13)then null else '933 472 424'end,
 'description',case when pick.n=13 then 'Short'else 'An established independent hotel welcomes visitors with comfortable rooms near the central transport routes and local attractions.'end,
 'address',jsonb_build_object('addressCountry',case when pick.n=8 then 'ZA'else 'AO'end),
 'geo',jsonb_build_object('latitude',case when pick.n=9 then -9 else vv.latitude end,'longitude',vv.longitude))ld)body)::text,false);
select set_config('matching.gayout_details_dry_run','false',false);
"""
assertions = """
do $test$
declare f record;vv jsonb;oo jsonb;
begin
 for f in select *from fixture loop
  select to_jsonb(v)into vv from venues v where id=f.v;select to_jsonb(o)into oo from organizations o where id=f.o;
  if f.n in(1,2,5,14)then
   assert oo->'quality_checked_at'='null'::jsonb,'Actual changed profile was not invalidated';
   if f.n in(1,14)then assert vv->>'phone'='+244933472424'and oo->>'phone'='+244933472424';end if;
   if f.n in(2,5)then assert vv->>'phone'is not distinct from f.old_v->>'phone','Existing phone changed';end if;
   if f.n=14 then assert oo->>'description'=f.old_o->>'description','Existing description overwritten';end if;
  else assert vv=f.old_v and oo=f.old_o,'Protected profile changed '||f.n;end if;
  assert vv-array['phone','phone_e164','updated_at']=f.old_v-array['phone','phone_e164','updated_at'];
  assert oo-array['phone','description','field_provenance','quality_checked_at','updated_at']=f.old_o-array['phone','description','field_provenance','quality_checked_at','updated_at'];
 end loop;
 assert not exists(select 1 from entity_quality_findings where state<>'fail'),'Source writer fabricated quality passes';
end $test$;
"""
sql = schema + (ROOT/'scripts/data-quality/register-gayout-venue-details.sql').read_text() + assertions
with tempfile.TemporaryDirectory(prefix='qg-gayout-details-') as tmp:
    data=Path(tmp)/'data'
    subprocess.run([binary('initdb'),'-D',str(data),'-A','trust','--no-locale','--wal-segsize=1'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([binary('pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55503 -c listen_addresses= -c min_wal_size=2MB -c max_wal_size=16MB','-w','start'],check=True,stdout=subprocess.DEVNULL)
    try:subprocess.run([binary('psql'),'-h',tmp,'-p','55503','-d','postgres','-v','ON_ERROR_STOP=1'],input=sql,text=True,check=True)
    finally:subprocess.run([binary('pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
