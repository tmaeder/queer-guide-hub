BEGIN;

-- Match personality_publication_failures (99991790020300): explicitly
-- unavailable is a resolved image state. Pending/missing and rejected images
-- remain blocking; exact-source, consent and other publication guards remain.
CREATE OR REPLACE FUNCTION public.enforce_personality_public_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_failures text[];
begin
  -- Enforce application publication transitions. Existing public rows remain
  -- available for review, and trusted migration fixtures can still be inserted.
  if tg_op='UPDATE' and new.visibility='public'
     and old.visibility is distinct from 'public' then
    v_failures := array_remove(array[
      case when new.duplicate_of_id is not null then 'duplicate' end,
      case when coalesce(new.review_status,'') in ('archived','rejected') then 'inactive' end,
      case when new.wikidata_status='resolved' and new.wikidata_qid is null then 'wikidata_state_mismatch' end,
      case when new.wikidata_qid is not null and new.wikidata_qid !~ '^Q[0-9]+$' then 'invalid_wikidata_qid' end,
      case when new.birth_date is not null and new.death_date is not null and new.birth_date>new.death_date
        then 'birth_after_death' end,
      case when coalesce(new.is_living,false) and new.death_date is not null then 'living_with_death_date' end,
      case when not (
        (new.description is not null and length(btrim(new.description)) between 120 and 240)
        or (new.bio is not null and length(btrim(new.bio))>120)
      ) then 'summary_or_bio_too_thin' end,
      case when new.image_status='rejected' or (
        new.image_status <> 'unavailable'
        and new.image_url is null
        and not exists (
          select 1 from public.image_asset_links l join public.image_assets a on a.id=l.asset_id
          where l.entity_type='personality' and l.entity_id=new.id and l.role='cover'
            and a.status='active' and a.optimization_status in ('optimized','cdn_optimized')
        )
      ) then 'image_unavailable' end,
      case when new.lgbti_connection is not null and new.lgbti_connection not in ('','none_known','unclear')
        and not exists (
          select 1 from public.personality_claim_sources cs
          where cs.personality_id=new.id and cs.field_name in ('lgbti_connection','lgbti_details')
            and cs.verification_status in ('pending','verified')
        ) then 'unsupported_lgbti_claim' end,
      case when new.is_adult
        and coalesce(new.enrichment_status->'promotion'->>'consent_confirmed','false')<>'true'
        then 'adult_consent_required' end,
      case when coalesce(new.enrichment_status->'personhood'->>'verdict','')='non_person'
        then 'non_person' end
    ],null)::text[];
    if cardinality(v_failures)>0 then
      new.visibility := 'draft';
      new.seo_indexable := false;
      new.needs_attention := true;
      new.quality_dimensions := jsonb_set(coalesce(new.quality_dimensions,'{}'::jsonb),
        '{hard_failures}',to_jsonb(v_failures),true);
    end if;
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.enforce_personality_public_gate() FROM PUBLIC, anon, authenticated;

COMMIT;
