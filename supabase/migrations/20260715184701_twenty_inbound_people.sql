-- Extend the Twenty inbound review pipeline to personalities + users (profiles).
-- Personalities are public figures → safe editorial fields are review-gated write-back.
-- Users: captured for completeness but the whitelist is EMPTY — a user's display
-- name / handle is self-owned identity and must never be rewritten from a CRM.

alter table public.twenty_inbound_review drop constraint if exists twenty_inbound_review_entity_type_check;
alter table public.twenty_inbound_review add constraint twenty_inbound_review_entity_type_check
  check (entity_type in ('organization','merchant','contact','personality','user'));

create or replace function public.twenty_inbound_allowed_columns(p_entity_type text)
returns text[] language sql immutable as $$
  select case p_entity_type
    when 'organization' then array['name','description','editorial_hook','editorial_long','email','phone','website','logo_url']
    when 'merchant'     then array['display_name']
    when 'contact'      then array['name','category']
    when 'personality'  then array['name','description','profession','nationality','website_url']
    when 'user'         then array[]::text[]   -- user identity is NOT CRM-writable
    else array[]::text[]
  end;
$$;

create or replace function public.approve_twenty_inbound_change(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.twenty_inbound_review%rowtype;
  v_allowed text[];
  v_col text;
  v_val text;
  v_applied jsonb := '{}'::jsonb;
  v_target text;
begin
  perform public.assert_admin_or_internal();
  select * into v_row from public.twenty_inbound_review where id = p_id for update;
  if not found then raise exception 'review row not found'; end if;
  if v_row.status <> 'pending' then raise exception 'already %', v_row.status; end if;

  v_allowed := public.twenty_inbound_allowed_columns(v_row.entity_type);
  v_target := case v_row.entity_type
    when 'organization' then 'organizations'
    when 'merchant' then 'marketplace_merchants'
    when 'contact' then 'contact_submissions'
    when 'personality' then 'personalities'
    when 'user' then 'profiles' end;

  for v_col in select jsonb_object_keys(v_row.changes) loop
    if v_col = any(v_allowed) then
      v_val := v_row.changes -> v_col ->> 'to';
      execute format('update public.%I set %I = $1 where id = $2', v_target, v_col)
        using v_val, v_row.entity_id;
      v_applied := v_applied || jsonb_build_object(v_col, v_val);
    end if;
  end loop;

  if v_row.entity_type = 'organization' and v_applied <> '{}'::jsonb then
    update public.organizations o set
      field_provenance = coalesce(o.field_provenance,'{}'::jsonb) ||
        (select jsonb_object_agg(k, jsonb_build_object('source','twenty+human','at', now()))
           from jsonb_object_keys(v_applied) k)
    where o.id = v_row.entity_id;
  end if;

  update public.twenty_inbound_review
    set status='approved', reviewed_at=now(),
        reviewed_by = (nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'sub')::uuid
    where id = p_id;

  return jsonb_build_object('applied', v_applied, 'entity_type', v_row.entity_type, 'entity_id', v_row.entity_id);
end;
$$;
