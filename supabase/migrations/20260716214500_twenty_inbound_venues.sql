-- ============================================================
-- Phase 5d — extend the Twenty inbound review pipeline to VENUES.
--
-- Same contract as organizations/personalities (20260715183310 / 20260715184701):
-- Twenty edits land as PENDING proposals, an admin approves, and only the
-- whitelisted safe editorial fields are applied. Never whitelisted: scores,
-- safety flags, geo, relations.
--
-- Provenance: venues do NOT carry a field_provenance jsonb column — they use
-- the venue_field_provenance TABLE (truth-engine consensus layer,
-- 20260528000001). An approval upserts a 'twenty+human' candidate per applied
-- field, marks it winning, and demotes other winners for that field so the
-- consensus layer reflects the human decision.
-- ============================================================

alter table public.twenty_inbound_review drop constraint if exists twenty_inbound_review_entity_type_check;
alter table public.twenty_inbound_review add constraint twenty_inbound_review_entity_type_check
  check (entity_type in ('organization','merchant','contact','personality','user','venue'));

create or replace function public.twenty_inbound_allowed_columns(p_entity_type text)
returns text[] language sql immutable as $$
  select case p_entity_type
    when 'organization' then array['name','description','editorial_hook','editorial_long','email','phone','website','logo_url']
    when 'merchant'     then array['display_name']
    when 'contact'      then array['name','category']
    when 'personality'  then array['name','description','profession','nationality','website_url']
    when 'user'         then array[]::text[]   -- user identity is NOT CRM-writable
    when 'venue'        then array['name','description','email','phone','website','booking_url','accessibility_notes']
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
    when 'user' then 'profiles'
    when 'venue' then 'venues' end;

  for v_col in select jsonb_object_keys(v_row.changes) loop
    if v_col = any(v_allowed) then
      v_val := v_row.changes -> v_col ->> 'to';
      execute format('update public.%I set %I = $1 where id = $2', v_target, v_col)
        using v_val, v_row.entity_id;
      v_applied := v_applied || jsonb_build_object(v_col, v_val);
    end if;
  end loop;

  -- provenance: organizations carry a field_provenance jsonb column
  if v_row.entity_type = 'organization' and v_applied <> '{}'::jsonb then
    update public.organizations o set
      field_provenance = coalesce(o.field_provenance,'{}'::jsonb) ||
        (select jsonb_object_agg(k, jsonb_build_object('source','twenty+human','at', now()))
           from jsonb_object_keys(v_applied) k)
    where o.id = v_row.entity_id;
  end if;

  -- provenance: venues use the venue_field_provenance table (consensus layer).
  -- Upsert a winning 'twenty+human' candidate per applied field and demote
  -- other winners for those fields — a human-reviewed CRM edit beats pipeline
  -- consensus until the next merge re-evaluates.
  if v_row.entity_type = 'venue' and v_applied <> '{}'::jsonb then
    insert into public.venue_field_provenance
      (venue_id, field, value, source, confidence, is_winning, observed_at)
    select v_row.entity_id, k,
           jsonb_build_object('value', v_applied -> k, 'at', now()),
           'twenty+human', 0.95, true, now()
      from jsonb_object_keys(v_applied) k
    on conflict (venue_id, field, source) do update
      set value = excluded.value, confidence = excluded.confidence,
          is_winning = true, observed_at = excluded.observed_at;

    update public.venue_field_provenance p
       set is_winning = false
     where p.venue_id = v_row.entity_id
       and p.is_winning
       and p.source <> 'twenty+human'
       and p.field in (select jsonb_object_keys(v_applied));
  end if;

  update public.twenty_inbound_review
    set status='approved', reviewed_at=now(),
        reviewed_by = (nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'sub')::uuid
    where id = p_id;

  return jsonb_build_object('applied', v_applied, 'entity_type', v_row.entity_type, 'entity_id', v_row.entity_id);
end;
$$;
