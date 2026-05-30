-- Loop C verification. Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/personality_loopc.sql
BEGIN;

-- Geo: backfill RPC is callable in dry-run without mutating.
DO $$
DECLARE v_before int; v_after int;
BEGIN
  SELECT count(*) INTO v_before FROM public.personalities WHERE city_id IS NOT NULL;
  PERFORM count(*) FROM public.backfill_personality_geo(50, true);
  SELECT count(*) INTO v_after FROM public.personalities WHERE city_id IS NOT NULL;
  ASSERT v_before = v_after, 'geo dry-run must not mutate city_id';
END $$;

-- Tag SAFETY (hard gate): no personality is assigned a sensitive/NSFW tag.
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.unified_tag_assignments a JOIN public.unified_tags t ON t.id=a.tag_id
  WHERE a.entity_type='personality'
    AND lower(coalesce(t.category,'')) ~
        '(kink|fetish|bdsm|leather|power exchange|roles & dynamics|substance|drug|slang|sex toy|sexual practice|sti|intimate|reproduc)';
  ASSERT v_bad = 0, format('found %s sensitive tag assignments on personalities — forbidden', v_bad);
END $$;

-- Tag mapping table only references safe tags.
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.personality_profession_tags m JOIN public.unified_tags t ON t.id=m.tag_id
  WHERE lower(coalesce(t.category,'')) ~
        '(kink|fetish|bdsm|leather|power exchange|roles & dynamics|substance|drug|slang|sex toy|sexual practice|sti|intimate|reproduc)';
  ASSERT v_bad = 0, format('mapping references %s sensitive tags', v_bad);
END $$;

-- Relationships: no self-edge is allowed (constraint enforced).
DO $$
DECLARE v_id uuid; v_ok boolean := false;
BEGIN
  SELECT id INTO v_id FROM public.personalities LIMIT 1;
  BEGIN
    INSERT INTO public.personality_relationships
      (source_personality_id, target_type, target_personality_id, relationship_type, source)
      VALUES (v_id, 'personality', v_id, 'shared_city', 'test');
    ASSERT false, 'self-edge should have been rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- Graph RPC returns a well-formed {nodes,edges} object.
DO $$
DECLARE g jsonb; v_src uuid;
BEGIN
  SELECT source_personality_id INTO v_src FROM public.personality_relationships LIMIT 1;
  IF v_src IS NOT NULL THEN
    g := public.get_personality_graph_data(v_src, 25);
    ASSERT g ? 'nodes' AND g ? 'edges', 'graph RPC must return nodes and edges keys';
    ASSERT jsonb_array_length(g->'edges') >= 1, 'connected personality must have >=1 edge';
  END IF;
END $$;

ROLLBACK;
