create or replace function public.queer_connect_stage_page(p_kind text,p_run uuid,p_owner uuid,p_page integer,p_total integer,p_pages integer,p_items jsonb)returns jsonb
language plpgsql security invoker set search_path='' as $qc$
declare c public.queer_connect_sync_cursors;x jsonb;sid text;h text;n integer:=0;changed integer:=0;begin
 select * into c from public.queer_connect_sync_cursors where kind=p_kind for update;
 if not found or c.owner<>p_owner or c.run_id<>p_run or c.status<>'running'or c.next_page<>p_page then raise exception'checkpoint ownership or page mismatch';end if;
 if jsonb_typeof(p_items)<>'array'or jsonb_array_length(p_items)>(case when p_kind='listings'then 100 else 50 end) or p_total<0 or p_pages<1 or p_page>p_pages then raise exception'invalid page';end if;
 if c.expected_total is not null and(c.expected_total<>p_total or c.expected_pages<>p_pages)then raise exception'upstream totals changed during scan; restart required';end if;
 for x in select value from jsonb_array_elements(p_items)loop
  sid:=x->'normalized'->>'sourceId';
  if sid is null or sid<>(case p_kind when 'listings' then 'listing:' when 'venues' then 'venue:' when 'organizers' then 'organizer:' else 'event:' end || (x->'raw'->>'id'))then raise exception'source identity mismatch';end if;
  if exists(select 1 from public.queer_connect_source_records where source_id=sid and last_seen_scan_id=c.scan_id)then raise exception'duplicate source identity across pages';end if;
  h:=encode(extensions.digest(((x->'raw')-array['views_count','date_modified','date_modified_gmt','modified','modified_date','modified_date_utc','popular','new','related_ids'])::text,'sha256'),'hex');
  insert into public.queer_connect_source_records(source_id,kind,raw_data,normalized_data,content_hash,last_seen_scan_id,last_seen_at,changed_at,pending,disposition)
  values(sid,p_kind,x->'raw',x->'normalized',h,c.scan_id,now(),now(),true,'pending')on conflict(source_id)do update set
   previous_normalized_data=case when queer_connect_source_records.content_hash is distinct from excluded.content_hash then queer_connect_source_records.normalized_data else queer_connect_source_records.previous_normalized_data end,
   raw_data=excluded.raw_data,normalized_data=excluded.normalized_data,content_hash=excluded.content_hash,last_seen_scan_id=c.scan_id,last_seen_at=now(),
   changed_at=case when queer_connect_source_records.content_hash is distinct from excluded.content_hash then now()else queer_connect_source_records.changed_at end,
   pending=queer_connect_source_records.pending or queer_connect_source_records.content_hash is distinct from excluded.content_hash;
  n:=n+1;
 end loop;
 if c.seen_count+n>p_total or(p_page=p_pages and c.seen_count+n<>p_total)then raise exception'incomplete source coverage: % / %',c.seen_count+n,p_total;end if;
 update public.queer_connect_sync_cursors set next_page=p_page+1,expected_total=p_total,expected_pages=p_pages,seen_count=seen_count+n,status=case when p_page=p_pages then'completed'else'running'end,completed_at=case when p_page=p_pages then now()else null end,lease_until=case when p_page=p_pages then null else now()+interval'150 seconds'end where kind=p_kind returning * into c;
 select count(*)into changed from public.queer_connect_source_records where last_seen_scan_id=c.scan_id and pending;
 return jsonb_build_object('items',n,'changed',changed,'next_page',c.next_page,'done',c.status='completed','total',c.expected_total);
end $qc$;

