create or replace function public.logo_quality_finish(p_table text,p_id uuid,p_lease uuid,p_outcome text,p_url text,p_reason text,p_evidence jsonb,p_on_ink boolean default false)
returns text language plpgsql security invoker set search_path='' as $$
declare j public.logo_quality_jobs; current_url text; current_website text; final_url text; et text; next_status text; matched bigint; duplicate_id text;
begin
 if p_outcome not in ('repaired','verified','review','quarantined','retry') then raise exception 'invalid logo outcome'; end if;
 select * into j from public.logo_quality_jobs where entity_table=p_table and entity_id=p_id and lease=p_lease and status='processing' for update;
 if not found then return 'stale_lease'; end if;
 -- Identifier comes from the checked job table, never directly from an RPC caller.
 execute format('select r.logo_url,r.website,to_jsonb(r)->>''duplicate_of_id'' from public.%I r where r.id=$1 for update',j.entity_table) into current_url,current_website,duplicate_id using p_id;
 get diagnostics matched = row_count;
 if matched=0 or duplicate_id is not null or current_url is distinct from j.expected_url or current_website is distinct from j.expected_website then
   update public.logo_quality_jobs set status='superseded',updated_at=now() where entity_table=p_table and entity_id=p_id;
   update public.review_queue set status='resolved',resolved_at=now(),details=coalesce(details,'{}')||jsonb_build_object('resolution','superseded_entity_or_edit') where entity_id=p_id and review_type='logo_quality' and status in ('pending','open','pending_review','review');
   return 'superseded';
 end if;
 if p_outcome in ('repaired','verified') and (p_url is null or p_url !~ '^https://img[.]queer[.]guide/logos/[0-9a-f]{64}[.](png|jpg|webp|svg)$' or public.logo_mark_denied(p_url)) then raise exception 'unqualified logo'; end if;
 final_url := case when p_outcome='repaired' then p_url when p_outcome='quarantined' then null else current_url end;
 perform set_config('app.logo_quality_writer','on',true);
 if final_url is distinct from current_url then
   execute format('update public.%I set logo_url=$1,logo_fetched_at=now() where id=$2',j.entity_table) using final_url,p_id;
   if j.entity_table in ('venues','marketplace_brands') then
     execute format('update public.%I set logo_on_ink=$1 where id=$2',j.entity_table) using p_on_ink,p_id;
   end if;
 end if;
 perform set_config('app.logo_quality_writer','off',true);
 next_status := case when p_outcome='retry' and j.attempts>=3 then 'review' else p_outcome end;
 if next_status<>'retry' then
   execute format('update public.%I set logo_fetched_at=now() where id=$1',j.entity_table) using p_id;
 end if;
 update public.logo_quality_jobs set status=next_status,candidate_url=p_url,reason=p_reason,
   evidence=evidence||coalesce(p_evidence,'{}'),checked_at=now(),updated_at=now()
 where entity_table=p_table and entity_id=p_id;
 insert into public.logo_quality_history(entity_table,entity_id,previous_url,replacement_url,previous_website,outcome,evidence)
 values(p_table,p_id,current_url,final_url,current_website,next_status,coalesce(p_evidence,'{}')||jsonb_build_object('reason',p_reason,'candidate_url',p_url));
 if next_status in ('review','quarantined') then
   et := case p_table when 'venues' then 'venue' when 'events' then 'event' when 'organizations' then 'organization' else 'marketplace_brand' end;
   if not exists(select 1 from public.review_queue where entity_type=et and entity_id=p_id and review_type='logo_quality' and status in ('pending','open','pending_review','review')) then
     insert into public.review_queue(entity_type,entity_id,review_type,details)
     values(et,p_id,'logo_quality',jsonb_build_object('title',j.entity_name,'name',j.entity_name,'field','logo_url',
       'current_url',final_url,'previous_url',current_url,'candidate_url',p_url,'website',j.expected_website,'reason',p_reason,'evidence',p_evidence));
   end if;
 end if;
 return next_status;
end $$;
revoke all on function public.logo_quality_finish(text,uuid,uuid,text,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.logo_quality_finish(text,uuid,uuid,text,text,text,jsonb,boolean) to service_role;

-- Aliases merged during this audit no longer need a separate human decision.
update public.logo_quality_jobs j set status='superseded',reason='entity_merged',updated_at=now()
from public.venues v where j.entity_table='venues' and j.entity_id=v.id and v.duplicate_of_id is not null;
update public.logo_quality_jobs j set status='superseded',reason='entity_merged',updated_at=now()
from public.events e where j.entity_table='events' and j.entity_id=e.id and e.duplicate_of_id is not null;
update public.review_queue r set status='resolved',resolved_at=now(),details=coalesce(r.details,'{}')||jsonb_build_object('resolution','entity_merged')
from public.logo_quality_jobs j where j.entity_id=r.entity_id and j.status='superseded'
and r.review_type='logo_quality' and r.status in ('pending','open','pending_review','review');
