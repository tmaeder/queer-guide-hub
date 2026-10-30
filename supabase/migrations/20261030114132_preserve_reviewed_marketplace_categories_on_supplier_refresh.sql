-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261030114132 with no repo file — the signature of
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
do $$ begin if md5(pg_get_functiondef('public.marketplace_listings_derive_taxonomy()'::regprocedure)) <> '2ce889c7c0f3f10c874eb8c82cac5e67' then raise exception 'Taxonomy trigger changed since review; refusing to overwrite concurrent work'; end if; end $$;

CREATE OR REPLACE FUNCTION public.marketplace_listings_derive_taxonomy()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_group text; v_core_group text; manual_assignment boolean := false; v_review_attrs jsonb; v_same_facts boolean;
begin
  if auth.uid() is not null and public.has_any_role_jwt(array['admin','moderator']::public.app_role[]) then
    if TG_OP='INSERT' then manual_assignment := new.subcategory_group is not null or new.subcategory_fine is not null;
    else manual_assignment := new.subcategory_group is distinct from old.subcategory_group
      or new.subcategory_fine is distinct from old.subcategory_fine or old.taxonomy_classifier_version='manual'; end if;
  end if;
  if manual_assignment then
    new.department := public.marketplace_department_for_group(new.subcategory_group);
    new.taxonomy_v3_at := now(); new.taxonomy_version := 4; new.taxonomy_classifier_version := 'manual';
    return new;
  end if;
  -- Reviewed JEV/Codex categories outrank a repeated supplier category label.
  -- A fresh explicit review or admin assignment continues through its normal path.
  if TG_OP='UPDATE'
    and old.taxonomy_classifier_version like 'jev-model-catalogue-%'
    and old.taxonomy_model_status='done'
    and (old.taxonomy_confidence>=0.7
      or old.taxonomy_classifier_version like 'jev-model-catalogue-repair-%'
      or old.taxonomy_classifier_version like 'jev-model-catalogue-final-review-%')
    and coalesce(old.attributes->>'_jev_data_enrichment_needed','false') <> 'true'
    and coalesce(current_setting('app.marketplace_quality_safety_version',true),'') not like 'jev-model-catalogue-%'
  then
    v_same_facts := new.title is not distinct from old.title
      and new.description is not distinct from old.description
      and new.brand is not distinct from old.brand
      and new.attributes->>'product_type' is not distinct from old.attributes->>'product_type';
    if v_same_facts
      and new.subcategory_group is not distinct from old.subcategory_group
      and new.subcategory_fine is not distinct from old.subcategory_fine
      and new.department is not distinct from old.department
      and new.taxonomy_classifier_version is not distinct from old.taxonomy_classifier_version
      and new.taxonomy_model_status is not distinct from old.taxonomy_model_status
    then
      select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_review_attrs
      from jsonb_each(coalesce(old.attributes,'{}'::jsonb)) where left(key,5)='_jev_';
      new.attributes := coalesce(new.attributes,'{}'::jsonb) || v_review_attrs;
      if new.subcategory is distinct from old.subcategory then
        new.attributes := new.attributes || jsonb_build_object('_jev_last_supplier_subcategory',new.subcategory);
      end if;
      -- content_rating is generated, so retain its reviewed input when a
      -- supplier label alone would lower the current protection level.
      if array_position(array['sfw','suggestive','adult','explicit'],public.marketplace_content_rating(new.subcategory,new.title,new.description))
        < array_position(array['sfw','suggestive','adult','explicit'],old.content_rating)
      then new.subcategory := old.subcategory; end if;
      new.taxonomy_v3_at := old.taxonomy_v3_at;
      new.taxonomy_version := old.taxonomy_version;
      new.taxonomy_confidence := old.taxonomy_confidence;
      if old.attributes->>'_jev_catalogue_disposition' in ('administrative_fee','editorial_page','category_page','checkout_line','test_placeholder')
        and old.status <> 'active' and new.status='active'
      then
        new.status := old.status;
        new.archived_reason := old.archived_reason;
        new.archived_at := old.archived_at;
      end if;
      return new;
    elsif not v_same_facts then
      -- Product identity changed: discard the stale review and queue fresh work.
      select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_review_attrs
      from jsonb_each(coalesce(new.attributes,'{}'::jsonb)) where left(key,5)<>'_jev_' or key in ('_jev_original_subcategory','_jev_last_supplier_subcategory');
      new.attributes := v_review_attrs;
      new.taxonomy_model_status := 'pending';
      new.taxonomy_model_attempts := 0;
      new.taxonomy_confidence := 0;
      new.taxonomy_classifier_version := 'stale:jev-reviewed-evidence';
    end if;
  end if;
  if TG_OP='INSERT' or new.subcategory is distinct from old.subcategory or new.title is distinct from old.title
    or new.taxonomy_v3_at is null or (new.taxonomy_version>=4 and old.taxonomy_version<4) then
    v_group := public.marketplace_resolve_taxonomy_group(new.source_type,new.subcategory,new.title,new.attributes);
    v_core_group := public.marketplace_subcategory_group_v3(new.subcategory,new.title);
    new.subcategory_group := v_group;
    new.department := public.marketplace_department_for_group(v_group);
    new.subcategory_fine := case when v_group is distinct from v_core_group then null else public.marketplace_subcategory_fine(new.subcategory,new.title) end;
    new.taxonomy_v3_at := now(); new.taxonomy_version := 4; new.taxonomy_classifier_version := 'marketplace-taxonomy-v4';
  end if;
  return new;
end $function$;;
