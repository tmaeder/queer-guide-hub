-- Run against the migrated schema. Fixtures are temporary; nothing persists.
BEGIN;
CREATE TEMP TABLE editorial_history_fixture
  (LIKE public.editorial_drafts INCLUDING ALL) ON COMMIT DROP;

DO $test$
DECLARE
  v_entity uuid := gen_random_uuid();
  v_first uuid := gen_random_uuid();
  v_second uuid := gen_random_uuid();
  v_status public.editorial_draft_status;
BEGIN
  INSERT INTO editorial_history_fixture(id,entity_type,entity_id,status,draft_hook,reviewer_note)
    VALUES(v_first,'country',v_entity,'rejected','original draft','original rejection'),
          (v_second,'country',v_entity,'pending','replacement draft','replacement review');
  UPDATE editorial_history_fixture SET status='rejected' WHERE id=v_second;
  SET CONSTRAINTS ALL IMMEDIATE;
  IF (SELECT count(*) FROM editorial_history_fixture WHERE status='rejected') <> 2 THEN
    RAISE EXCEPTION 'Repeated rejection did not preserve both drafts';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM editorial_history_fixture WHERE id=v_first
    AND draft_hook='original draft' AND reviewer_note='original rejection'
    AND uniqueness_status IS NULL) THEN
    RAISE EXCEPTION 'Prior rejection history changed';
  END IF;

  FOREACH v_status IN ARRAY ARRAY['pending','approved','published']::public.editorial_draft_status[] LOOP
    INSERT INTO editorial_history_fixture(entity_type,entity_id,status)
      VALUES('country',v_entity,v_status);
    BEGIN
      INSERT INTO editorial_history_fixture(entity_type,entity_id,status)
        VALUES('country',v_entity,v_status);
      RAISE EXCEPTION 'Duplicate % draft was allowed',v_status;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END LOOP;

  -- A status hand-off may temporarily collide before the final state is valid.
  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO editorial_history_fixture(entity_type,entity_id,status,draft_hook)
    VALUES('country',v_entity,'pending','new generation');
  UPDATE editorial_history_fixture SET status='rejected'
    WHERE entity_id=v_entity AND status='pending' AND draft_hook IS NULL;
  SET CONSTRAINTS ALL IMMEDIATE;

  -- Entity type is part of identity; the same UUID in another type is valid.
  INSERT INTO editorial_history_fixture(entity_type,entity_id,status)
    VALUES('city',v_entity,'pending');
  IF (SELECT count(*) FROM editorial_history_fixture WHERE status='rejected') <> 3 THEN
    RAISE EXCEPTION 'Deferred hand-off failed';
  END IF;
END
$test$;
SELECT 'PASS: repeated rejections preserve history; active statuses remain unique and deferred' AS result;
ROLLBACK;
