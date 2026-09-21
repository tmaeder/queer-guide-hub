-- Run after 99991790011389_venue_quality_tiered_catalog.sql on a non-production DB:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/venue_quality_tiered_catalog.sql
begin;

do $$
declare
  v_id uuid;
  v_country_id uuid;
  v_asset_id uuid;
  v_snapshot public.venue_quality_snapshots%rowtype;
begin
  select id into v_country_id from public.countries order by id limit 1;
  assert v_country_id is not null, 'fixture requires at least one country';

  update public.venue_quality_rollout set enforcement_enabled = false where singleton;

  insert into public.venues (
    name, slug, description, content_language, address, city, country, country_id,
    latitude, longitude, category, website, url_status, data_source,
    review_status, needs_attention
  ) values (
    'Venue Quality Contract Fixture', 'venue-quality-contract-fixture',
    repeat('Evidence-backed venue description. ', 6), 'en', '1 Test Street',
    'Zürich', 'CH', v_country_id, 47.3769, 8.5417, 'bar',
    'https://example.test/venue', 'ok', null, null, false
  ) returning id into v_id;

  insert into public.venue_sources (
    venue_id, source_slug, source_entity_id, source_url, is_primary, last_seen_at
  ) values (
    v_id, 'quality-contract-fixture', v_id::text,
    'https://example.test/source', true, now()
  );

  insert into public.venue_field_provenance (
    venue_id, field, value, source, confidence, is_winning, observed_at
  ) values (
    v_id, 'description', to_jsonb(repeat('Evidence-backed venue description. ', 6)),
    'quality-contract-fixture', 1, true, now()
  );

  insert into public.image_assets (
    url_hash, url, optimized_url, optimization_status, width, height,
    source, license, attribution, alt_text, status
  ) values (
    'venue-quality-contract-fixture', 'https://example.test/venue.jpg',
    'https://cdn.example.test/venue.jpg', 'optimized', 1200, 800,
    'admin_upload', 'CC-BY-4.0', 'Fixture photographer',
    'Exterior of Venue Quality Contract Fixture', 'active'
  ) returning id into v_asset_id;

  insert into public.image_asset_links (asset_id, entity_type, entity_id, role)
  values (v_asset_id, 'venue', v_id, 'cover');
  assert (select images @> array['https://cdn.example.test/venue.jpg']
          from public.venues where id = v_id),
    'managed image was not mirrored to the legacy venue images projection';

  select * into v_snapshot from public.recompute_venue_quality_snapshot(v_id);
  assert v_snapshot.quality_tier = 'guide_ready',
    format('complete fixture should be guide_ready, got %s (%s)',
      v_snapshot.quality_tier, v_snapshot.blocker_codes);

  -- Verification cannot be a bare boolean; source and evidence are mandatory.
  begin
    update public.venues set verified = true where id = v_id;
    raise exception 'verification without evidence unexpectedly succeeded';
  exception when check_violation then
    null;
  end;

  update public.venues
  set verification_source = 'editor_visit',
      verification_evidence = jsonb_build_object('url', 'https://example.test/evidence'),
      verified = true
  where id = v_id;
  select * into v_snapshot from public.recompute_venue_quality_snapshot(v_id);
  assert v_snapshot.quality_tier = 'verified', 'evidenced verification did not reach verified';
  assert v_snapshot.verified_at is not null, 'verification timestamp was not stored';

  delete from public.venue_sources where venue_id = v_id;
  select * into v_snapshot from public.recompute_venue_quality_snapshot(v_id);
  assert v_snapshot.quality_tier = 'suppressed', 'hard blocker did not suppress venue';
  assert 'no_source' = any(v_snapshot.blocker_codes), 'missing source blocker absent';

  -- Shadow mode preserves legacy eligibility and handles NULL status/source explicitly.
  assert exists(select 1 from public.venue_catalog_public where id = v_id),
    'shadow catalog silently excluded NULL data_source/review_status';

  update public.venue_quality_rollout set enforcement_enabled = true where singleton;
  assert not exists(select 1 from public.venue_catalog_public where id = v_id),
    'enforced catalog exposed a suppressed venue';

  assert public.venue_description_issue('Coming soon') = 'placeholder',
    'placeholder description was not detected';
  assert public.venue_description_issue('This event is a fixture description') = 'wrong_subject',
    'wrong-subject description was not detected';
end;
$$;

rollback;
