-- Restore reviewed identity provenance for Juliana Huxtable after the WHOLE
-- cleanup cleared a valid human QID. Keep the safety gate strict: repair the
-- evidence instead of hiding the profile or weakening the rule.
begin;
set local statement_timeout = '60s';
select set_config('app.actor', 'migration:juliana-huxtable-identity-provenance-repair', true);

do $$
declare
  v_personality_id uuid := 'ffadc72e-b372-4e72-814f-3a9807831f73';
  v_source_id uuid;
  v_guard integer;
  v_release_guard integer;
begin
  if not exists (
    select 1 from public.personalities
    where id = v_personality_id and slug = 'juliana-huxtable'
      and name = 'Juliana Huxtable'
  ) then
    raise exception 'Juliana Huxtable identity precondition failed';
  end if;

  if exists (
    select 1 from public.personalities
    where wikidata_qid = 'Q19880824' and id <> v_personality_id
  ) then
    raise exception 'Q19880824 is already assigned to another personality';
  end if;

  insert into private.personality_remediation_audit
    (batch_key, personality_id, field_name, old_value, new_value, reason)
  select 'juliana-huxtable-identity-provenance-v1', p.id, 'wikidata_identity',
    jsonb_build_object('wikidata_qid', p.wikidata_qid,
                       'wikidata_status', p.wikidata_status),
    jsonb_build_object('wikidata_qid', 'Q19880824',
                       'wikidata_status', 'resolved'),
    'Human identity reviewed against Wikidata Q19880824 and corroborating institutional biographies'
  from public.personalities p where p.id = v_personality_id
  on conflict do nothing;

  insert into private.personality_remediation_audit
    (batch_key, personality_id, field_name, old_value, new_value, reason)
  select 'juliana-huxtable-identity-provenance-v1', v_personality_id,
    'lgbti_connection_claim_sources',
    coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at, c.id)
      from public.personality_claim_sources c
      where c.personality_id = v_personality_id
        and c.field_name in ('lgbti_connection', 'lgbti_details')
    ), '[]'::jsonb),
    jsonb_build_object('field_name', 'lgbti_connection',
                       'wikidata_qid', 'Q19880824',
                       'verification_status', 'verified'),
    'Preserve prior claim links before attaching reviewed identity provenance'
  on conflict do nothing;

  update public.personalities
  set wikidata_qid = 'Q19880824', wikidata_status = 'resolved'
  where id = v_personality_id
    and (wikidata_qid is distinct from 'Q19880824'
      or wikidata_status is distinct from 'resolved');

  select s.id into v_source_id
  from public.personality_sources s
  where s.personality_id = v_personality_id
    and s.source_entity_id = 'Q19880824'
  order by (s.source_slug = 'wikidata') desc, s.first_seen_at
  limit 1;

  if v_source_id is null then
    insert into public.personality_sources (
      personality_id, source_slug, source_entity_id, source_url, raw,
      confidence, is_primary, first_seen_at, last_seen_at
    ) values (
      v_personality_id, 'wikidata-reviewed-2026-09-22', 'Q19880824',
      'https://www.wikidata.org/wiki/Q19880824',
      jsonb_build_object(
        'reviewed_at', '2026-09-22',
        'review_reason', 'identity and sensitive-claim provenance repair',
        'entity_label', 'Juliana Huxtable', 'instance_of', 'Q5',
        'corroborating_urls', jsonb_build_array(
          'https://officialwelcome.art/biography/wrklst-juliana-huxtable-1313/',
          'https://www.vogue.com/article/juliana-huxtable-new-museum-triennial',
          'https://www.studiomuseum.org/artists/juliana-huxtable'
        )),
      1.0, false, now(), now()
    ) returning id into v_source_id;
  else
    update public.personality_sources
    set source_url = 'https://www.wikidata.org/wiki/Q19880824',
        confidence = 1.0, last_seen_at = now(),
        raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
          'reviewed_at', '2026-09-22',
          'review_reason', 'identity and sensitive-claim provenance repair',
          'entity_label', 'Juliana Huxtable', 'instance_of', 'Q5',
          'corroborating_urls', jsonb_build_array(
            'https://officialwelcome.art/biography/wrklst-juliana-huxtable-1313/',
            'https://www.vogue.com/article/juliana-huxtable-new-museum-triennial',
            'https://www.studiomuseum.org/artists/juliana-huxtable'
          ))
    where id = v_source_id;
  end if;

  insert into public.personality_claim_sources (
    personality_id, field_name, source_id, confidence,
    verification_status, checked_at
  ) values (
    v_personality_id, 'lgbti_connection', v_source_id, 1.0, 'verified', now()
  )
  on conflict (personality_id, field_name, source_id) do update set
    confidence = excluded.confidence,
    verification_status = excluded.verification_status,
    checked_at = excluded.checked_at;

  if not exists (
    select 1 from public.personalities
    where id = v_personality_id and wikidata_qid = 'Q19880824'
      and wikidata_status = 'resolved'
  ) then
    raise exception 'Juliana Huxtable Wikidata identity postcondition failed';
  end if;

  if not exists (
    select 1
    from public.personality_claim_sources c
    join public.personality_sources s on s.id = c.source_id
    where c.personality_id = v_personality_id
      and c.field_name = 'lgbti_connection'
      and c.verification_status = 'verified'
      and c.checked_at is not null and c.confidence >= 0.9
      and s.source_entity_id = 'Q19880824'
      and s.source_url = 'https://www.wikidata.org/wiki/Q19880824'
  ) then
    raise exception 'Juliana Huxtable claim provenance postcondition failed';
  end if;

  select coalesce((to_jsonb(g)->>'failing')::integer,
                  (to_jsonb(g)->>'failures')::integer)
  into v_guard
  from public.trust_safety_gate_status() g
  where g.gate = 'person_outing_guard';

  select coalesce((to_jsonb(g)->>'failing')::integer,
                  (to_jsonb(g)->>'failures')::integer)
  into v_release_guard
  from public.release_gate_checks() g
  where g.gate = 'person_outing_guard';

  if coalesce(v_guard, -1) <> 0 or coalesce(v_release_guard, -1) <> 0 then
    raise exception 'person_outing_guard postcondition failed: trust %, release %',
      v_guard, v_release_guard;
  end if;
end $$;

commit;
