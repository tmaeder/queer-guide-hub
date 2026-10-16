-- Marketplace has an inline batch commit, unlike the item-delegating batches.
-- Apply the shared validated gap policy there without changing price refresh,
-- relevance gates, source lineage or per-row transaction boundaries.
DO $marketplace_batch_policy$
DECLARE src text; changed text; update_block text[];
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='commit_marketplace_staging_batch'
   AND p.proargtypes[0]='integer'::regtype AND p.pronargs=2;
 IF src IS NULL THEN RAISE EXCEPTION 'missing marketplace batch commit'; END IF;
 IF src LIKE '%v_gap_batch_before%' THEN RAISE EXCEPTION 'marketplace batch policy already installed'; END IF;
 changed:=regexp_replace(src,'\mDECLARE\M',
   'DECLARE v_gap_batch_before jsonb; v_gap_batch_after jsonb; v_gap_batch_donor jsonb;','i');
 -- Descriptive fields are written only by merge_gap_patch, which validates
 -- incoming values and never replaces populated canonical values.
 changed:=regexp_replace(changed,'description\s*=\s*coalesce\(v_description,\s*description\)', 'description = description','gi');
 changed:=regexp_replace(changed,'website\s*=\s*coalesce\(v_website,\s*website\)', 'website = website','gi');
 changed:=regexp_replace(changed,'images\s*=\s*CASE WHEN array_length\(v_images,1\) > 0 THEN v_images ELSE images END', 'images = images','gi');
 IF changed !~ 'description = description' OR changed !~ 'website = website' OR changed !~ 'images = images' THEN
   RAISE EXCEPTION 'unrecognized marketplace descriptive assignments'; END IF;
 update_block:=regexp_match(changed,'(UPDATE public\.marketplace_listings SET[^;]+WHERE id = v_existing_id[^;]*;)','i');
 IF update_block IS NULL THEN RAISE EXCEPTION 'unrecognized marketplace canonical update'; END IF;
 changed:=replace(changed,update_block[1],
   'SELECT to_jsonb(t) INTO v_gap_batch_before FROM public.marketplace_listings t WHERE id=v_existing_id FOR UPDATE; '
   || update_block[1] || '
   SELECT to_jsonb(t) INTO v_gap_batch_after FROM public.marketplace_listings t WHERE id=v_result_id;
   v_gap_batch_donor:=public.merge_gap_fill(public.merge_gap_normalized(''marketplace'',v_norm,v_enr),
     jsonb_build_object(''description'',v_description,''website'',v_website,''images'',to_jsonb(v_images),''contact_email'',v_email,''contact_phone'',v_phone));
   PERFORM public.merge_gap_write(''marketplace_listings'',v_result_id,
     public.merge_gap_patch(''marketplace'',v_gap_batch_after,v_gap_batch_donor));
   SELECT to_jsonb(t) INTO v_gap_batch_after FROM public.marketplace_listings t WHERE id=v_result_id;');
 changed:=replace(changed,'v_norm :=', 'v_gap_batch_before:=NULL; v_gap_batch_after:=NULL; v_norm :=');
 changed:=replace(changed,
   'jsonb_build_object(''listing_id'', v_result_id, ''action'', v_action, ''price'', v_price)',
   'jsonb_build_object(''listing_id'',v_result_id,''action'',v_action,''price'',v_price,''field_transfer'',public.merge_gap_changes(''marketplace'',v_gap_batch_before,v_gap_batch_after))');
 changed:=replace(changed,
   '(s.dedup_status IN (''unique'',''duplicate'') OR s.dedup_status IS NULL)',
   '(s.dedup_status IN (''unique'',''duplicate'') OR s.dedup_status IS NULL OR (s.dedup_status=''merge_candidate'' AND s.dedup_match_id IS NOT NULL))');
 IF changed NOT LIKE '%''field_transfer''%' OR changed NOT LIKE '%s.dedup_status=''merge_candidate''%' THEN
   RAISE EXCEPTION 'unrecognized marketplace gate or audit'; END IF;
 EXECUTE changed;
END;
$marketplace_batch_policy$;
