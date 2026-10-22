-- Disposable 10,000-contact entity recipient capacity contract.
begin;
set local statement_timeout='30s';
insert into auth.users(id,email,email_confirmed_at) select gen_random_uuid(),'directory-capacity-'||g||'@example.com',now() from generate_series(1,10000) g;
insert into public.email_subscribers(email,status,locale,topics,source,consent_version,confirmed_at) select 'directory-capacity-'||g||'@example.com','subscribed','en',array['newsletter'],'disposable_fixture','fixture_only',now() from generate_series(1,10000) g;
insert into public.organizations(name,email) select 'Organisation fixture '||g,'directory-capacity-'||g||'@example.com' from generate_series(1,5000) g;
insert into public.venues(name,email) select 'Venue fixture '||g,'directory-capacity-'||g||'@example.com' from generate_series(1,2500) g;
insert into public.marketplace_merchants(display_name,organization_id) select name,id from public.organizations;
analyze public.email_recipient_user_lookup;
analyze auth.users;
analyze public.email_subscribers;
analyze public.organizations;
analyze public.venues;
analyze public.marketplace_merchants;
-- Production service_role has no direct Auth SELECT.
revoke select on auth.users from service_role;
set local role service_role;
select jsonb_array_length(public.email_recipient_directory('organization')->'recipients') page_size;
select jsonb_array_length(public.email_recipient_directory('user')->'recipients') page_size;
do $$ begin
 assert public.email_segment_preview('{"field":"recipient_kind","op":"eq","value":"vendor"}','newsletter')->>'eligible'='5000';
 assert public.email_segment_preview('{"field":"recipient_kind","op":"eq","value":"user"}','newsletter')->>'eligible'='10000';
 assert (select count(*) from public.email_outbox)=0,'recipient capacity checks queued mail';
end $$;
rollback;
