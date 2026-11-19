-- Production regression fixtures for the established territory comparison.
-- Calls the real public wrapper, with every verification write rolled back.
begin;
set local statement_timeout='15s';
set local lock_timeout='2s';
create temp table geo_verifier_before on commit drop as
select id,to_jsonb(c) row_data from public.cities c where id in (
 'ca89cf6f-d161-4d25-b558-8831b803894c','2f978911-985d-4c29-a08b-6dce8c40591b',
 '343d6987-2e90-4d58-a2df-fc9fa3ac7425','dbb3d43d-5da0-4f43-b5af-c9e0274133c2');
do $test$
declare r record; result jsonb; checks jsonb;
begin
 if (select count(*)from geo_verifier_before)<>4 then raise exception 'Missing production city fixtures';end if;
 for r in select *from(values
  ('ca89cf6f-d161-4d25-b558-8831b803894c'::uuid,'Fort-de-France','country_checked',true),
  ('2f978911-985d-4c29-a08b-6dce8c40591b'::uuid,'Sosnowiec','country_checked',true),
  ('343d6987-2e90-4d58-a2df-fc9fa3ac7425'::uuid,'Beausoleil','review',false),
  ('dbb3d43d-5da0-4f43-b5af-c9e0274133c2'::uuid,'Lippen','review',true)
 )x(id,name,expected_status,expected_country_match)loop
  result:=public.geo_cms_verify(r.id);
  checks:=result#>'{verification,checks}';
  if result->>'verification_status' is distinct from r.expected_status
    or (checks->>'country_match')::boolean is distinct from r.expected_country_match
    then raise exception 'Unexpected country/classification result for %: %',r.name,result->'verification';end if;
  if checks->>'identity_verified' is distinct from 'false'
    or checks->>'parent_verified' is distinct from 'false'
    or checks->>'queer_designation_verified' is distinct from 'false'
    then raise exception 'Geography check escalated human verification for %',r.name;end if;
  if r.name='Fort-de-France'and(checks->>'country_code'<>'MQ'or checks->>'polygon_country'<>'FR')then
   raise exception 'Original territory and polygon codes were erased';end if;
  if r.name='Lippen'and checks->>'city_classification' is null then
   raise exception 'City classification gate was bypassed';end if;
 end loop;
 if exists(select 1 from geo_verifier_before b join public.cities c using(id)where to_jsonb(c)is distinct from b.row_data)
 then raise exception 'Verification changed a city source record';end if;
 perform set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000000","app_metadata":{}}',true);
 begin
  perform public.geo_cms_verify('ca89cf6f-d161-4d25-b558-8831b803894c');
  raise exception 'Unprivileged verifier was accepted';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims','',true);
end $test$;
select jsonb_build_object('cases',4,'source_rows_unchanged',true,'human_gates_preserved',true,'unprivileged_denied',true) result;
rollback;

