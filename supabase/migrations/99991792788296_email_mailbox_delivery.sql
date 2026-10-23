-- Atomically bind requested mailbox mail to its immutable outbox and real receipts.
begin;
alter table public.mailbox_emails drop constraint mailbox_emails_status_check;
alter table public.mailbox_emails add constraint mailbox_emails_status_check check(status in
 ('draft','queued','sending','accepted','deferred','uncertain','delivered','failed','bounced','suppressed','complained'));
create table public.email_mailbox_sends(
 outbox_id uuid primary key references public.email_outbox(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 mailbox_email_id uuid unique references public.mailbox_emails(id) on delete set null,
 sender_address text not null,
 request_hash text not null,
 unique(owner_id,request_id)
);
alter table public.email_mailbox_sends enable row level security;
revoke all on public.email_mailbox_sends from public,anon,authenticated,service_role;
grant select on public.email_mailbox_sends to service_role;
grant usage on schema email_private to service_role;

create function public.email_mailbox_status(p_user uuid,p_request uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare result jsonb;
begin
 if p_user is null then raise exception 'account_required' using errcode='22023'; end if;
 perform public.email_operator_barrier(p_user);
 select jsonb_build_object('outbox_id',o.id,'email_id',s.mailbox_email_id,'status',o.status,'provider_id',o.provider_id)
 into result from public.email_mailbox_sends s join public.email_outbox o on o.id=s.outbox_id
 where s.owner_id=p_user and s.request_id=p_request;
 return result;
end $$;
revoke all on function public.email_mailbox_status(uuid,uuid) from public,anon,authenticated;
grant execute on function public.email_mailbox_status(uuid,uuid) to service_role;

create function email_private.mailbox_prepare(p_user uuid,p_request uuid,p_message jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare sender text; sender_name text; fingerprint text; prior public.email_mailbox_sends; o public.email_outbox;
 parent public.mailbox_emails; copy_id uuid; parent_id uuid; headers jsonb:='{}'; references_value text;
begin
 if p_user is null or p_request is null or jsonb_typeof(p_message) is distinct from 'object'
  or octet_length(p_message::text)>128000 then raise exception 'invalid_message' using errcode='22023'; end if;
 perform public.email_operator_barrier(p_user);
 if exists(select 1 from jsonb_object_keys(p_message) k where k not in ('to','subject','body_html','body_text','in_reply_to_email_id'))
  or jsonb_typeof(p_message->'to') is distinct from 'string' or length(p_message->>'to')>254
  or lower(btrim(p_message->>'to'))!~'^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
  or jsonb_typeof(p_message->'subject') is distinct from 'string' or length(btrim(p_message->>'subject')) not between 1 and 250
  or p_message->>'subject' ~ E'[\r\n]'
  or (p_message?'body_html' and jsonb_typeof(p_message->'body_html')<>'string')
  or (p_message?'body_text' and jsonb_typeof(p_message->'body_text')<>'string') then
  raise exception 'invalid_message' using errcode='22023'; end if;
 fingerprint:=encode(sha256(convert_to(p_message::text,'UTF8')),'hex');
 select * into prior from public.email_mailbox_sends where owner_id=p_user and request_id=p_request;
 if found then
  if prior.request_hash<>fingerprint then raise exception 'mailbox_request_conflict' using errcode='22023'; end if;
  return public.email_mailbox_status(p_user,p_request);
 end if;
 select mailbox_address||'@queer.guide',display_name into sender,sender_name from public.profiles where user_id=p_user;
 if sender is null then raise exception 'mailbox_required' using errcode='22023'; end if;
 if p_message?'in_reply_to_email_id' then
  parent_id:=(p_message->>'in_reply_to_email_id')::uuid;
  select * into parent from public.mailbox_emails where id=parent_id and owner_id=p_user;
  if not found then raise exception 'reply_not_owned' using errcode='42501'; end if;
  -- Inbound/user-controlled headers must not introduce new header lines.
  if parent.message_id_header ~ E'^<[^<>[:space:]]{1,240}>$' then
   select string_agg(x,' ') into references_value from
    (select x from unnest(coalesce(parent.references_header,'{}')||array[parent.message_id_header]) x
     where x ~ E'^<[^<>[:space:]]{1,240}>$' limit 20) valid;
   headers:=jsonb_build_object('In-Reply-To',parent.message_id_header,'References',references_value);
  end if;
 end if;
 select * into o from public.email_enqueue(
  'mailbox:'||encode(sha256(convert_to(p_user::text||':'||p_request::text,'UTF8')),'hex'),
  lower(btrim(p_message->>'to')),
  jsonb_build_object('category','transactional','from',sender,'to',lower(btrim(p_message->>'to')),
   'subject',p_message->>'subject','html',coalesce(p_message->>'body_html',''),
   'text',coalesce(p_message->>'body_text',''),'headers',headers),
  'mailbox_message',now()+interval '24 hours',null);
 insert into public.mailbox_emails(owner_id,direction,from_address,from_name,to_address,subject,body_html,body_text,snippet,
  status,folder,is_read,in_reply_to_email_id,in_reply_to_header,references_header,thread_id)
 values(p_user,'outbound',sender,sender_name,o.recipient_email,p_message->>'subject',p_message->>'body_html',p_message->>'body_text',
  left(coalesce(p_message->>'body_text',''),200),'queued','sent',true,parent_id,headers->>'In-Reply-To',
  case when headers?'References' then string_to_array(headers->>'References',' ') else null end,
  case when parent_id is not null then coalesce(parent.thread_id,parent.id) else null end) returning id into copy_id;
 insert into public.email_mailbox_sends(outbox_id,owner_id,request_id,mailbox_email_id,sender_address,request_hash)
 values(o.id,p_user,p_request,copy_id,sender,fingerprint);
 return public.email_mailbox_status(p_user,p_request);
end $$;
revoke all on function email_private.mailbox_prepare(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function email_private.mailbox_prepare(uuid,uuid,jsonb) to service_role;
create function public.email_mailbox_prepare(p_user uuid,p_request uuid,p_message jsonb)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select email_private.mailbox_prepare(p_user,p_request,p_message);
$$;
revoke all on function public.email_mailbox_prepare(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.email_mailbox_prepare(uuid,uuid,jsonb) to service_role;

-- A sent copy may be organised or deleted, but it cannot forge a receipt or
-- replace the immutable payload. Draft/unlinked legacy behaviour is unchanged.
create function email_private.guard_mailbox_copy()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare canonical public.email_outbox;
begin
 if current_setting('role',true) in ('anon','authenticated') then
  select o.* into canonical from public.email_mailbox_sends s join public.email_outbox o on o.id=s.outbox_id where s.mailbox_email_id=old.id;
  if found then
   if (to_jsonb(new)-array['folder','is_read','is_starred','deleted_at','updated_at','status','resend_id','resend_status']) is distinct from
      (to_jsonb(old)-array['folder','is_read','is_starred','deleted_at','updated_at','status','resend_id','resend_status']) then
    raise exception 'immutable_mailbox_send' using errcode='42501';
   end if;
   -- Definer erasure/receipt triggers may run beneath an authenticated call.
   -- Permit only real canonical transitions, never a caller-invented receipt.
   if row(new.status,new.resend_id,new.resend_status) is distinct from row(old.status,old.resend_id,old.resend_status)
    and row(new.status,new.resend_id,new.resend_status) is distinct from
        row(case when canonical.status='processing' then 'sending' else canonical.status end,canonical.provider_id,canonical.status) then
    raise exception 'immutable_mailbox_receipt' using errcode='42501';
   end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function email_private.guard_mailbox_copy() from public,anon,authenticated,service_role;
create trigger email_guard_mailbox_copy before update on public.mailbox_emails for each row execute function email_private.guard_mailbox_copy();

create function public.email_mailbox_current(p_id uuid)
returns boolean language sql stable security invoker set search_path=pg_catalog as $$
 select exists(select 1 from public.email_mailbox_sends s join public.profiles p on p.user_id=s.owner_id
 where s.outbox_id=p_id and p.mailbox_address||'@queer.guide'=s.sender_address
 and not exists(select 1 from public.email_disabled_accounts d where d.user_id=s.owner_id));
$$;
revoke all on function public.email_mailbox_current(uuid) from public,anon,authenticated;
grant execute on function public.email_mailbox_current(uuid) to service_role;
create function email_private.sync_mailbox_receipt()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 update public.mailbox_emails m set status=case when new.status='processing' then 'sending' else new.status end,
  resend_id=new.provider_id,resend_status=new.status
 from public.email_mailbox_sends s where s.outbox_id=new.id and m.id=s.mailbox_email_id and m.owner_id=s.owner_id;
 return new;
end $$;
revoke all on function email_private.sync_mailbox_receipt() from public,anon,authenticated,service_role;
create trigger email_sync_mailbox_receipt after update of status,provider_id on public.email_outbox
 for each row when(new.template_key='mailbox_message') execute function email_private.sync_mailbox_receipt();

alter function public.email_claim(integer,uuid) rename to email_claim_before_mailbox;
create function public.email_claim(p_limit integer default 10,p_id uuid default null)
returns setof public.email_outbox language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
begin
 update public.email_outbox set status=case when status='queued' then 'suppressed' else 'uncertain' end,
  lease_id=null,leased_until=null,last_error='mailbox_source_changed',updated_at=now()
 where template_key='mailbox_message' and (status='queued' or (status='processing' and leased_until<now()))
 and not public.email_mailbox_current(id);
 return query select * from public.email_claim_before_mailbox(p_limit,p_id);
end $$;
revoke all on function public.email_claim(integer,uuid) from public,anon,authenticated;
grant execute on function public.email_claim(integer,uuid) to service_role;
alter function public.email_dispatch_authorize(uuid,uuid) rename to email_dispatch_before_mailbox;
create function public.email_dispatch_authorize(p_id uuid,p_lease uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare actor uuid;
begin
 if exists(select 1 from public.email_outbox where id=p_id and template_key='mailbox_message') then
  select owner_id into actor from public.email_mailbox_sends where outbox_id=p_id;
  if actor is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,914));
  if not public.email_mailbox_current(p_id) then
   update public.email_outbox set status='uncertain',lease_id=null,leased_until=null,last_error='mailbox_source_changed',updated_at=now()
   where id=p_id and status='processing' and lease_id=p_lease;
   return false;
  end if;
 end if;
 return public.email_dispatch_before_mailbox(p_id,p_lease);
end $$;
revoke all on function public.email_dispatch_authorize(uuid,uuid) from public,anon,authenticated;
grant execute on function public.email_dispatch_authorize(uuid,uuid) to service_role;

create function email_private.erase_mailbox_sends()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare ids uuid[];
begin
 select coalesce(array_agg(outbox_id),'{}'::uuid[]) into ids from public.email_mailbox_sends where owner_id=new.user_id;
 perform pg_advisory_xact_lock(hashtextextended(recipient_email,915)) from public.email_outbox where id=any(ids) order by recipient_email;
 perform pg_advisory_xact_lock(hashtextextended(provider_id,913)) from public.email_outbox where id=any(ids) and provider_id is not null order by provider_id;
 delete from public.email_delivery_events where provider_id in(select provider_id from public.email_outbox where id=any(ids));
 update public.email_outbox set recipient_email='erased:'||id::text,payload='{}',erased_at=now(),status='suppressed',
  last_error='account_erased',lease_id=null,leased_until=null,updated_at=now() where id=any(ids) and erased_at is null;
 delete from public.email_mailbox_sends where owner_id=new.user_id;
 delete from public.mailbox_emails where owner_id=new.user_id;
 return new;
end $$;
revoke all on function email_private.erase_mailbox_sends() from public,anon,authenticated,service_role;
create trigger email_erase_mailbox_sends after insert on public.email_disabled_accounts
 for each row execute function email_private.erase_mailbox_sends();
alter function public.email_export_for_user(uuid) rename to email_export_before_mailbox;
create function public.email_export_for_user(p_user uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 select public.email_export_before_mailbox(p_user)||jsonb_build_object('mailbox_sends',
 coalesce((select jsonb_agg(jsonb_build_object('request_id',s.request_id,'email_id',s.mailbox_email_id,
 'outbox_id',o.id,'status',o.status,'payload',o.payload,'provider_id',o.provider_id) order by o.id)
 from public.email_mailbox_sends s join public.email_outbox o on o.id=s.outbox_id where s.owner_id=p_user and o.erased_at is null),'[]'::jsonb));
$$;
revoke all on function public.email_export_for_user(uuid) from public,anon,authenticated;
grant execute on function public.email_export_for_user(uuid) to service_role;
notify pgrst,'reload schema';
commit;
