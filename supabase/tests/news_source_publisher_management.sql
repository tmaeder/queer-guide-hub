-- Regression assertions. Load fixture and both source-management migrations in an isolated DB.
begin;
-- Match the legacy table privileges when using the minimal isolated fixture.
grant select,insert,update,delete on public.news_sources to authenticated;
grant select on public.organizations to authenticated;
do $$
declare org uuid; wrong_org uuid; archived_org uuid; merged_org uuid; source uuid; row_data jsonb; form jsonb; stamp timestamptz; options jsonb;
begin
 insert into public.organizations(name,roles,status,website_domain) values('Publisher One',array['publisher'],'active','www.example.com') returning id into org;
 insert into public.organizations(name,roles,status) values('Venue One',array['venue'],'active') returning id into wrong_org;
 insert into public.organizations(name,roles,status) values('Retired Publisher',array['publisher'],'archived') returning id into archived_org;
 insert into public.organizations(name,roles,status,duplicate_of_id) values('Merged Publisher',array['publisher'],'active',org) returning id into merged_org;
 form:=jsonb_build_object('name','Feed One','url','https://example.com/feed.xml','category','general','source_type','rss','feed_type','news','fetch_frequency',120,'is_active',true,'auto_publish',false,'keywords',jsonb_build_array('queer'),'organization_id',org);
 row_data:=public.admin_news_source_save(null,form,null); source:=(row_data->>'id')::uuid; stamp:=(row_data->>'updated_at')::timestamptz;
 assert row_data->>'organization_id'=org::text, 'Link publisher';
 options:=public.admin_news_source_publishers('','https://www.EXAMPLE.com/feed.xml');
 assert jsonb_array_length(options)=1 and (options->0->>'domain_match')::boolean, 'Suggest exact host match and exclude merged/archived';
 assert jsonb_array_length(public.admin_news_source_publishers('missing',''))=0, 'Search publishers';
 begin perform public.admin_news_source_save(null,form,null); raise exception 'Duplicate feed accepted'; exception when unique_violation then null; end;
 begin perform public.admin_news_source_save(source,form,null); raise exception 'Stale save accepted'; exception when serialization_failure then null; end;
 begin perform public.admin_news_source_save(source,form||jsonb_build_object('organization_id',wrong_org),stamp); raise exception 'Non-publisher accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.admin_news_source_save(source,form||jsonb_build_object('organization_id',archived_org),stamp); raise exception 'Archived publisher accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.admin_news_source_save(source,form||jsonb_build_object('organization_id',merged_org),stamp); raise exception 'Merged publisher accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.admin_news_source_save(source,form||jsonb_build_object('fetch_frequency',0),stamp); raise exception 'Invalid frequency accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.admin_news_source_save(source,form||jsonb_build_object('url','https://user:pass@example.com/feed'),stamp); raise exception 'Credential URL accepted'; exception when invalid_parameter_value then null; end;
 update public.news_sources set auto_paused=true,auto_paused_reason='HTTP 500',consecutive_failures=5,last_error='Keep diagnostic' where id=source;
 row_data:=public.admin_news_source_save(source,form||jsonb_build_object('organization_id',null,'is_active',false,'last_error','overwrite','auto_paused',false),stamp);
 assert (row_data->>'auto_paused')::boolean and row_data->>'last_error'='Keep diagnostic', 'Editing cannot overwrite ingestion health';
 assert row_data->>'organization_id' is null, 'Unlink publisher';
 assert (public.admin_news_sources_browse('Feed','inactive',null,true,0)->>'total')::integer=1, 'Inactive and unlinked sources are manageable';
 assert (public.admin_news_sources_browse('','all',org,false,0)->>'total')::integer=0, 'Organisation scope follows unlink';
 row_data:=public.admin_news_source_resume(source,(row_data->>'updated_at')::timestamptz);
 assert (row_data->>'is_active')::boolean and not (row_data->>'auto_paused')::boolean and row_data->>'last_error'='Keep diagnostic', 'Explicit resume preserves historical diagnostics';
 insert into public.news_articles(source_id,title,quality_status) select source,'Article '||i,'passed' from generate_series(1,55) i;
 assert (public.admin_news_sources_browse('Feed','all',null,false,0)->'rows'->0->>'article_count')::integer=55,'Article counts';
 assert jsonb_array_length(public.admin_news_source_articles(source,0)->'rows')=50,'First article page';
 assert jsonb_array_length(public.admin_news_source_articles(source,50)->'rows')=5,'Second article page';
 row_data:=public.admin_news_source_create_publisher('New Publisher','https://new-publisher.example');
 assert row_data->>'status'='draft' and row_data->'roles' @> '["publisher"]'::jsonb,'New publishers are drafts';
 begin perform public.admin_news_source_create_publisher('Publisher One',''); raise exception 'Duplicate identity accepted'; exception when unique_violation then null; end;
 begin perform public.admin_news_source_create_publisher('Different Name','https://example.com'); raise exception 'Duplicate domain accepted'; exception when unique_violation then null; end;
 update public.news_sources set organization_id=org where id=source;
end $$;
insert into public.news_sources(name,url) select 'Paginated '||i,'https://pagination.example/'||i from generate_series(1,55) i;
do $$ begin
 assert jsonb_array_length(public.admin_news_sources_browse('Paginated','all',null,false,0)->'rows')=50,'First source page';
 assert jsonb_array_length(public.admin_news_sources_browse('Paginated','all',null,false,50)->'rows')=5,'Second source page';
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","user_role":"moderator"}',true);
do $$
declare s jsonb; target uuid;
begin
 assert (public.admin_news_sources_browse('Paginated')->>'total')::integer=55, 'Moderators retain source reads';
 s:=public.admin_news_sources_browse('Feed One')->'rows'->0;
 s:=public.admin_news_source_save((s->>'id')::uuid,s||jsonb_build_object('name','Moderator feed edit'),(s->>'updated_at')::timestamptz);
 assert s->>'name'='Moderator feed edit','Moderators retain feed edits';
 target:=(s->>'id')::uuid;
 begin perform public.admin_news_source_save(target,s||jsonb_build_object('organization_id','00000000-0000-0000-0000-000000000001'),(s->>'updated_at')::timestamptz); raise exception 'Moderator publisher link accepted'; exception when insufficient_privilege then null; end;
 begin perform public.admin_news_source_publishers(); raise exception 'Moderator publisher access accepted'; exception when insufficient_privilege then null; end;
 begin perform public.admin_news_source_create_publisher('Unauthorized',''); raise exception 'Moderator write accepted'; exception when insufficient_privilege then null; end;
 begin perform public.admin_news_source_delete(target,(s->>'updated_at')::timestamptz,54); raise exception 'Stale cascade preview accepted'; exception when serialization_failure then null; end;
 begin update public.news_sources set organization_id=null where id=target; raise exception 'Direct moderator unlink accepted'; exception when insufficient_privilege then null; end;
 begin insert into public.news_sources(name,url,organization_id) select 'Bypass source','https://bypass.example',organization_id from public.news_sources where id=target; raise exception 'Direct moderator linking accepted'; exception when insufficient_privilege then null; end;
 update public.news_sources set name='Direct moderator feed edit' where id=target;
 assert (select name='Direct moderator feed edit' from public.news_sources where id=target),'Direct staff feed edits retained';
 s:=public.admin_news_sources_browse('Direct moderator feed edit')->'rows'->0;
 assert public.admin_news_source_delete(target,(s->>'updated_at')::timestamptz,55)=target,'Staff deletion uses the reviewed count';

end $$;
select set_config('request.jwt.claims','{"role":"authenticated","user_role":"admin"}',true);
select public.admin_news_sources_browse('Paginated','all',null,false,0)->>'total' as admin_total;
do $$ begin
 begin insert into public.news_sources(name,url,organization_id) select 'Invalid publisher','https://wrong-link.example',id from public.organizations where name='Venue One'; raise exception 'Direct nonpublisher link accepted'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ begin
 assert not has_function_privilege('anon','public.admin_news_source_save(uuid,jsonb,timestamptz)','execute'), 'No anonymous writes';
 assert not has_function_privilege('anon','public.admin_news_sources_browse(text,text,uuid,boolean,integer)','execute'), 'No anonymous reads';
end $$;
rollback;
