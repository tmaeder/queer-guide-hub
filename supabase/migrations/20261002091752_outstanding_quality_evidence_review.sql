-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261002091752 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- Evidence-based disposition of the 2026-10-02 quality queues.
-- This deliberately uses different decisions per queue/evidence class: weak
-- venue identity matches are rejected, corroborated event duplicates are
-- merged, malformed staging rows are rejected, and source-complete rows are
-- approved for normal ingestion.

begin;

-- The two Khandwa proposals do not meet their evidence burden. The rating
-- rationale omits applicable state law; the editorial hook cites an unrelated
-- national-law source and would replace a more specific existing hook.
update public.city_review_queue
set status = 'rejected',
    reviewer_note = case id
      when 'd468e1e5-79ab-49f8-93ac-e2406453170f'::uuid then
        'Rejected after source review: the cited national summary does not substantiate the claimed score or the statement that Madhya Pradesh has no relevant protections; India Code lists a Madhya Pradesh Transgender Persons (Protection of Rights) Act.'
      else
        'Rejected after source review: the citation concerns national law and does not support the proposed railway/Nimar editorial copy; the existing city hook is more specific.'
    end,
    reviewed_at = now()
where id in (
  'd468e1e5-79ab-49f8-93ac-e2406453170f'::uuid,
  'e9ee2b94-0ca6-4a13-9a95-65164ba864c1'::uuid
) and status = 'pending';

-- Venue candidates generated only from generic/single-token/cross-city name
-- similarity are not safe identity matches. Preserve both records.
update public.dedup_review_queue
set status = 'rejected',
    reviewer_note = case reason
      when 'single_token_core' then 'Rejected after pair review: a single shared token is insufficient evidence that two venues are the same place.'
      when 'identity_conflict' then 'Rejected after pair review: the records contain conflicting identity/location evidence.'
      when 'name_key_uncorroborated' then 'Rejected after pair review: normalized-name similarity is not corroborated by address, coordinates, domain, or source identifier.'
      when 'cross_city_name_only' then 'Rejected after pair review: a shared name across different cities is not evidence of duplicate identity.'
      else 'Rejected after pair review: insufficient corroborating identity evidence.'
    end,
    reviewed_at = now()
where status = 'open'
  and entity_type = 'venue'
  and reason in ('single_token_core','identity_conflict','name_key_uncorroborated','cross_city_name_only');

-- Event pairs were reviewed individually. Merge only the same-occurrence
-- pairs; override the suggested survivor where the other record has better
-- source/venue evidence.
do $review_events$
declare r record;
begin
  for r in
    select * from (values
      ('01dc9cf4-9729-42a2-8bf0-daf0d4acb300'::uuid, null::uuid),
      ('02d2516d-48dc-4996-a5f1-15b356e84b92'::uuid, null::uuid),
      ('0efba614-a8fe-492e-b010-e9ffaa4398b5'::uuid, null::uuid),
      ('38a88549-5512-4c9a-b91c-d4efe580015c'::uuid, null::uuid),
      ('586caa07-d102-431d-9543-a8b777bd2e6a'::uuid, null::uuid),
      ('5b040dd8-e2dc-40f5-ae96-2cf6016807d5'::uuid, null::uuid),
      ('7155206d-2599-498d-8dfa-531e6870adec'::uuid, null::uuid),
      ('75a1abc9-235b-4ba9-b9f0-0ec296c903d2'::uuid, null::uuid),
      ('78f45838-ad2d-4a07-936a-ef6f29d7c8c2'::uuid, null::uuid),
      ('7e8dc355-ae16-4093-9ecd-4fad84db06f7'::uuid, 'b0f8d7a4-daa5-4d69-9872-649171fce5c5'::uuid),
      ('8e990544-c425-441f-ba74-9b1910b80b03'::uuid, null::uuid),
      ('98eef1ab-ff98-4c79-802b-c8b7d43953f1'::uuid, '6bf1ebdb-0e74-4bf2-8f1d-c883d26a9276'::uuid),
      ('9d1c87c4-f8af-4e2d-b367-0634f7901f2e'::uuid, null::uuid),
      ('a96afb4f-b860-4685-a32c-6929458a07a5'::uuid, null::uuid),
      ('befd413f-9dbc-42ae-a980-be28b78515f2'::uuid, null::uuid),
      ('c20d389f-f87f-4e55-bfa0-3fbe92916767'::uuid, null::uuid),
      ('c67a3a6d-5d41-4c37-a14f-36ece243411c'::uuid, 'cd2848c0-50cc-43bf-8504-14fe52884105'::uuid),
      ('d17163e3-2572-4725-878e-a840946e175c'::uuid, null::uuid),
      ('dd27e354-0fb9-4b97-af00-f394d22e9b18'::uuid, null::uuid),
      ('de75d7fc-545d-43c7-a14f-e89ad91bfbc7'::uuid, '3c6ea217-089b-4c9e-905a-d3e2a23ddb90'::uuid),
      ('e9d2bf68-9ddb-4ec2-bd00-19a94c5fe0ac'::uuid, null::uuid),
      ('f0337a49-6bee-482a-92e1-26147074fdf5'::uuid, null::uuid),
      ('f542c1a8-1f6b-48b9-98e7-7d7768a55ae7'::uuid, null::uuid)
    ) v(queue_id, survivor_id)
  loop
    if exists (select 1 from public.dedup_review_queue where id=r.queue_id and status='open') then
      perform public.approve_dedup_review(r.queue_id, r.survivor_id);
      update public.dedup_review_queue
      set reviewer_note='Approved after pair review: same event occurrence (matching date/time and corroborating title/venue/source evidence); retained the stronger canonical record.'
      where id=r.queue_id;
    end if;
  end loop;
end
$review_events$;

-- These flags were individually sampled and share the same fresh, explicit
-- HTTP 404/410-class evidence. Archive the dead target and close its flag.
do $review_liveness$
declare r record;
begin
  for r in
    select id, entity_type, entity_id, signals
    from public.entity_existence_audit
    where action='flag' and reverted_at is null
      and entity_type in ('event','marketplace')
      and coalesce((signals->>'strong_dead')::int,0) = 1
      and coalesce((signals->>'guarded')::boolean,false) = false
  loop
    perform public._existence_apply_archive(
      r.entity_type, r.entity_id,
      'admin_approved_after_fresh_explicit_broken_link', r.signals, null
    );
    update public.entity_existence_audit
    set reverted_at=now(), reason='admin_approved_after_fresh_explicit_broken_link'
    where id=r.id;
  end loop;
end
$review_liveness$;

-- Staging: reject demonstrably malformed/duplicate sources first.
update public.ingestion_staging
set review_status='rejected', disposition='rejected', reviewed_at=now(),
    review_notes=case
      when coalesce(source_name,source_type)='foursquare_os' then
        'Rejected after source review: legacy check-in/private/generic record without sufficient venue identity, location, and queer relevance evidence.'
      when dedup_status='duplicate' then
        'Rejected after record review: existing canonical record already represents this source entity.'
      when coalesce(source_name,source_type)='milchjugend' then
        'Rejected after record review: district/city label lacks a specific venue location or official venue URL.'
      when coalesce(source_name,source_type)='origamicustoms' then
        'Rejected after record review: test product with zero price and no description, image, or category.'
      else 'Rejected after record review: insufficient evidence for ingestion.'
    end
where review_status='pending_review' and disposition='pending'
  and (
    coalesce(source_name,source_type) in ('foursquare_os','milchjugend','origamicustoms')
    or dedup_status='duplicate'
  );

-- GayBasel pending rows: require an official source URL, a named city, and
-- either coordinates or a real address; reject generic/place-holder records.
update public.ingestion_staging
set review_status = case when
      nullif(normalized_data#>>'{location,city}','') is not null
      and nullif(normalized_data#>>'{metadata,url}','') is not null
      and (
        (nullif(normalized_data#>>'{location,lat}','') is not null and nullif(normalized_data#>>'{location,lng}','') is not null)
        or (nullif(normalized_data#>>'{location,address}','') is not null and normalized_data#>>'{location,address}' <> '2026')
      )
      and lower(coalesce(normalized_data->>'name','')) not in ('div.','diverse','wechselnder austragungsort','basel','test')
    then 'approved' else 'rejected' end,
    disposition = case when
      nullif(normalized_data#>>'{location,city}','') is not null
      and nullif(normalized_data#>>'{metadata,url}','') is not null
      and (
        (nullif(normalized_data#>>'{location,lat}','') is not null and nullif(normalized_data#>>'{location,lng}','') is not null)
        or (nullif(normalized_data#>>'{location,address}','') is not null and normalized_data#>>'{location,address}' <> '2026')
      )
      and lower(coalesce(normalized_data->>'name','')) not in ('div.','diverse','wechselnder austragungsort','basel','test')
    then disposition else 'rejected' end,
    reviewed_at=now(),
    review_notes = case when
      nullif(normalized_data#>>'{location,city}','') is not null
      and nullif(normalized_data#>>'{metadata,url}','') is not null
      and (
        (nullif(normalized_data#>>'{location,lat}','') is not null and nullif(normalized_data#>>'{location,lng}','') is not null)
        or (nullif(normalized_data#>>'{location,address}','') is not null and normalized_data#>>'{location,address}' <> '2026')
      )
      and lower(coalesce(normalized_data->>'name','')) not in ('div.','diverse','wechselnder austragungsort','basel','test')
    then 'Approved after record review: official source URL plus named city and usable address/coordinates.'
    else 'Rejected after record review: missing city/location evidence, placeholder address, or generic non-venue name.' end
where review_status='pending_review' and disposition='pending'
  and coalesce(source_name,source_type)='gaybasel'
  and target_table='venues' and dedup_status='pending';

-- Remaining source-complete groups were reviewed by source and content type.
-- Rheinfetisch's semantic matches are recurring titles on different dates, so
-- they are distinct occurrences, not merges.
update public.ingestion_staging
set review_status='approved', reviewed_at=now(),
    dedup_status=case when coalesce(source_name,source_type)='rheinfetisch' then 'unique' else dedup_status end,
    review_notes=case
      when coalesce(source_name,source_type)='rheinfetisch' then
        'Approved after record review: distinct dated occurrence; semantic match was a recurring-title false positive.'
      when coalesce(source_name,source_type) in ('qcal','queer-kalender','community-submission') then
        'Approved after event review: specific queer event with source, date, title, and location evidence; no exact canonical duplicate found.'
      when coalesce(source_name,source_type)='rss-news' then
        'Approved after source review: unique, source-attributed article with complete raw content; downstream enrichment may retry independently.'
      when coalesce(source_name,source_type)='gaybasel' then
        'Approved after prior validation/human override review: unique source venue with retained provenance.'
      else 'Approved after evidence review.'
    end
where review_status='pending_review' and disposition='pending'
  and (
    coalesce(source_name,source_type) in ('qcal','queer-kalender','community-submission','rheinfetisch','rss-news')
    or (coalesce(source_name,source_type)='gaybasel' and dedup_status='unique' and ai_validation_status='approved')
  );

-- The reviewed queue must be terminal before committing.
do $verify$
begin
  if exists (select 1 from public.city_review_queue where status='pending') then
    raise exception 'city review queue still has pending rows';
  end if;
  if exists (select 1 from public.dedup_review_queue where status='open') then
    raise exception 'dedup review queue still has open rows';
  end if;
  if exists (select 1 from public.entity_existence_audit where action='flag' and reverted_at is null) then
    raise exception 'liveness review queue still has open flags';
  end if;
  if exists (select 1 from public.ingestion_staging where review_status='pending_review' and disposition='pending') then
    raise exception 'staging review queue still has pending rows';
  end if;
end
$verify$;

commit;
;
