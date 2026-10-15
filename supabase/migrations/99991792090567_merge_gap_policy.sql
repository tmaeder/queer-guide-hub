-- Preserve the established merge cores, redirects and relationship undo. Field
-- transfers participate in the SAME transaction through the three audit tables.
CREATE OR REPLACE FUNCTION public.merge_gap_empty(v jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT v IS NULL OR v IN ('null'::jsonb, '""'::jsonb, '[]'::jsonb, '{}'::jsonb)
    OR (jsonb_typeof(v) = 'string' AND btrim(v #>> '{}') = '');
$$;

CREATE OR REPLACE FUNCTION public.merge_gap_fill(existing jsonb, incoming jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE result jsonb := existing; k text; v jsonb; filled jsonb;
BEGIN
  IF jsonb_typeof(incoming) = 'object' AND
     (jsonb_typeof(existing) = 'object' OR public.merge_gap_empty(existing)) THEN
    result := CASE WHEN jsonb_typeof(existing) = 'object' THEN existing ELSE '{}'::jsonb END;
    FOR k, v IN SELECT * FROM jsonb_each(incoming) LOOP
      IF k IN ('__proto__','constructor','prototype') THEN CONTINUE; END IF;
      filled := public.merge_gap_fill(result->k, v);
      IF NOT public.merge_gap_empty(filled) OR result ? k THEN
        result := jsonb_set(result, ARRAY[k], coalesce(filled, 'null'::jsonb));
      END IF;
    END LOOP;
    RETURN CASE WHEN result='{}'::jsonb THEN existing ELSE result END;
  END IF;
  RETURN CASE WHEN public.merge_gap_empty(existing) AND NOT public.merge_gap_empty(incoming)
    THEN incoming ELSE existing END;
END;
$$;

-- Restore only leaves still equal to this merge's contribution. Subsequent
-- editor changes survive, including edits to other keys of the same object.
CREATE OR REPLACE FUNCTION public.merge_gap_restore(current_value jsonb, before_value jsonb, after_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE result jsonb := current_value; k text; v jsonb; restored jsonb;
BEGIN
  IF current_value IS NOT DISTINCT FROM after_value THEN RETURN before_value; END IF;
  IF jsonb_typeof(current_value) = 'object' AND jsonb_typeof(after_value) = 'object' THEN
    FOR k, v IN SELECT * FROM jsonb_each(after_value) LOOP
      IF v IS NOT DISTINCT FROM before_value->k THEN CONTINUE; END IF;
      restored := public.merge_gap_restore(result->k, before_value->k, v);
      IF restored IS NULL THEN result := result - k;
      ELSE result := jsonb_set(result, ARRAY[k], restored); END IF;
    END LOOP;
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_gap_table(entity_type text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE entity_type
    WHEN 'venue' THEN 'venues' WHEN 'city' THEN 'cities'
    WHEN 'event' THEN 'events' WHEN 'news' THEN 'news_articles'
    WHEN 'personality' THEN 'personalities' WHEN 'marketplace' THEN 'marketplace_listings'
    WHEN 'organization' THEN 'organizations' WHEN 'milestone' THEN 'milestones'
    WHEN 'hotel' THEN 'hotels' WHEN 'queer_village' THEN 'queer_villages'
    WHEN 'country' THEN 'countries' WHEN 'group' THEN 'groups' END;
$$;

-- Explicit allowlist. Excludes identity keys, FK pointers, scores, ownership,
-- publication/moderation/lifecycle state, rights, and safety assertions.
CREATE OR REPLACE FUNCTION public.merge_gap_fields(entity_type text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT ARRAY['description','description_i18n','social_links']::text[] || CASE entity_type
    WHEN 'venue' THEN ARRAY['address','postal_code','website','phone','email','hours','images','latitude','longitude','timezone']
    WHEN 'city' THEN ARRAY['image_url','official_website','timezone','latitude','longitude']
    WHEN 'event' THEN ARRAY['website','ticket_url','images','address','postal_code','timezone','latitude','longitude']
    WHEN 'news' THEN ARRAY['excerpt','image_url','image_attribution']
    WHEN 'personality' THEN ARRAY['bio','profession','website_url','wikipedia_url','image_url']
    WHEN 'marketplace' THEN ARRAY['website','images','image_url','contact_email','contact_phone']
    WHEN 'organization' THEN ARRAY['website','phone','email','social','address','postal_code','latitude','longitude','timezone']
    WHEN 'milestone' THEN ARRAY['image_url']
    WHEN 'hotel' THEN ARRAY['website','phone','email','address','images','booking_url','latitude','longitude']
    WHEN 'queer_village' THEN ARRAY['history','website','images','image_url','latitude','longitude']
    WHEN 'country' THEN ARRAY['image_url','timezone']
    WHEN 'group' THEN ARRAY['website','image_url'] ELSE ARRAY[]::text[] END;
$$;

-- Pure planner: also powers previews and incoming-source supplementation.
CREATE OR REPLACE FUNCTION public.merge_gap_patch(entity_type text, survivor jsonb, donor jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE patch jsonb := '{}'::jsonb; k text; filled jsonb; d jsonb := donor;
BEGIN
  IF jsonb_typeof(survivor) <> 'object' OR jsonb_typeof(donor) <> 'object' THEN RETURN patch; END IF;
  IF donor->>'review_status' IN ('rejected','needs_review','pending_review') OR donor->>'verification_status' = 'rejected'
     OR donor->>'safety_gated' = 'true' THEN RETURN patch; END IF;
  -- A pair is atomic, in range, and never spliced onto a partial existing pair.
  IF NOT (public.merge_gap_empty(survivor->'latitude') AND public.merge_gap_empty(survivor->'longitude')
    AND jsonb_typeof(donor->'latitude') = 'number' AND jsonb_typeof(donor->'longitude') = 'number') THEN
    d := d - 'latitude' - 'longitude';
  ELSIF (donor->>'latitude')::numeric NOT BETWEEN -90 AND 90 OR
        (donor->>'longitude')::numeric NOT BETWEEN -180 AND 180 THEN
    d := d - 'latitude' - 'longitude';
  END IF;
  IF NOT public.merge_gap_empty(survivor->'country_id') AND NOT public.merge_gap_empty(donor->'country_id')
    AND survivor->'country_id' <> donor->'country_id' THEN
    d := d - 'latitude' - 'longitude' - 'address' - 'postal_code' - 'timezone';
  END IF;
  FOREACH k IN ARRAY public.merge_gap_fields(entity_type) LOOP
    IF NOT survivor ? k OR NOT d ? k THEN CONTINUE; END IF;
    IF k IN ('website','website_url','wikipedia_url','official_website','ticket_url','booking_url','image_url')
      AND (jsonb_typeof(d->k) <> 'string' OR d->>k !~* '^https?://[^[:space:]/]+') THEN CONTINUE; END IF;
    IF k IN ('email','contact_email') AND (jsonb_typeof(d->k) <> 'string' OR d->>k !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN CONTINUE; END IF;
    IF k IN ('website','website_url') AND donor->>'url_status' IN ('dead','blocked','404','410') THEN CONTINUE; END IF;
    IF k IN ('images','image_url','image_attribution') AND donor->>'image_flagged'='true' THEN CONTINUE; END IF;
    IF k='images' THEN
      IF jsonb_typeof(d->k)<>'array' THEN CONTINUE; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->k) x WHERE jsonb_typeof(x)<>'string' OR x#>>'{}' !~* '^https?://[^[:space:]/]+') THEN CONTINUE; END IF;
    END IF;
    IF k IN ('social','social_links','description_i18n') AND jsonb_typeof(d->k)='object' THEN
      d:=jsonb_set(d,ARRAY[k],coalesce((SELECT jsonb_object_agg(key,value) FROM jsonb_each(d->k)
        WHERE jsonb_typeof(value)='string' AND btrim(value#>>'{}')<>''
        AND (k='description_i18n' OR value#>>'{}' ~* '^https?://[^[:space:]/]+')),'{}'));
    END IF;
    IF k IN ('hours','social','social_links','description_i18n') AND jsonb_typeof(d->k) <> 'object' THEN CONTINUE; END IF;
    IF k NOT IN ('latitude','longitude','images','hours','social','social_links','description_i18n')
      AND jsonb_typeof(d->k) <> 'string' THEN CONTINUE; END IF;
    IF k='image_attribution' AND NOT public.merge_gap_empty(survivor->'image_url')
      AND survivor->'image_url' IS DISTINCT FROM d->'image_url' THEN CONTINUE; END IF;
    filled := public.merge_gap_fill(survivor->k, d->k);
    IF filled IS DISTINCT FROM survivor->k THEN patch := patch || jsonb_build_object(k, filled); END IF;
  END LOOP;
  RETURN patch;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_gap_writable_fields(kind text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT public.merge_gap_fields(kind)||ARRAY['name','title','category','profession','population','region_name','is_capital','is_major_city','is_regional_capital','capital_of_region','lgbt_friendly_rating','birth_date','death_date','birth_place','nationality','start_date','end_date','venue_name','excerpt','author'];
$$;
REVOKE ALL ON FUNCTION public.merge_gap_writable_fields(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.merge_gap_writable_fields(text) TO authenticated,service_role;

-- Invoker helper: callers already run inside authorized, privileged merge cores.
-- jsonb_populate_record preserves native array/numeric/jsonb column types.
CREATE OR REPLACE FUNCTION public.merge_gap_write(target_table text, target_id uuid, patch jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE assignments text; kind text; written int;
BEGIN
  IF target_table NOT IN ('venues','cities','events','news_articles','personalities','marketplace_listings',
    'organizations','milestones','hotels','queer_villages','countries','groups') THEN RAISE EXCEPTION 'unsupported table'; END IF;
  SELECT t INTO kind FROM unnest(ARRAY['venue','city','event','news','personality','marketplace','organization','milestone','hotel','queer_village','country','group']) t
    WHERE public.merge_gap_table(t)=target_table;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(patch) k WHERE NOT k=ANY(public.merge_gap_writable_fields(kind))) THEN
    RAISE EXCEPTION 'protected or unsupported merge field'; END IF;
  SELECT string_agg(format('%I = src.%I', key, key), ', ') INTO assignments FROM jsonb_object_keys(patch) key;
  IF assignments IS NULL THEN RETURN; END IF;
  EXECUTE format('UPDATE public.%I AS t SET %s FROM jsonb_populate_record(NULL::public.%I, $1) src WHERE t.id = $2',
    target_table, assignments, target_table) USING patch, target_id;
  GET DIAGNOSTICS written=ROW_COUNT;
  IF written<>1 THEN RAISE EXCEPTION 'merge field update did not affect the canonical record'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_gap_audit_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE kind text; tab text; survivor jsonb; donor jsonb; patch jsonb; before_values jsonb := '{}'; k text; v jsonb;
BEGIN
  kind := CASE TG_TABLE_NAME WHEN 'venue_merge_audit' THEN 'venue' WHEN 'city_merge_audit' THEN 'city' ELSE NEW.entity_type END;
  tab := public.merge_gap_table(kind);
  IF tab IS NULL THEN RETURN NEW; END IF;
  -- Stable row order also serializes simultaneous field fills of a survivor.
  EXECUTE format('SELECT 1 FROM public.%I WHERE id IN ($1,$2) ORDER BY id FOR UPDATE', tab) USING NEW.keep_id, NEW.drop_id;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',tab) INTO survivor USING NEW.keep_id;
  IF TG_OP = 'INSERT' THEN
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',tab) INTO donor USING NEW.drop_id;
    IF survivor IS NULL OR donor IS NULL OR NEW.keep_id = NEW.drop_id OR
       NOT public.merge_gap_empty(survivor->'duplicate_of_id') OR donor->>'duplicate_of_id' IS DISTINCT FROM NEW.keep_id::text THEN
      RAISE EXCEPTION 'gap fill requires a canonical survivor and its merged donor';
    END IF;
    patch := public.merge_gap_patch(kind, survivor, donor);
    FOR k IN SELECT jsonb_object_keys(patch) LOOP before_values := before_values || jsonb_build_object(k, survivor->k); END LOOP;
    PERFORM public.merge_gap_write(tab, NEW.keep_id, patch);
    NEW.details := coalesce(NEW.details,'{}') || jsonb_build_object('field_transfer', jsonb_build_object(
      'policy',1,'donor_id',NEW.drop_id,'donor_source',coalesce(donor->>'data_source',donor->>'source_type',donor->>'source_name'),
      'donor_provenance',donor->'field_provenance','before',before_values,'after',patch));
  ELSIF OLD.undone_at IS NULL AND NEW.undone_at IS NOT NULL THEN
    patch := '{}';
    FOR k, v IN SELECT * FROM jsonb_each(coalesce(OLD.details#>'{field_transfer,after}','{}')) LOOP
      patch := patch || jsonb_build_object(k,public.merge_gap_restore(survivor->k, OLD.details#>ARRAY['field_transfer','before',k], v));
    END LOOP;
    -- Never undo half of a coordinate pair if either half was subsequently edited.
    IF (OLD.details#>'{field_transfer,after}') ? 'latitude' AND
       (survivor->'latitude' IS DISTINCT FROM OLD.details#>'{field_transfer,after,latitude}' OR
        survivor->'longitude' IS DISTINCT FROM OLD.details#>'{field_transfer,after,longitude}') THEN
      patch := patch - 'latitude' - 'longitude';
    END IF;
    PERFORM public.merge_gap_write(tab, NEW.keep_id, patch);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER merge_gap_fields BEFORE INSERT OR UPDATE OF undone_at ON public.entity_merge_audit
FOR EACH ROW EXECUTE FUNCTION public.merge_gap_audit_trigger();
CREATE TRIGGER merge_gap_fields BEFORE INSERT OR UPDATE OF undone_at ON public.venue_merge_audit
FOR EACH ROW EXECUTE FUNCTION public.merge_gap_audit_trigger();
CREATE TRIGGER merge_gap_fields BEFORE INSERT OR UPDATE OF undone_at ON public.city_merge_audit
FOR EACH ROW EXECUTE FUNCTION public.merge_gap_audit_trigger();

-- Admin preview for both proposed merges and historical donors. This never writes.
CREATE OR REPLACE FUNCTION public.preview_merge_gap_fill(p_type text, p_keep_id uuid, p_drop_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE tab text := public.merge_gap_table(p_type); survivor jsonb; donor jsonb;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' AND NOT EXISTS
    (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE='42501'; END IF;
  IF tab IS NULL OR p_keep_id = p_drop_id THEN RAISE EXCEPTION 'invalid merge pair'; END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',tab) INTO survivor USING p_keep_id;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',tab) INTO donor USING p_drop_id;
  IF survivor IS NULL OR donor IS NULL OR NOT public.merge_gap_empty(survivor->'duplicate_of_id') OR
    (NOT public.merge_gap_empty(donor->'duplicate_of_id') AND donor->>'duplicate_of_id' <> p_keep_id::text) THEN
    RAISE EXCEPTION 'invalid canonical/donor'; END IF;
  RETURN jsonb_build_object('keep_id',p_keep_id,'donor_id',p_drop_id,'patch',public.merge_gap_patch(p_type,survivor,donor),
    'requires_review',true,'donor_source',coalesce(donor->>'data_source',donor->>'source_type',donor->>'source_name'));
END;
$$;

REVOKE ALL ON FUNCTION public.merge_gap_empty(jsonb), public.merge_gap_fill(jsonb,jsonb),
 public.merge_gap_restore(jsonb,jsonb,jsonb), public.merge_gap_table(text), public.merge_gap_fields(text),
 public.merge_gap_patch(text,jsonb,jsonb), public.merge_gap_write(text,uuid,jsonb), public.merge_gap_audit_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_gap_empty(jsonb),public.merge_gap_fill(jsonb,jsonb),public.merge_gap_patch(text,jsonb,jsonb),
 public.merge_gap_fields(text) TO service_role;
REVOKE ALL ON FUNCTION public.preview_merge_gap_fill(text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_merge_gap_fill(text,uuid,uuid) TO authenticated, service_role;

-- Keep the old Import Hub RPC signature while replacing destructive deletion
-- with the same reversible cores used by the duplicate review screens.
CREATE OR REPLACE FUNCTION public.merge_entities(p_entity_type text, p_keep_id uuid, p_remove_id uuid,
 p_merged_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE kind text; tab text; survivor jsonb; donor jsonb; result jsonb; audit_table text;
 selected jsonb := '{}'; prior jsonb; after_values jsonb; k text; v jsonb; count_moved int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE='42501'; END IF;
  kind := CASE p_entity_type WHEN 'venues' THEN 'venue' WHEN 'events' THEN 'event'
    WHEN 'personalities' THEN 'personality' WHEN 'news_articles' THEN 'news'
    WHEN 'cities' THEN 'city' WHEN 'hotels' THEN 'hotel' END;
  tab := public.merge_gap_table(kind);
  IF tab IS NULL OR p_keep_id = p_remove_id THEN RAISE EXCEPTION 'invalid merge type/pair'; END IF;
  IF p_merged_data IS NOT NULL AND jsonb_typeof(p_merged_data) <> 'object' THEN RAISE EXCEPTION 'expected field selections'; END IF;
  EXECUTE format('SELECT 1 FROM public.%I WHERE id IN ($1,$2) ORDER BY id FOR UPDATE',tab) USING p_keep_id,p_remove_id;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',tab) INTO survivor USING p_keep_id;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',tab) INTO donor USING p_remove_id;
  IF survivor IS NULL OR donor IS NULL THEN RAISE EXCEPTION 'record not found'; END IF;
  FOR k,v IN SELECT * FROM jsonb_each(coalesce(p_merged_data,'{}')) LOOP
    -- UI definitions can include absent legacy fields. Only absent nulls are ignored.
    IF NOT survivor ? k AND public.merge_gap_empty(v) THEN CONTINUE; END IF;
    IF v IS NOT DISTINCT FROM survivor->k THEN CONTINUE; END IF;
    IF NOT (k = ANY(public.merge_gap_fields(kind) || ARRAY['name','title','category','profession','population','region_name',
      'is_capital','is_major_city','is_regional_capital','capital_of_region','lgbt_friendly_rating',
      'birth_date','death_date','birth_place','nationality','start_date','end_date','venue_name','excerpt','author'])) THEN
      RAISE EXCEPTION 'field % cannot be changed by merge',k;
    END IF;
    IF NOT survivor ? k OR v IS DISTINCT FROM donor->k THEN RAISE EXCEPTION 'field % must come from one of the records',k; END IF;
    IF public.merge_gap_empty(v) THEN RAISE EXCEPTION 'merge cannot clear field %',k; END IF;
    selected := selected || jsonb_build_object(k,v);
  END LOOP;
  IF selected ? 'latitude' OR selected ? 'longitude' THEN
    IF coalesce(selected->'latitude',survivor->'latitude') IS DISTINCT FROM donor->'latitude' OR
       coalesce(selected->'longitude',survivor->'longitude') IS DISTINCT FROM donor->'longitude' OR
       jsonb_typeof(donor->'latitude') <> 'number' OR jsonb_typeof(donor->'longitude') <> 'number' THEN
      RAISE EXCEPTION 'coordinates must be selected as a pair'; END IF;
    IF (donor->>'latitude')::numeric NOT BETWEEN -90 AND 90 OR (donor->>'longitude')::numeric NOT BETWEEN -180 AND 180 THEN
      RAISE EXCEPTION 'coordinates out of range'; END IF;
  END IF;
  IF kind='venue' THEN result := public.merge_venues(p_keep_id,p_remove_id); audit_table := 'venue_merge_audit';
  ELSIF kind='city' THEN result := public.merge_cities(p_keep_id,p_remove_id); audit_table := 'city_merge_audit';
  ELSE result := public.merge_entities(p_type=>kind,p_keep_id=>p_keep_id,p_drop_id=>p_remove_id); audit_table := 'entity_merge_audit'; END IF;
  IF result->>'audit_id' IS NOT NULL THEN
    EXECUTE format('SELECT details#>''{field_transfer,before}'',details#>''{field_transfer,after}'' FROM public.%I WHERE id=$1',audit_table)
      INTO prior,after_values USING (result->>'audit_id')::uuid;
    FOR k IN SELECT jsonb_object_keys(selected) LOOP
      prior := coalesce(prior,'{}') || jsonb_build_object(k,survivor->k);
    END LOOP;
    PERFORM public.merge_gap_write(tab,p_keep_id,selected);
    EXECUTE format('UPDATE public.%I SET details=jsonb_set(details,''{field_transfer}'',
      details->''field_transfer'' || jsonb_build_object(''before'',$1,''after'',$2,''manual_selection'',$3)) WHERE id=$4',audit_table)
      USING coalesce(prior,'{}'), coalesce(after_values,'{}') || selected, selected, (result->>'audit_id')::uuid;
  END IF;
  SELECT coalesce(sum(value::int),0) INTO count_moved FROM jsonb_each_text(coalesce(result->'reparented','{}'));
  RETURN result || jsonb_build_object('success',true,'entity_type',p_entity_type,'keep_name',coalesce(survivor->>'name',survivor->>'title'),
    'remove_id',p_remove_id,'remove_name',coalesce(donor->>'name',donor->>'title'),'fk_updates',count_moved);
END;
$$;
REVOKE ALL ON FUNCTION public.merge_entities(text,uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.merge_entities(text,uuid,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.merge_gap_value(existing anyelement,incoming anyelement)
RETURNS anyelement LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT CASE WHEN public.merge_gap_empty(to_jsonb(existing)) AND NOT public.merge_gap_empty(to_jsonb(incoming)) THEN incoming ELSE existing END;
$$;
CREATE OR REPLACE FUNCTION public.merge_gap_value(existing jsonb,incoming jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT public.merge_gap_fill(existing,incoming); $$;
REVOKE ALL ON FUNCTION public.merge_gap_value(anyelement,anyelement),public.merge_gap_value(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.merge_gap_value(anyelement,anyelement),public.merge_gap_value(jsonb,jsonb),
 public.merge_gap_empty(jsonb),public.merge_gap_fill(jsonb,jsonb) TO authenticated,service_role;

-- Normalize only descriptive/contact fields, never arbitrary source metadata.
CREATE OR REPLACE FUNCTION public.merge_gap_normalized(kind text,n jsonb,e jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE d jsonb := coalesce(n,'{}'); loc jsonb := coalesce(n->'location','{}'); contacts jsonb := coalesce(n->'contacts','{}');
BEGIN
  d := public.merge_gap_fill(d,jsonb_build_object(
    'description',e->'description','image_url',e->'image_url',
    'address',loc->'address','postal_code',loc->'postal_code','latitude',loc->'lat','longitude',loc->'lng',
    'website',coalesce(contacts->'website',n#>'{metadata,website}'),
    'phone',coalesce(contacts->'phone',n#>'{metadata,phone}'),
    'email',coalesce(contacts->'email',n#>'{metadata,email}')));
  IF kind='personality' THEN d:= public.merge_gap_fill(d,jsonb_build_object('website_url',d->'website')); END IF;
  IF kind='city' THEN d:= public.merge_gap_fill(d,jsonb_build_object('official_website',d->'website')); END IF;
  IF kind='organization' THEN d:= public.merge_gap_fill(d,jsonb_build_object('social',d->'social_links')); END IF;
  IF kind='marketplace' THEN d:=public.merge_gap_fill(d,jsonb_build_object('contact_email',d->'email','contact_phone',d->'phone')); END IF;
  RETURN d;
END;
$$;
CREATE OR REPLACE FUNCTION public.merge_gap_changes(kind text,b jsonb,a jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT jsonb_build_object('policy',1,'before',coalesce(jsonb_object_agg(k,b->k),'{}'::jsonb),
   'after',coalesce(jsonb_object_agg(k,a->k),'{}'::jsonb))
 FROM unnest(public.merge_gap_fields(kind)) k WHERE b->k IS DISTINCT FROM a->k;
$$;
REVOKE ALL ON FUNCTION public.merge_gap_normalized(text,jsonb,jsonb),public.merge_gap_changes(text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.merge_gap_normalized(text,jsonb,jsonb),public.merge_gap_changes(text,jsonb,jsonb),
 public.merge_gap_patch(text,jsonb,jsonb),public.merge_gap_fields(text),public.merge_gap_table(text),public.merge_gap_write(text,uuid,jsonb) TO authenticated,service_role;

-- Update the existing commit functions in place, retaining their validation,
-- matching, source lineage, review gates and transaction boundaries. Only the
-- allowlisted coalesce assignments change; identity/safety/lifecycle do not.
DO $commit_policy$
DECLARE kind text; tab text; fn text; src text; changed text; k text; block text[]; injected text;
BEGIN
  FOREACH kind IN ARRAY ARRAY['venue','event','city','country','marketplace','personality'] LOOP
    tab := public.merge_gap_table(kind);
    fn := CASE kind WHEN 'queer_village' THEN 'commit_village_staging_item' ELSE 'commit_'||kind||'_staging_item' END;
    SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=fn AND pg_get_function_identity_arguments(p.oid) LIKE 'p_staging_id uuid%';
    IF src IS NULL THEN RAISE EXCEPTION 'missing commit function %',fn; END IF;
    changed := src;
    FOREACH k IN ARRAY public.merge_gap_fields(kind) LOOP
      IF k IN ('latitude','longitude') THEN CONTINUE; END IF;
      changed := regexp_replace(changed,
        '(\m'||k||'\s*=\s*)coalesce\(((\w+\.)?'||k||'\s*,\s*v_\w+)\)',
        '\1public.merge_gap_value(\2)', 'gi');
    END LOOP;
    -- Source JSON maps must fill keys, never overwrite populated values.
    changed := regexp_replace(changed,'coalesce\(social_links,\s*''\{\}''::jsonb\)\s*\|\|\s*v_social',
      'public.merge_gap_fill(social_links,v_social)','gi');
    -- Atomic coordinate fill applies to existing paired coalesce assignments.
    changed := regexp_replace(changed,'latitude\s*=\s*coalesce\(((\w+\.)?)latitude,\s*v_lat\)',
      'latitude = CASE WHEN \1latitude IS NULL AND \1longitude IS NULL AND v_lat BETWEEN -90 AND 90 AND v_lng BETWEEN -180 AND 180 THEN v_lat ELSE \1latitude END','gi');
    changed := regexp_replace(changed,'longitude\s*=\s*coalesce\(((\w+\.)?)longitude,\s*v_lng\)',
      'longitude = CASE WHEN \1latitude IS NULL AND \1longitude IS NULL AND v_lat BETWEEN -90 AND 90 AND v_lng BETWEEN -180 AND 180 THEN v_lng ELSE \1longitude END','gi');
    -- Marketplace refreshes price/availability separately. Descriptive fields
    -- obey the same survivor-first policy as all other entity types.
    FOREACH k IN ARRAY public.merge_gap_fields(kind) LOOP
      changed := regexp_replace(changed,
        '(\m'||k||'\s*=\s*)coalesce\((v_\w+)\s*,\s*('||k||')\)',
        '\1public.merge_gap_value(\3,\2)', 'gi');
    END LOOP;
    IF kind='marketplace' THEN
      changed := replace(changed,'images = CASE WHEN array_length(v_images,1) > 0 THEN v_images ELSE images END',
        'images = public.merge_gap_value(images,v_images)');
    END IF;
    IF src LIKE '%INSERT INTO public.ingestion_events%' THEN
      block := regexp_match(changed,'(UPDATE public\.'||tab||'[^;]+WHERE (?:\w+\.)?id\s*=\s*(v_\w+)[^;]*;)','i');
      IF block IS NULL THEN RAISE EXCEPTION 'unrecognized existing-row update in %',fn; END IF;
      changed := regexp_replace(changed,'\mDECLARE\M','DECLARE v_gap_before jsonb; v_gap_after jsonb; v_gap_donor jsonb;','i');
      injected := format('SELECT to_jsonb(t) INTO v_gap_before FROM public.%I t WHERE id=%s FOR UPDATE; ',tab,block[2]) || block[1] ||
        format(' SELECT to_jsonb(t) INTO v_gap_after FROM public.%I t WHERE id=%s;
          SELECT public.merge_gap_normalized(%L,normalized_data,enriched_data) INTO v_gap_donor FROM public.ingestion_staging WHERE id=p_staging_id;
          PERFORM public.merge_gap_write(%L,%s,public.merge_gap_patch(%L,v_gap_after,v_gap_donor));
          SELECT to_jsonb(t) INTO v_gap_after FROM public.%I t WHERE id=%s;',tab,block[2],kind,tab,block[2],kind,tab,block[2]);
      changed := replace(changed,block[1],injected);
      IF kind='marketplace' THEN
        changed := replace(changed,'jsonb_build_object(''listing_id'',','jsonb_build_object(''field_transfer'',public.merge_gap_changes(''marketplace'',v_gap_before,v_gap_after),''listing_id'',');
      ELSE
        changed := replace(changed,'jsonb_build_object(''source_slug'',',format('jsonb_build_object(''field_transfer'',public.merge_gap_changes(%L,v_gap_before,v_gap_after),''source_slug'',',kind));
      END IF;
    END IF;
    IF changed IS DISTINCT FROM src THEN EXECUTE changed; END IF;
  END LOOP;
END;
$commit_policy$;

-- Atomic source-combination write: retain all source rows, provenance and raw
-- payloads. A stale snapshot aborts instead of overwriting a concurrent review.
CREATE OR REPLACE FUNCTION public.combine_staging_source_group(p_ids uuid[],p_primary uuid,p_table text,
 p_expected jsonb,p_normalized jsonb,p_decisions jsonb,p_needs_review boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; canonical_id uuid; n int := 0;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' AND NOT EXISTS
    (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE='42501'; END IF;
  IF coalesce(cardinality(p_ids),0) NOT BETWEEN 1 AND 500 OR NOT p_primary=ANY(p_ids)
    OR p_primary IS NULL OR p_needs_review IS NULL OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_normalized) IS DISTINCT FROM 'object' OR jsonb_typeof(p_decisions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid combination group'; END IF;
  FOR r IN SELECT * FROM public.ingestion_staging WHERE id=ANY(p_ids) ORDER BY id FOR UPDATE LOOP
    IF r.target_table IS DISTINCT FROM p_table OR coalesce(r.disposition,'') NOT IN ('pending','approved') OR r.ai_validation_status IS DISTINCT FROM 'approved'
      OR r.dedup_match_id IS NULL OR coalesce(r.dedup_status,'') NOT IN ('duplicate','merge_candidate')
      OR coalesce(r.review_status,'auto') NOT IN ('auto','approved') THEN
      RAISE EXCEPTION 'source group is no longer eligible' USING ERRCODE='40001'; END IF;
    IF canonical_id IS NOT NULL AND canonical_id<>r.dedup_match_id THEN RAISE EXCEPTION 'different entities'; END IF;
    canonical_id:=r.dedup_match_id;
    IF jsonb_build_object('normalized_data',r.normalized_data,'enriched_data',r.enriched_data,'updated_at',r.updated_at)
      IS DISTINCT FROM p_expected->r.id::text THEN RAISE EXCEPTION 'source group changed' USING ERRCODE='40001'; END IF;
    n:=n+1;
  END LOOP;
  IF n<>cardinality(p_ids) THEN RAISE EXCEPTION 'missing/duplicate source rows'; END IF;
  p_needs_review := p_needs_review OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_decisions) d WHERE d->>'action'='review');
  UPDATE public.ingestion_staging SET
    normalized_data=CASE WHEN id=p_primary THEN p_normalized ELSE normalized_data END,
    review_status=CASE WHEN p_needs_review THEN 'pending_review' ELSE review_status END,
    enriched_data=coalesce(enriched_data,'{}')||jsonb_build_object('source_combination',jsonb_build_object(
      'policy',1,'primary_id',p_primary,'source_staging_ids',p_ids,'decisions',p_decisions,'gated',p_needs_review)),
    updated_at=now()
  WHERE id=ANY(p_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.combine_staging_source_group(uuid[],uuid,text,jsonb,jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.combine_staging_source_group(uuid[],uuid,text,jsonb,jsonb,jsonb,boolean) TO service_role;

-- Bounded, indexed evidence reads: no per-record network requests or AI calls.
CREATE INDEX IF NOT EXISTS ingestion_staging_combination_pending_idx
 ON public.ingestion_staging(target_table,created_at,id) INCLUDE(pipeline_run_id)
 WHERE disposition IN ('pending','approved') AND ai_validation_status='approved'
 AND dedup_status IN ('duplicate','merge_candidate') AND dedup_match_id IS NOT NULL
 AND (review_status IS NULL OR review_status IN ('auto','approved'));
CREATE INDEX IF NOT EXISTS ingestion_staging_combination_history_idx
 ON public.ingestion_staging(target_table,target_record_id,created_at DESC)
 WHERE disposition IN ('inserted','updated','committed','archived') AND ai_validation_status='approved'
 AND (disposition<>'archived' OR (enriched_data->>'consensus_done'='true' AND enriched_data ? 'merged_into' AND target_record_id=dedup_match_id))
 AND (review_status IS NULL OR review_status IN ('auto','approved'));

CREATE OR REPLACE FUNCTION public.load_source_combination_batch(p_table text,p_pipeline_run_id uuid DEFAULT NULL,p_limit int DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pending jsonb; ids uuid[]; canonical jsonb; history jsonb; kind text; fields text[];
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501'; END IF;
 SELECT t INTO kind FROM unnest(ARRAY['venue','event','city','country','personality','marketplace','organization',
   'hotel','queer_village','news','milestone']) t WHERE public.merge_gap_table(t)=p_table;
 IF kind IS NULL THEN RAISE EXCEPTION 'unsupported source combination table'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]'),array_agg(DISTINCT s.dedup_match_id) INTO pending,ids FROM (
   SELECT id,source_name,source_type,normalized_data,enriched_data,dedup_match_id,updated_at,created_at
   FROM public.ingestion_staging WHERE target_table=p_table AND disposition IN ('pending','approved')
   AND ai_validation_status='approved' AND dedup_status IN ('duplicate','merge_candidate') AND dedup_match_id IS NOT NULL
   AND (review_status IS NULL OR review_status IN ('auto','approved'))
   AND (p_pipeline_run_id IS NULL OR pipeline_run_id=p_pipeline_run_id)
   ORDER BY created_at,id LIMIT least(greatest(coalesce(p_limit,100),1),500)
 ) s;
 IF ids IS NULL THEN RETURN jsonb_build_object('pending','[]'::jsonb,'canonical','{}'::jsonb,'history','{}'::jsonb); END IF;
 fields:=public.merge_gap_fields(kind)||ARRAY['id','duplicate_of_id'];
 EXECUTE format('SELECT coalesce(jsonb_object_agg(t.id,(SELECT jsonb_object_agg(k,v) FROM jsonb_each(to_jsonb(t)) e(k,v) WHERE k=ANY($2))),''{}'') FROM public.%I t WHERE id=ANY($1)',p_table)
 INTO canonical USING ids,fields;
 -- LATERAL + the history index limits every entity to 50 observations.
 SELECT coalesce(jsonb_object_agg(entity_id,observations),'{}') INTO history FROM (
   SELECT entity_id,coalesce(jsonb_agg(to_jsonb(h)) FILTER(WHERE h.id IS NOT NULL),'[]') AS observations
   FROM unnest(ids) entity_id LEFT JOIN LATERAL (
     SELECT id,source_name,source_type,normalized_data,created_at FROM public.ingestion_staging
     WHERE target_table=p_table AND target_record_id=entity_id AND disposition IN ('inserted','updated','committed','archived')
     AND ai_validation_status='approved' AND (review_status IS NULL OR review_status IN ('auto','approved'))
     AND (disposition<>'archived' OR (enriched_data->>'consensus_done'='true' AND enriched_data ? 'merged_into' AND target_record_id=dedup_match_id))
     AND created_at>=now()-interval '90 days' ORDER BY created_at DESC LIMIT 50
   ) h ON true GROUP BY entity_id
 ) observations;
 RETURN jsonb_build_object('pending',pending,'canonical',canonical,'history',history);
END;
$$;
CREATE OR REPLACE FUNCTION public.apply_source_combination_batch(p_groups jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE g jsonb; applied int:=0; gated int:=0; stale int:=0;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_groups) IS DISTINCT FROM 'array' OR jsonb_array_length(p_groups)>500 THEN RAISE EXCEPTION 'invalid batch'; END IF;
 FOR g IN SELECT * FROM jsonb_array_elements(p_groups) LOOP
   BEGIN
     PERFORM public.combine_staging_source_group(ARRAY(SELECT v::uuid FROM jsonb_array_elements_text(g->'ids') v),
       (g->>'primary')::uuid,g->>'table',g->'expected',g->'normalized',g->'decisions',(g->>'needs_review')::boolean);
     applied:=applied+1;
     IF (g->>'needs_review')::boolean OR EXISTS(SELECT 1 FROM jsonb_array_elements(g->'decisions') d WHERE d->>'action'='review') THEN gated:=gated+1; END IF;
   EXCEPTION WHEN serialization_failure THEN stale:=stale+1;
   END;
 END LOOP;
 RETURN jsonb_build_object('groups',applied,'gated',gated,'stale',stale);
END;
$$;
REVOKE ALL ON FUNCTION public.load_source_combination_batch(text,uuid,int),public.apply_source_combination_batch(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.load_source_combination_batch(text,uuid,int),public.apply_source_combination_batch(jsonb) TO service_role;

-- News and village commits use batch-local updates instead of the item RPCs.
DO $batch_policy$
DECLARE src text; changed text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='news_commit_staging_batch';
 IF src IS NULL THEN RAISE EXCEPTION 'missing news batch commit'; END IF;
 changed := replace(src,'excerpt = coalesce(nullif(v_excerpt,''''), excerpt)',
   'excerpt = public.merge_gap_value(excerpt,nullif(v_excerpt,''''))');
 changed := replace(changed,'image_url = coalesce(v_image, image_url)','image_url = public.merge_gap_value(image_url,v_image)');
 changed := replace(changed,'image_attribution = coalesce(v_image_attribution, image_attribution)',
   'image_attribution = CASE WHEN public.merge_gap_empty(to_jsonb(image_url)) OR image_url=v_image THEN public.merge_gap_value(image_attribution,v_image_attribution) ELSE image_attribution END');
 changed := replace(changed,'image_hash = coalesce(v_image_hash, image_hash)',
   'image_hash = CASE WHEN public.merge_gap_empty(to_jsonb(image_url)) THEN v_image_hash ELSE image_hash END');
 IF changed=src THEN RAISE EXCEPTION 'unrecognized news update'; END IF;
 changed:=regexp_replace(changed,'\mDECLARE\M','DECLARE v_gap_before jsonb; v_gap_after jsonb;','i');
 changed:=replace(changed,'UPDATE public.news_articles SET',
   'SELECT to_jsonb(t) INTO v_gap_before FROM public.news_articles t WHERE id=v_existing_id FOR UPDATE; UPDATE public.news_articles SET');
 changed:=replace(changed,'v_updated := v_updated + 1;',
   'SELECT to_jsonb(t) INTO v_gap_after FROM public.news_articles t WHERE id=v_target_id; v_updated := v_updated + 1;');
 changed:=replace(changed,'''staging_id'', v_row.id, ''article_id'', v_target_id',
   '''field_transfer'',public.merge_gap_changes(''news'',v_gap_before,v_gap_after),''staging_id'', v_row.id, ''article_id'', v_target_id');
 -- Clear audit snapshots per row so inserts never inherit a prior row's audit.
 changed:=replace(changed,'v_norm :=', 'v_gap_before:=NULL; v_gap_after:=NULL; v_norm :=');
 EXECUTE changed;

 SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='commit_village_staging_batch';
 IF src IS NULL THEN RAISE EXCEPTION 'missing village batch commit'; END IF;
 changed:=regexp_replace(src,'\mDECLARE\M','DECLARE v_gap_before jsonb; v_gap_after jsonb; v_gap_patch jsonb;','i');
 changed:=replace(changed,'''skipped'';', '''skipped''; v_id:=NULL; v_gap_before:=NULL; v_gap_after:=NULL;');
 changed:=replace(changed,'IF v_db_id IS NOT NULL THEN',
   'SELECT to_jsonb(t) INTO v_gap_before FROM public.queer_villages t WHERE (v_db_id IS NOT NULL AND t.id=v_db_id) OR (v_db_id IS NULL AND t.slug=v_slug) FOR UPDATE; IF v_db_id IS NOT NULL THEN');
 changed:=regexp_replace(changed,'latitude\s*=\s*COALESCE\(latitude,\s*v_lat\)',
   'latitude = CASE WHEN latitude IS NULL AND longitude IS NULL AND v_lat BETWEEN -90 AND 90 AND v_lon BETWEEN -180 AND 180 THEN v_lat ELSE latitude END','gi');
 changed:=regexp_replace(changed,'longitude\s*=\s*COALESCE\(longitude,\s*v_lon\)',
   'longitude = CASE WHEN latitude IS NULL AND longitude IS NULL AND v_lat BETWEEN -90 AND 90 AND v_lon BETWEEN -180 AND 180 THEN v_lon ELSE longitude END','gi');
 changed:=replace(changed,'UPDATE ingestion_staging SET'||chr(10)||'        disposition      = ''committed'',',
   'SELECT to_jsonb(t) INTO v_gap_after FROM public.queer_villages t WHERE id=v_id;
    v_gap_patch:=public.merge_gap_patch(''queer_village'',v_gap_after,public.merge_gap_normalized(''queer_village'',r.normalized_data,r.enriched_data));
    PERFORM public.merge_gap_write(''queer_villages'',v_id,v_gap_patch);
    SELECT to_jsonb(t) INTO v_gap_after FROM public.queer_villages t WHERE id=v_id;
    INSERT INTO public.ingestion_events(staging_id,stage,new_status,actor,payload)
    VALUES(r.id,''commit'',v_action,''source-combination'',jsonb_build_object(''field_transfer'',public.merge_gap_changes(''queer_village'',v_gap_before,v_gap_after)));
    UPDATE ingestion_staging SET'||chr(10)||'        disposition      = ''committed'',');
 IF changed NOT LIKE '%v_gap_patch:=public.merge_gap_patch%' THEN RAISE EXCEPTION 'unrecognized village commit'; END IF;
 EXECUTE changed;
END;
$batch_policy$;

-- The legacy commit fallback used INSERT even when dedup had already identified
-- a canonical record (notably organizations/hotels/milestones). Fill that record
-- and checkpoint source lineage atomically instead of creating another duplicate.
CREATE OR REPLACE FUNCTION public.commit_matched_source_gaps(p_staging_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; kind text; survivor jsonb; donor jsonb; patch jsonb; after_values jsonb;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.ingestion_staging WHERE id=p_staging_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'staging row not found'; END IF;
 IF coalesce(r.disposition,'') NOT IN ('pending','approved') OR r.ai_validation_status IS DISTINCT FROM 'approved'
   OR coalesce(r.review_status,'auto') NOT IN ('auto','approved') OR r.dedup_match_id IS NULL THEN
   RETURN jsonb_build_object('action','skipped'); END IF;
 SELECT t INTO kind FROM unnest(ARRAY['venue','event','city','country','personality','marketplace','organization',
   'hotel','queer_village','news','milestone','group']) t WHERE public.merge_gap_table(t)=r.target_table;
 IF kind IS NULL THEN RAISE EXCEPTION 'unsupported matched target'; END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',r.target_table)
 INTO survivor USING r.dedup_match_id;
 IF survivor IS NULL OR NOT public.merge_gap_empty(survivor->'duplicate_of_id') THEN RAISE EXCEPTION 'canonical record unavailable'; END IF;
 donor:=public.merge_gap_normalized(kind,r.normalized_data,r.enriched_data);
 patch:=public.merge_gap_patch(kind,survivor,donor);
 PERFORM public.merge_gap_write(r.target_table,r.dedup_match_id,patch);
 after_values:=survivor||patch;
 UPDATE public.ingestion_staging SET disposition='updated',target_record_id=r.dedup_match_id,
   processed_at=now(),updated_at=now() WHERE id=r.id;
 INSERT INTO public.ingestion_events(staging_id,stage,new_status,actor,payload)
 VALUES(r.id,'commit','updated','pipeline-commit',jsonb_build_object('target_table',r.target_table,'target_id',r.dedup_match_id,
   'source_name',r.source_name,'field_transfer',public.merge_gap_changes(kind,survivor,after_values)));
 RETURN jsonb_build_object('id',r.dedup_match_id,'action','updated');
END;
$$;
REVOKE ALL ON FUNCTION public.commit_matched_source_gaps(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_matched_source_gaps(uuid) TO service_role;

-- Preserve every venue source observation for later gap filling, including
-- fields that the specialized venue consensus schema does not currently model.
CREATE OR REPLACE FUNCTION public.archive_venue_consensus_sources(p_ids uuid[],p_primary uuid,p_venue uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE written int; primary_review text;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501'; END IF;
 IF coalesce(cardinality(p_ids),0)>500 OR p_primary=ANY(p_ids) OR NOT EXISTS
   (SELECT 1 FROM public.ingestion_staging WHERE id=p_primary AND dedup_match_id=p_venue AND target_table='venues' AND enriched_data->>'consensus_done'='true') THEN
   RAISE EXCEPTION 'invalid venue consensus group'; END IF;
 SELECT review_status INTO primary_review FROM public.ingestion_staging WHERE id=p_primary FOR SHARE;
 UPDATE public.ingestion_staging SET disposition='archived',target_record_id=p_venue,
   review_status=CASE WHEN primary_review IN ('pending_review','rejected') THEN 'pending_review' ELSE review_status END,
   enriched_data=coalesce(enriched_data,'{}')||jsonb_build_object('consensus_done',true,'merged_into',p_primary),updated_at=now()
 WHERE id=ANY(p_ids) AND disposition='pending' AND dedup_match_id=p_venue AND target_table='venues';
 GET DIAGNOSTICS written=ROW_COUNT;
 IF written<>cardinality(p_ids) THEN RAISE EXCEPTION 'venue source group changed' USING ERRCODE='40001'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.archive_venue_consensus_sources(uuid[],uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.archive_venue_consensus_sources(uuid[],uuid,uuid) TO service_role;
