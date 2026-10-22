-- Serialize an archived city's new relationships with its verification row.
-- A link arriving during a sweep must wait for the disposition and then reopen
-- it; checking status without locking could miss an uncommitted disposition.
create or replace function api_private.review_reopen_geography() returns trigger
language plpgsql security definer set search_path='' as $$
declare v jsonb:=to_jsonb(new)->tg_argv[0]; candidate text;
begin
 for candidate in select jsonb_array_elements_text(case when jsonb_typeof(v)='array' then v
  when v is null or v='null'::jsonb then '[]'::jsonb else jsonb_build_array(v) end) loop
  if exists(select 1 from public.cities where id=candidate::uuid and shell_status='ghost')
   or exists(select 1 from public.geo_cms_verifications where place_id=candidate::uuid and status='not_applicable') then
   perform 1 from public.geo_cms_verifications where place_id=candidate::uuid for update;
   if exists(select 1 from public.geo_cms_verifications where place_id=candidate::uuid and status='not_applicable')
    and not api_private.review_inactive_city_unlinked(candidate::uuid) then
    update public.geo_cms_verifications set status='review',checked_at=now() where place_id=candidate::uuid;
   end if;
  end if;
 end loop;
 return new;
end $$;
revoke all on function api_private.review_reopen_geography() from public,anon,authenticated;
do $patch$
declare s text; anchor text;
begin
 s:=pg_get_functiondef('api_private.run_review_automatic_resolution(integer,boolean)'::regprocedure);
 anchor:='where place_id=r.place_id returning to_jsonb(geo_cms_verifications) into v_after;';
 if (length(s)-length(replace(s,anchor,'')))/length(anchor)<>1 then raise exception 'Geography sweep update anchor changed'; end if;
 s:=replace(s,anchor,'where place_id=r.place_id and api_private.review_inactive_city_unlinked(r.place_id)
    returning to_jsonb(geo_cms_verifications) into v_after;
   if v_after is null or v_after->>''status''<>''not_applicable'' then v_geo:=v_geo-1; continue; end if;');
 execute s;
end $patch$;

