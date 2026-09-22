-- Run after personality_data_quality_contracts:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/personality_data_quality_v2.sql
begin;

do $$
declare
  v_id uuid;
  v_source uuid;
  v_dims jsonb;
  v_visibility text;
  v_attention boolean;
begin
  insert into public.personalities (
    name, slug, description, bio, profession, wikidata_qid, wikidata_status,
    image_url, image_status, lgbti_connection, lgbti_connection_source,
    fields, visibility, review_status, needs_attention, is_adult
  ) values (
    'Quality Contract Fixture', 'quality-contract-fixture',
    repeat('A', 140), repeat('Long biography. ', 20), 'Writer', 'Q42', 'resolved',
    'https://example.test/portrait.jpg', 'needs_review', 'activist', 'fixture-source',
    '["literature"]'::jsonb, 'draft', 'approved', false, false
  ) returning id into v_id;

  -- Unsupported sensitive claims cannot transition to public.
  update public.personalities set visibility='public', seo_indexable=true where id=v_id;
  select visibility, needs_attention into v_visibility, v_attention
  from public.personalities where id=v_id;
  assert v_visibility='draft', format('unsupported claim published: %s',v_visibility);
  assert v_attention, 'failed publication must become actionable';

  insert into public.personality_sources (
    personality_id, source_slug, source_entity_id, source_url, confidence, is_primary
  ) values (
    v_id, 'fixture-source', 'quality-contract-fixture',
    'https://example.test/source', 1, true
  ) returning id into v_source;
  insert into public.personality_claim_sources (
    personality_id, field_name, source_id, confidence, verification_status
  ) values (v_id, 'lgbti_connection', v_source, 1, 'verified');

  update public.personalities
  set needs_attention=false, visibility='public', seo_indexable=true
  where id=v_id;
  select visibility into v_visibility from public.personalities where id=v_id;
  assert v_visibility='public', 'sourced fixture did not publish';

  v_dims := public.compute_personality_quality_dimensions(v_id);
  assert v_dims->>'cohort'='encyclopedia', 'wrong quality cohort';
  assert (v_dims->>'score')::int between 0 and 100, 'score out of range';
  assert jsonb_typeof(v_dims->'hard_failures')='array', 'hard failures not an array';

  -- Placeholder recognition is enforced at the storage boundary.
  update public.personalities
  set image_url='https://example.test/users/default/male.jpg', image_status='pending'
  where id=v_id;
  assert (select image_url is null and image_status='rejected'
          from public.personalities where id=v_id), 'placeholder image survived';

  -- Public read model has one row and canonical arrays, never raw object tags.
  assert (select count(*)=1 from public.personality_public_profiles where id=v_id),
    'public read model missing fixture';
  assert (select jsonb_typeof(to_jsonb(canonical_tags))='array'
          from public.personality_public_profiles where id=v_id),
    'canonical tags not an array';
end $$;

do $$
begin
  begin
    insert into public.personalities (
      name, slug, profession, fields, visibility
    ) values (
      'Invalid Fields Fixture', 'invalid-fields-fixture', 'Writer',
      '[{"parties":["Example"]}]'::jsonb, 'draft'
    );
    raise exception 'object-valued fields were accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.personalities (
      name, slug, profession, wikidata_qid, fields, visibility
    ) values (
      'Invalid QID Fixture', 'invalid-qid-fixture', 'Writer', 'SKIP_fixture',
      '[]'::jsonb, 'draft'
    );
    raise exception 'sentinel Wikidata identifier was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.personalities (
      name, slug, profession, description, bio, fields, visibility
    ) values (
      'Duplicate Summary Fixture', 'duplicate-summary-fixture', 'Writer',
      'The same profile summary.', '  the   same profile summary.  ',
      '[]'::jsonb, 'draft'
    );
    raise exception 'description identical to bio was accepted';
  exception when check_violation then null;
  end;
end $$;

rollback;
