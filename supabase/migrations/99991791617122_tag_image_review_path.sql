-- The review path for glossary photography (2026-10-10)
-- ----------------------------------------------------------------------------
-- Tier 1 of `tag-imagery` (Wikidata P18) auto-publishes, because the image is
-- curated on the tag's own entity and the match is therefore structural. Tiers
-- 2 and 3 (Commons keyword search, Pexels/Unsplash) are review-gated, and this
-- file is what makes a human's approval actually land.
--
-- WITHOUT THE REGISTRY ROW, APPROVE RAISES. `approve_entity_review` resolves
-- the field through `review_field_registry` and raises `unsupported review
-- field` when there is no row -- so queueing without registering rebuilds the
-- 40-day `ai_validation_status` failure, where a queue collected human
-- decisions and discarded them. `batchable = false` is the load-bearing column
-- rather than a detail: `approve_entity_review_batch` approves every open row
-- whose registry entry says batchable with nobody reading it, which for an
-- image proposal is the bulk-publish this whole design exists to avoid.
--
-- A NEW APPLY MODE IS NEEDED, and this is the part that is not boilerplate.
-- Every existing scalar mode writes ONE column. `zz_enforce_tag_image_contract`
-- (99991791616269) refuses an image that arrives without its licence,
-- attribution, alt text and source, so a single-column `text` arm CANNOT apply
-- a tag image at all -- it would raise check_violation on the first write. The
-- precedent for a multi-column arm is `geo_latlng`, which writes lat and lng
-- from one payload for exactly the same reason: the two halves are only valid
-- together.
--
-- `_apply_review_value` IS RESTATED FROM THE LIVE DEFINITION, NOT FROM
-- 20260801140000. That file's CASE has eight arms; the live function has nine
-- (`jsonb_shallow_merge` was added later and the CHECK constraint already lists
-- it) and its variable list carries `v_key`, which that file does not. Rebuilt
-- from `pg_get_functiondef` on prod, so the eight arms this file does not care
-- about are byte-equivalent to what is running.
--
-- THE ASSET LINK IS CLAIMED AT APPROVAL, NOT AT PROPOSAL. Doing it at proposal
-- time would let a rejected candidate hold `tag_cover_one_tag_uniq` against
-- every other tag forever. Claiming it here means two tags proposed the same
-- picture is resolved first-approval-wins, and the second reviewer gets a 23505
-- -- which is the correct answer to "this illustration is already on another
-- page", and is the user-visible half of the no-duplicates rule.

-- ── 1. Vocabulary ───────────────────────────────────────────────────────────

alter table public.review_field_registry
  drop constraint if exists review_field_registry_apply_mode_check;
alter table public.review_field_registry
  add constraint review_field_registry_apply_mode_check
  check (apply_mode = any (array[
    'text', 'text_truncated', 'text_required', 'int_clamped',
    'text_array_union', 'jsonb_array_to_text_array', 'geo_latlng',
    'jsonb_shallow_merge', 'tag_image'
  ]));

-- ── 2. The apply arm ────────────────────────────────────────────────────────

create or replace function public._apply_review_value(
  p_reg public.review_field_registry,
  p_entity_id uuid,
  p_proposed jsonb
) returns void
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_extra text := '';
  v_val jsonb;
  v_text text;
  v_key text;
  c text;
begin
  for c in select jsonb_array_elements_text(coalesce(p_reg.apply_args->'touch','[]'::jsonb))
  loop v_extra := v_extra || format(', %I = now()', c); end loop;
  for c in select jsonb_array_elements_text(coalesce(p_reg.apply_args->'set_true','[]'::jsonb))
  loop v_extra := v_extra || format(', %I = true', c); end loop;

  if jsonb_typeof(p_proposed) = 'object' then
    v_val := p_proposed -> p_reg.value_key;
    v_text := p_proposed ->> p_reg.value_key;
  else
    v_val := p_proposed;
    v_text := p_proposed #>> '{}';
  end if;

  case p_reg.apply_mode
  when 'text' then
    execute format('update public.%I set %I = $1 %s where id = $2',
                   p_reg.target_table, p_reg.target_column, v_extra)
      using v_text, p_entity_id;

  when 'text_required' then
    v_text := nullif(btrim(v_text), '');
    if v_text is null then
      raise exception 'proposed value is empty for field %', p_reg.field
        using errcode = '22023';
    end if;
    execute format('update public.%I set %I = $1 %s where id = $2',
                   p_reg.target_table, p_reg.target_column, v_extra)
      using v_text, p_entity_id;

  when 'text_truncated' then
    execute format('update public.%I set %I = left($1, %s) %s where id = $2',
                   p_reg.target_table, p_reg.target_column,
                   (p_reg.apply_args->>'max_len')::int, v_extra)
      using coalesce(v_text, ''), p_entity_id;

  when 'int_clamped' then
    execute format('update public.%I set %I = greatest(%s, least(%s, round($1)::int)) %s where id = $2',
                   p_reg.target_table, p_reg.target_column,
                   (p_reg.apply_args->>'min')::int, (p_reg.apply_args->>'max')::int, v_extra)
      using v_text::numeric, p_entity_id;

  when 'text_array_union' then
    execute format(
      'update public.%I set %I = ('
      ' select array(select distinct unnest('
      ' coalesce(%I, ''{}''::text[]) ||'
      ' coalesce((select array_agg(distinct t.s) from jsonb_array_elements_text($1) t(s)), ''{}''::text[])'
      ' ) order by 1)) %s where id = $2',
      p_reg.target_table, p_reg.target_column, p_reg.target_column, v_extra)
      using coalesce(v_val, p_proposed), p_entity_id;

  when 'jsonb_array_to_text_array' then
    execute format(
      'update public.%I set %I = array(select jsonb_array_elements_text($1)) %s where id = $2',
      p_reg.target_table, p_reg.target_column, v_extra)
      using coalesce(v_val, p_proposed), p_entity_id;

  when 'geo_latlng' then
    execute format(
      'update public.%I set %I = ($1->>''lat'')::numeric, %I = ($1->>''lng'')::numeric %s '
      'where id = $2 and $1->>''lat'' is not null and $1->>''lng'' is not null',
      p_reg.target_table, p_reg.apply_args->>'lat_col',
      p_reg.apply_args->>'lng_col', v_extra)
      using coalesce(v_val, p_proposed), p_entity_id;

  when 'jsonb_shallow_merge' then
    v_key := nullif(btrim(coalesce(p_reg.apply_args->>'merge_key', '')), '');
    v_text := nullif(btrim(v_text), '');
    if v_key is null then
      raise exception 'apply_args.merge_key is required for jsonb_shallow_merge (field %)', p_reg.field
        using errcode = '22023';
    end if;
    if v_text is null then
      raise exception 'proposed value is empty for field %', p_reg.field
        using errcode = '22023';
    end if;
    execute format(
      'update public.%I set %I = coalesce(%I, ''{}''::jsonb) || jsonb_build_object($1::text, $2::text) %s '
      'where id = $3',
      p_reg.target_table, p_reg.target_column, p_reg.target_column, v_extra)
      using v_key, v_text, p_entity_id;

  -- NEW 2026-10-10. Six columns from one payload, because
  -- zz_enforce_tag_image_contract validates them as a set and refuses any
  -- partial image. Column names are fixed by the arm rather than read from
  -- apply_args: the arm is named for this one shape, so parameterising the
  -- names would only let a caller point it somewhere it cannot work.
  when 'tag_image' then
    v_val := coalesce(v_val, p_proposed);
    if nullif(btrim(coalesce(v_val->>'url', '')), '') is null then
      raise exception 'proposed tag image has no url (field %)', p_reg.field
        using errcode = '22023';
    end if;
    execute format(
      'update public.%I set'
      '   image_url = $1->>''url'','
      '   image_alt = $1->>''alt'','
      '   image_source = $1->>''source'','
      '   image_license = $1->>''license'','
      '   image_attribution = $1->>''attribution'','
      '   image_explicit = coalesce(($1->>''explicit'')::boolean, false)'
      '   %s where id = $2',
      p_reg.target_table, v_extra)
      using v_val, p_entity_id;
    -- Claim the picture for this page. A second claim is a 23505 the reviewer
    -- sees, which is the right answer: it already illustrates another entry.
    if nullif(btrim(coalesce(v_val->>'asset_id', '')), '') is not null then
      insert into public.image_asset_links (asset_id, entity_type, entity_id, role)
      values ((v_val->>'asset_id')::uuid, 'tag', p_entity_id, 'cover');
    end if;

  else
    raise exception 'unsupported apply mode: %', p_reg.apply_mode
      using errcode = '22023';
  end case;
end
$function$;

-- ── 3. The compat view ──────────────────────────────────────────────────────
-- `_shared/review-queue-guard.ts` reads a VIEW with an entity-id column, and
-- the read must be scoped to this entity type: `image_url` is already a
-- registry field for `personality`, so reading `entity_review_queue` unscoped
-- would see another entity's rows for the same field name and refuse to queue
-- a tag proposal that nothing is blocking. Shaped exactly like the five
-- existing compat views.
create or replace view public.tag_review_queue as
  select id,
         entity_id as tag_id,
         field,
         proposed_value,
         citations,
         confidence,
         model,
         status,
         reviewer_id,
         reviewer_note,
         created_at,
         reviewed_at,
         entity_type
    from public.entity_review_queue
   where entity_type = 'tag';

-- `entity_review_queue.entity_type` is NOT NULL with no column default, and the
-- other five views each carry this so an insert through the view can omit it.
-- The default lives in pg_attrdef for the VIEW's relation, which
-- information_schema.columns on the BASE table does not show -- worth knowing
-- before concluding a writer is broken.
alter view public.tag_review_queue alter column entity_type set default 'tag';

grant select on public.tag_review_queue to authenticated;
grant select, insert, update on public.tag_review_queue to service_role;

comment on view public.tag_review_queue is
  'Compat view over entity_review_queue scoped to entity_type=''tag'', added '
  '2026-10-10 for the glossary photography review path. Needed because the '
  'field name `image_url` is shared with `personality`, so an unscoped read '
  'would block tag proposals on another entity''s rows.';

-- ── 4. Register the field ───────────────────────────────────────────────────

insert into public.review_field_registry
  (entity_type, field, label, target_table, target_column, apply_mode, batchable, risk_gate, active)
values
  ('tag', 'image_url', 'Glossary photograph', 'unified_tags', null, 'tag_image', false, null, true)
on conflict (entity_type, field) do update
  set label = excluded.label,
      target_table = excluded.target_table,
      target_column = excluded.target_column,
      apply_mode = excluded.apply_mode,
      batchable = excluded.batchable,
      active = excluded.active;

-- `target_column` is null because the arm writes six of them, the same shape
-- `geo_latlng` uses for venue geo.
--
-- `risk_gate` stays null, and that is a decision rather than an omission. The
-- CHECK admits only 'criminalizing_destination', which is about outing risk at
-- a destination and does not describe an explicit photograph. Explicitness is
-- already gated twice: the contract trigger refuses it on a non-adult tag, and
-- the TagFigure band renders it only behind age affirmation. A p_confirm step
-- for explicit imagery would be a third gate and is deliberately not added
-- here -- it needs its own risk_gate vocabulary value.

-- ── 5. Verify ───────────────────────────────────────────────────────────────
-- Drives the WHOLE path -- queue, approve, land, link -- rather than asserting
-- the registry row exists. A registry row that exists and cannot apply is the
-- failure this file is written to prevent, and `select count(*) from
-- review_field_registry` cannot tell the two apart.

do $verify$
declare
  v_tag    uuid;
  v_tag_b  uuid;
  v_asset  uuid;
  v_rid    uuid;
  v_row    public.unified_tags;
  v_raised boolean;
  v_payload jsonb;
begin
  perform set_config('app.actor', 'migration:tag-image-review-path', true);

  -- `approve_entity_review` opens with `if not has_role_jwt('admin') then raise
  -- 42501`, and a migration carries no JWT -- so without this the block fails on
  -- the admin check and never reaches the apply arm it exists to test. Accepting
  -- that 42501 as "the path is guarded" would be vacuous, which is the trap
  -- 61000301100200 recorded. `has_role_jwt` reads `auth.jwt() ->> 'user_role'`,
  -- i.e. `request.jwt.claims`. Transaction-local, so it cannot leak past this
  -- file.
  perform set_config('request.jwt.claims', '{"user_role":"admin"}', true);

  insert into public.unified_tags (name, slug, status, description, publication_role, is_adult)
  values ('ZZ Review Probe A', 'zz-review-probe-a-99991791617122', 'active', 'Probe.', 'article', false)
  returning id into v_tag;
  insert into public.unified_tags (name, slug, status, description, publication_role, is_adult)
  values ('ZZ Review Probe B', 'zz-review-probe-b-99991791617122', 'active', 'Probe.', 'article', false)
  returning id into v_tag_b;

  select id into v_asset from public.image_assets limit 1;

  v_payload := jsonb_build_object(
    'url', 'https://upload.wikimedia.org/wikipedia/commons/5/5c/Leathertools.jpg',
    'alt', 'A set of leather working tools laid on a bench.',
    'source', 'wikimedia',
    'license', 'CC BY-SA 4.0',
    'attribution', 'Scott Bauer, CC BY-SA 4.0, via Wikimedia Commons',
    'explicit', false,
    'asset_id', v_asset);

  -- (a) a proposal can be queued through the compat view, omitting entity_type
  insert into public.tag_review_queue (tag_id, field, proposed_value, confidence, model, status)
  values (v_tag, 'image_url', v_payload, 0.9, 'probe', 'open')
  returning id into v_rid;
  if not exists (select 1 from public.entity_review_queue
                  where id = v_rid and entity_type = 'tag') then
    raise exception 'the view default did not stamp entity_type=tag';
  end if;

  -- (b) approving it lands ALL SIX columns. If the arm wrote only image_url the
  --     contract trigger would have raised, so reaching this assertion at all
  --     is most of the point.
  perform public.approve_entity_review(v_rid, null, false);
  select * into v_row from public.unified_tags where id = v_tag;
  if v_row.image_url is null or v_row.image_license is null or v_row.image_alt is null
     or v_row.image_source is null or v_row.image_attribution is null then
    raise exception 'approval left the image sidecar incomplete: url=% lic=% alt=% src=% attr=%',
      v_row.image_url is not null, v_row.image_license is not null, v_row.image_alt is not null,
      v_row.image_source is not null, v_row.image_attribution is not null;
  end if;

  -- (c) and it claimed the asset for this tag
  if v_asset is not null and not exists (
       select 1 from public.image_asset_links
        where asset_id = v_asset and entity_type = 'tag' and entity_id = v_tag and role = 'cover') then
    raise exception 'approval did not claim the asset link';
  end if;

  -- (d) THE NO-DUPLICATES RULE, end to end: the same picture proposed for a
  --     second tag must fail at approval, not publish quietly.
  if v_asset is not null then
    insert into public.tag_review_queue (tag_id, field, proposed_value, confidence, model, status)
    values (v_tag_b, 'image_url', v_payload, 0.9, 'probe', 'open')
    returning id into v_rid;
    v_raised := false;
    begin
      perform public.approve_entity_review(v_rid, null, false);
    exception when unique_violation then v_raised := true;
    end;
    if not v_raised then
      raise exception
        'a second tag published the same asset -- tag_cover_one_tag_uniq is not '
        'reached through the approval path';
    end if;
  end if;

  -- (e) The registry is the gate, and it bites EARLIER than expected -- worth
  --     recording because it changes where a new field has to be registered.
  --     `erq_validate_field()`, a trigger on entity_review_queue, refuses an
  --     unregistered field at INSERT, so an unregistered producer cannot even
  --     queue, let alone collect a human decision it would discard on approve.
  --     Found by dry-running this block, which first asserted the weaker
  --     approve-time refusal.
  v_raised := false;
  begin
    insert into public.entity_review_queue (entity_type, entity_id, field, proposed_value, status)
    values ('tag', v_tag, 'zz_not_a_field', '{"value":"x"}'::jsonb, 'open');
  exception when others then v_raised := true;
  end;
  if not v_raised then
    raise exception 'entity_review_queue accepted an unregistered field';
  end if;

  delete from public.entity_review_queue where entity_id in (v_tag, v_tag_b);
  delete from public.image_asset_links where entity_type = 'tag' and entity_id in (v_tag, v_tag_b);
  delete from public.unified_tags where id in (v_tag, v_tag_b);

  raise notice 'tag image review path verified end to end';
end
$verify$;
