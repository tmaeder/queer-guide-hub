-- Regression checks against a database containing the marketplace registry.
-- All temporary failures and feedback changes are rolled back.
BEGIN;
DO $$
DECLARE m uuid; fp text; n int; story uuid; members_before int;
BEGIN
  SELECT id INTO m FROM public.marketplace_merchants WHERE slug='adamssceptre';
  IF m IS NULL THEN RAISE EXCEPTION 'expected regression-test merchant'; END IF;
  IF EXISTS(SELECT 1 FROM public.marketplace_merchants WHERE last_sync_status LIKE 'error:%') THEN
    RAISE EXCEPTION 'run recovery checks when the merchant registry is healthy';
  END IF;
  fp := 'merchant-sync:' || m::text;
  SELECT id INTO story FROM public.feedback_stories WHERE labels @> ARRAY['automatic-merchant-sync']::text[];
  SELECT count(*) INTO members_before FROM public.feedback_story_members WHERE story_id=story;
  SELECT occurrence_count INTO n FROM public.community_submissions WHERE fingerprint=fp AND content_type='api_error';
  UPDATE public.marketplace_merchants SET last_sync_status='error: reporting regression check' WHERE id=m;
  UPDATE public.marketplace_merchants SET last_sync_status='error: reporting regression check' WHERE id=m;
  IF (SELECT occurrence_count FROM public.community_submissions WHERE fingerprint=fp AND content_type='api_error') <> n+2 THEN
    RAISE EXCEPTION 'repeated errors must increase occurrence count';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.feedback_stories WHERE id=story AND status='open') THEN
    RAISE EXCEPTION 'a failure must reopen the visible feedback story';
  END IF;
  IF (SELECT count(*) FROM public.feedback_story_members WHERE story_id=story) <> members_before THEN
    RAISE EXCEPTION 'a repeated merchant failure must not duplicate a story member';
  END IF;
  UPDATE public.marketplace_merchants SET last_sync_status='ok' WHERE id=m;
  IF NOT EXISTS(SELECT 1 FROM public.community_submissions WHERE fingerprint=fp AND feedback_status='done' AND resolution='fixed') THEN
    RAISE EXCEPTION 'verified recovery must resolve the report';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.feedback_stories WHERE id=story AND status='resolved') THEN
    RAISE EXCEPTION 'a healthy registry must resolve the story';
  END IF;
  UPDATE public.marketplace_merchants SET last_sync_status='error: reporting regression check' WHERE id=m;
  IF NOT EXISTS(SELECT 1 FROM public.community_submissions WHERE fingerprint=fp AND feedback_status='new' AND resolved_at IS NULL) THEN
    RAISE EXCEPTION 'recurrence must reopen the report';
  END IF;
END $$;
ROLLBACK;
