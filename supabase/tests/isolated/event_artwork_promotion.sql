create table fixture(n int,id uuid,token uuid,old_row jsonb);
insert into fixture select n,gen_random_uuid(),gen_random_uuid(),null from generate_series(1,5)n;
insert into events(id,title,description,images,start_date,end_date,field_provenance)
 select id,'Source event '||n,'Preserved source prose',array[
 'https://images.example.test/tiny.png','https://images.example.test/poster.png','https://images.example.test/gallery.png'],
 now()+interval '1 day',now()+interval '2 days','{"description":{"human_reviewed":true}}'::jsonb from fixture;
insert into event_gap_queue(event_id,lane,lease_token,lease_until,next_attempt_at)
 select id,'image',token,now()+interval '5 minutes',now()from fixture;
insert into event_quality_issues select id,'open','IMAGE_LOW_RESOLUTION','{"url":"https://images.example.test/tiny.png"}' from fixture;
update events set status='completed'where id=(select id from fixture where n=4);
update fixture f set old_row=to_jsonb(e)from events e where e.id=f.id;
do $test$
declare r record;result jsonb;token uuid;patch jsonb;evidence jsonb;after_row jsonb;
begin
 assert not has_function_privilege('anon','finish_event_gap(uuid,text,uuid,jsonb,jsonb,text,jsonb)','execute');
 assert has_function_privilege('service_role','finish_event_gap(uuid,text,uuid,jsonb,jsonb,text,jsonb)','execute');
 for r in select * from fixture order by n loop
  token:=case when r.n=2 then gen_random_uuid()else r.token end;
  patch:=jsonb_build_object('images',jsonb_build_array(case when r.n=5 then 'http://127.0.0.1/unsafe.png'else 'https://images.example.test/poster.png'end));
  evidence:=jsonb_build_object('confidence',1,'source_url','https://images.example.test/source',
   'previous_images',case when r.n=3 then '["changed.png"]'::jsonb else r.old_row->'images'end);
  result:=finish_event_gap(r.id,'image',token,patch,evidence,'updated','{}');
  select to_jsonb(e)into after_row from events e where e.id=r.id;
  if r.n=1 then
   assert result->>'outcome'='updated',result::text;
   assert after_row->'images'='["https://images.example.test/poster.png","https://images.example.test/gallery.png"]'::jsonb,after_row::text;
   assert after_row-array['images','field_provenance','updated_at']=r.old_row-array['images','field_provenance','updated_at'];
   assert(after_row->'field_provenance')-'images'=r.old_row->'field_provenance';
  else
   assert after_row=r.old_row,'An existing completion guard was weakened';
   assert result->>'outcome'=case when r.n=2 then 'lease_lost'when r.n=4 then 'ineligible'else 'no_change'end,result::text;
  end if;
 end loop;
 assert(select count(*)from event_quality_signals where value=1)=1;
end $test$;
