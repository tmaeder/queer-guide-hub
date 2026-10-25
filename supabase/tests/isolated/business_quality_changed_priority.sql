-- A corrected recently checked profile must not wait behind 2,000 daily checks.
create table organizations(id integer primary key,duplicate_of_id integer,quality_checked_at timestamptz,updated_at timestamptz);
insert into organizations select n,null,now()-interval '2 days',now()-interval '3 days'from generate_series(1,2001)n;
insert into organizations values(3000,null,now()-interval '1 hour',now()),(3001,null,null,now()),(3002,1,now()-interval '1 hour',now());
create function refresh_business_brand_quality()returns integer[]language sql stable security definer set search_path=public,pg_temp as $$
 SELECT array_agg(id) FROM (
 SELECT id FROM organizations
 WHERE duplicate_of_id IS NULL AND (quality_checked_at IS NULL
 OR quality_checked_at < now()-interval '1 day' OR updated_at>quality_checked_at)
 ORDER BY quality_checked_at NULLS FIRST,id LIMIT 2000
 ) selected
$$;
do $before$begin
 assert not(3000=any(refresh_business_brand_quality())),'Fixture failed to reproduce delayed correction';
end $before$;
