-- Execute against a database with canonical geography. All writes are rolled back.
begin;
do $test$
declare v public.queer_villages; target public.cities; stamp timestamptz; old_country uuid; other_country uuid;
begin
  select q.* into strict v from queer_villages q where q.name='Brunswick' and q.duplicate_of_id is null limit 1;
  select * into strict target from cities where country_id=v.country_id and id<>v.city_id and duplicate_of_id is null order by id limit 1;
  perform geo_cms_verify(v.id);
  -- Direct CMS field write must cascade to attached content and shared hierarchy.
  update queer_villages set city_id=target.id,updated_at=clock_timestamp() where id=v.id;
  if exists(select 1 from venues where queer_village_id=v.id and (city_id is distinct from target.id or country_id is distinct from target.country_id)) then raise exception 'Village CMS write did not cascade venues'; end if;
  if exists(select 1 from geo_places where id=v.id and parent_id is distinct from target.id) then raise exception 'Village CMS write did not update hierarchy'; end if;
  if (select status from geo_cms_verifications where place_id=v.id)<>'stale' then raise exception 'Parent evidence was not invalidated'; end if;
  select updated_at into stamp from geo_places where id=v.id;
  -- Tree write must return to the original canonical parent and cascade identically.
  perform geo_cms_move(v.id,v.city_id,stamp);
  if exists(select 1 from venues where queer_village_id=v.id and city_id is distinct from v.city_id) then raise exception 'Tree move did not cascade venues'; end if;
  -- Optimistic concurrency rejects stale timestamps; failure must leave parent intact.
  begin
    perform geo_cms_move(v.id,target.id,'2000-01-01'::timestamptz);
    raise exception 'Stale move was accepted';
  exception when serialization_failure then null; end;
  if (select city_id from queer_villages where id=v.id) is distinct from v.city_id then raise exception 'Failed move changed canonical parent'; end if;
  -- Wrong parent types fail without any write.
  begin
    perform geo_cms_move(v.id,v.country_id,(select updated_at from geo_places where id=v.id));
    raise exception 'Wrong parent type was accepted';
  exception when raise_exception then
    if sqlerrm='Wrong parent type was accepted' then raise; end if;
  end;
  -- Name and pin edits invalidate their existing evidence.
  perform geo_cms_verify(v.id);
  update queer_villages set latitude=latitude+0.00001,updated_at=clock_timestamp() where id=v.id;
  if (select status from geo_cms_verifications where place_id=v.id)<>'stale' then raise exception 'Pin evidence stayed current'; end if;
  -- City country edits cascade to villages, all linked types, and safety gates.
  update queer_villages set city_id=target.id,updated_at=clock_timestamp() where id=v.id;
  old_country:=v.country_id;
  select id into other_country from countries where id<>old_country and duplicate_of_id is null order by id limit 1;
  update cities set latitude=null,longitude=null,country_id=other_country,updated_at=clock_timestamp() where id=target.id;
  if exists(select 1 from queer_villages where city_id=target.id and country_id is distinct from other_country)
     or exists(select 1 from venues where city_id=target.id and country_id is distinct from other_country)
     or exists(select 1 from events where city_id=target.id and country_id is distinct from other_country)
     or exists(select 1 from hotels where city_id=target.id and country_id is distinct from other_country)
     or exists(select 1 from organizations where city_id=target.id and country_id is distinct from other_country) then raise exception 'City country edit did not cascade'; end if;
  if exists(select 1 from venues where city_id=target.id and safety_gated is distinct from venue_is_safety_gated(country_id,city_id,category)) then raise exception 'Venue safety gate is stale'; end if;
  -- Unprivileged authenticated callers cannot read admin data or apply evidence.
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000000","app_metadata":{}}',true);
  begin
    perform geo_cms_rows(); raise exception 'Unprivileged reader was accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform geo_cms_verify(v.id); raise exception 'Unprivileged verifier was accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','',true);
end $test$;
rollback;
