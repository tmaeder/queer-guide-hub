-- Phase 2 — wire the pipeline-extract-fulltext node into the venue + event DAGs.
-- The node fetches each staging row's website/url, recovers cleaned markdown, and
-- stashes it in normalized_data.markdown for the enrich stage to ground the LLM.
-- URL-less rows simply skip, so this is safe even where website coverage is low.
--
-- The node type itself was registered by 20260530120000 (news). Here we only
-- splice an `extract` node between `normalize` and whatever follows it, generically
-- and replay-safe, so we don't have to reproduce each full DAG definition by hand.

CREATE OR REPLACE FUNCTION public._wire_extract_after_normalize(
  p_name text,
  p_target_table text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  d            record;
  v_after      text := 'normalize';
  v_after_node jsonb;
  v_pos        jsonb;
  v_extract    jsonb;
  e            jsonb;
  v_new_edges  jsonb := '[]'::jsonb;
BEGIN
  SELECT id, nodes, edges INTO d FROM public.pipeline_definitions WHERE name = p_name;
  IF NOT FOUND THEN RETURN; END IF;

  -- Replay-safety: bail if an extract node is already wired in.
  IF d.nodes @> '[{"id":"extract"}]'::jsonb THEN RETURN; END IF;

  -- The normalize node must exist to anchor the splice.
  SELECT n INTO v_after_node
    FROM jsonb_array_elements(d.nodes) n
   WHERE n->>'id' = v_after
   LIMIT 1;
  IF v_after_node IS NULL THEN RETURN; END IF;
  v_pos := v_after_node->'position';

  v_extract := jsonb_build_object(
    'id', 'extract',
    'type', 'pipeline-extract-fulltext',
    'data', jsonb_build_object(
      'label', 'Extract Full Text',
      'config', jsonb_build_object('batch_size', 10, 'target_table', p_target_table),
      'nodeTypeSlug', 'pipeline-extract-fulltext'
    ),
    'position', jsonb_build_object(
      'x', COALESCE((v_pos->>'x')::numeric, 0) + 105,
      'y', COALESCE((v_pos->>'y')::numeric, 200)
    )
  );

  -- Repoint every edge leaving normalize so it leaves extract instead, then add
  -- normalize → extract. Preserves topology even if normalize fanned out.
  FOR e IN SELECT * FROM jsonb_array_elements(d.edges) LOOP
    IF e->>'source' = v_after THEN
      v_new_edges := v_new_edges || jsonb_build_array(jsonb_set(e, '{source}', '"extract"'));
    ELSE
      v_new_edges := v_new_edges || jsonb_build_array(e);
    END IF;
  END LOOP;
  v_new_edges := v_new_edges
    || jsonb_build_array(jsonb_build_object('id', 'e_normalize_extract', 'source', v_after, 'target', 'extract'));

  UPDATE public.pipeline_definitions
     SET nodes = d.nodes || jsonb_build_array(v_extract),
         edges = v_new_edges,
         version = version + 1,
         updated_at = now()
   WHERE id = d.id;
END$$;

SELECT public._wire_extract_after_normalize('venue-ingestion-unified', 'venues');
SELECT public._wire_extract_after_normalize('events-ingestion-bulletproof', 'events');

DROP FUNCTION public._wire_extract_after_normalize(text, text);
