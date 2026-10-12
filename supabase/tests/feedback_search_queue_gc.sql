BEGIN;
INSERT INTO public.search_reindex_queue(entity_type,entity_id,created_at)
SELECT 'venue',gen_random_uuid(),now()-interval '8 days' FROM generate_series(1,503);
DO $$ DECLARE result jsonb; BEGIN
  result:=public.search_reindex_drain(1);
  IF result->>'skipped'='true' THEN RAISE EXCEPTION 'Drain busy; retry during maintenance window'; END IF;
  IF (result->>'gc')::integer>500 THEN RAISE EXCEPTION 'GC exceeded bounded batch'; END IF;
  IF (result->>'claimed')::integer>1 THEN RAISE EXCEPTION 'Work limit exceeded'; END IF;
END $$;
SELECT 'Search entity lookups and capped GC verified; all fixture work rolled back' result;
ROLLBACK;
