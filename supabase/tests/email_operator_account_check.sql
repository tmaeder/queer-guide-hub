begin;
insert into auth.users(id,email) values('55555555-0000-4000-8000-000000000091','operator-permission-fixture@example.com');
revoke select on auth.users from service_role;
set local role service_role;
do $$ declare actor uuid:='55555555-0000-4000-8000-000000000091'; r jsonb;
begin
 assert not has_table_privilege('service_role','auth.users','SELECT');
 perform public.email_operator_barrier(actor);
 perform public.email_operator_barrier(null);
 r:=public.email_contacts_page(null,false,actor);
 assert jsonb_typeof(r->'contacts')='array','human administrator cannot read contacts';
 begin
  perform public.email_operator_barrier('55555555-0000-4000-8000-000000000092');
  raise exception 'missing account accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.email_disabled_accounts(user_id) values('55555555-0000-4000-8000-000000000091');
set local role service_role;
do $$ begin
 begin
  perform public.email_contacts_page(null,false,'55555555-0000-4000-8000-000000000091');
  raise exception 'disabled account accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 assert not has_function_privilege('anon','public.email_operator_barrier(uuid)','EXECUTE');
 assert not has_function_privilege('authenticated','public.email_operator_barrier(uuid)','EXECUTE');
end $$;
rollback;
