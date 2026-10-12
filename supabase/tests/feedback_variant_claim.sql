BEGIN;
SET LOCAL safeupdate.enabled='on';
DO $$ DECLARE token uuid:=gen_random_uuid(); first_id uuid; next_id uuid; n integer; started timestamptz:=clock_timestamp(); BEGIN
SELECT count(*) INTO n FROM public.marketplace_claim_variant_extract(5,token);
SELECT listing_id INTO first_id FROM private.marketplace_variant_scan_cursor;
IF n>5 OR first_id IS NULL THEN RAISE EXCEPTION 'Bounded claim or cursor failed'; END IF;
IF EXISTS(SELECT 1 FROM public.marketplace_variant_extract_claims c JOIN public.marketplace_listings l ON l.id=c.listing_id WHERE c.claim_token=token AND l.status<>'active') THEN RAISE EXCEPTION 'Inactive listing claimed'; END IF;
PERFORM public.marketplace_claim_variant_extract(5,gen_random_uuid());
SELECT listing_id INTO next_id FROM private.marketplace_variant_scan_cursor;
IF next_id=first_id THEN RAISE EXCEPTION 'Scan cursor did not advance'; END IF;
IF clock_timestamp()-started>interval '8 seconds' THEN RAISE EXCEPTION 'Two claim windows exceeded 8-second budget'; END IF;
END $$; SELECT 'Two bounded claim windows advanced under 8 seconds; fixtures rolled back' result;
ROLLBACK;
