-- Two-way Twenty CRM sync — INBOUND via the review pipeline.
-- Edits made in Twenty never touch public content directly. They land here as
-- PENDING proposals; an admin approves, and only a whitelisted set of safe editorial
-- fields is applied to the source table (with provenance). This preserves
-- safety-gating, review, and batched search-sync (approvals are manual, not bulk).

create table if not exists public.twenty_inbound_review (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('organization','merchant','contact')),
  entity_id uuid not null,
  external_id text not null,
  twenty_record_id text,
  -- { source_column: { "from": <old>, "to": <new> } } — only whitelisted columns
  changes jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One open proposal per entity — new Twenty edits refresh it.
create unique index if not exists twenty_inbound_review_pending_uniq
  on public.twenty_inbound_review (entity_type, entity_id)
  where status = 'pending';
create index if not exists twenty_inbound_review_status_idx
  on public.twenty_inbound_review (status, created_at desc);

alter table public.twenty_inbound_review enable row level security;

drop policy if exists twenty_inbound_review_admin_all on public.twenty_inbound_review;
create policy twenty_inbound_review_admin_all on public.twenty_inbound_review
  for all to authenticated
  using (public.has_role_jwt('admin'::public.app_role))
  with check (public.has_role_jwt('admin'::public.app_role));

grant select, insert, update on public.twenty_inbound_review to service_role;

-- Per-entity whitelist of columns an approval may write. Anything else is ignored.
create or replace function public.twenty_inbound_allowed_columns(p_entity_type text)
returns text[] language sql immutable as $$
  select case p_entity_type
    when 'organization' then array['name','description','editorial_hook','editorial_long','email','phone','website','logo_url']
    when 'merchant'     then array['display_name']
    when 'contact'      then array['name','category']
    else array[]::text[]
  end;
$$;

-- Apply an approved proposal: writes only whitelisted columns to the source table,
-- stamps provenance on organizations, and marks the row approved. Admin-gated.
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
    when 'contact' then 'contact_submissions' end;

  for v_col in select jsonb_object_keys(v_row.changes) loop
    if v_col = any(v_allowed) then
      v_val := v_row.changes -> v_col ->> 'to';
      execute format('update public.%I set %I = $1 where id = $2', v_target, v_col)
        using v_val, v_row.entity_id;
      v_applied := v_applied || jsonb_build_object(v_col, v_val);
    end if;
  end loop;

  -- provenance (organizations only carries field_provenance)
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

create or replace function public.reject_twenty_inbound_change(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.assert_admin_or_internal();
  update public.twenty_inbound_review
    set status='rejected', reviewed_at=now(),
        reviewed_by = (nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'sub')::uuid
    where id = p_id and status='pending';
  if not found then raise exception 'not a pending review'; end if;
end;
$$;

revoke all on function public.approve_twenty_inbound_change(uuid) from public, anon;
revoke all on function public.reject_twenty_inbound_change(uuid) from public, anon;
grant execute on function public.approve_twenty_inbound_change(uuid) to authenticated, service_role;
grant execute on function public.reject_twenty_inbound_change(uuid) to authenticated, service_role;
grant execute on function public.twenty_inbound_allowed_columns(text) to authenticated, service_role;
