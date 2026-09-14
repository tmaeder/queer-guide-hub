-- ============================================================================
-- Approving a tag near-duplicate warning wrote a nonsense row and inflated the
-- counter that decides whether a tag gets deleted.
-- ----------------------------------------------------------------------------
-- MEASURED ON PROD 2026-09-14.
--
-- All 67 pending rows in the inbox's Tags queue are `source='duplicate_warning'`
-- and carry entity_type='tag': entity_id is the flagged tag, tag_id the tag it
-- resembles, and suggested_tag_name is a MESSAGE, not a name --
-- 'Near-duplicate of "Harness" (similarity: 0.73)'.
--
-- approve_tag_suggestions does not create or merge anything. It inserts into
-- unified_tag_assignments(tag_id, entity_id, entity_type) -- it ASSIGNS a tag to
-- an entity. For these rows that means assigning a tag TO A TAG, which
-- unified_tag_assignments was never meant to hold (tag-to-tag relationships live
-- in tag_relations), and then recomputing usage_count to include the junk row.
--
-- NOT LATENT. 41 such rows exist and 185 duplicate warnings were approved this
-- way: 'Swallowing' assigned to 'Swallowing Cum', 'Appetizers' to 'Apetizers',
-- 'Cock & Ball Torture (CBT)' to 'Cock And Ball Torture', and 'Protocol' to
-- 'Protocol'. Each one silently added 1 to a real tag's usage_count.
--
-- APPROVE IS THE WRONG ACTION FOR EVERY ROW IN THE QUEUE, which is why this
-- refuses rather than doing something cleverer. Reading the pending pairs, some
-- are genuine duplicates whose remedy is a MERGE ('Gas Mask'/'Gas Masks',
-- 'Dominance And Submission' with and without '(D/S)') and some are false
-- positives whose remedy is REJECT -- most sharply 'Women Who Have Sex With
-- Women' flagged at 0.79 against 'Men Who Have Sex With Men', which is surface-
-- form similarity between opposite meanings, the 'Sexting/Stretching hits 0.93'
-- problem this repo already records. Approving THAT one would have tagged the
-- WSW glossary entry with MSM.
--
-- The guard is on entity_type, not on source='duplicate_warning'. entity_type is
-- the structural truth -- unified_tag_assignments cannot meaningfully hold a tag
-- as its subject whatever produced the row -- so a future producer emitting the
-- same shape under a different source name is caught too.
--
-- Rejecting still works and remains the way to dismiss a warning. That path
-- writes only tag_suggestions.status and touches no assignment.
--
-- DELIBERATELY NOT DONE HERE, and recorded rather than quietly left:
--
--   The 41 existing junk rows are NOT deleted. The obvious cleanup -- delete
--   them, recompute usage_count truthfully -- drops 28 tags to zero usage, and
--   SIX of those are active with human_reviewed=false: Ball Busting, Cock & Ball
--   Torture (CBT), Epididymis, Femboy/Femboi, Fetnight, Pillow Princess. That is
--   exactly the tuple deprecate_unused_tags() selects, so the truthful cleanup
--   would arm the deletion of six real glossary terms -- and the counter it
--   reads is the MATERIALIZED VIEW tag_usage_summary, not the column, so the
--   exposure only appears after the next refresh. `deprecate_unused_tags` has no
--   cron today (measured: 0 matching jobs), so nothing fires on its own.
--
--   Doing that safely means stamping human_reviewed on the six as the documented
--   escape hatch, and it wants its own change with its own postconditions. Check
--   what consumes a counter before correcting it -- the same rule that stopped
--   nine empty-bodied terms being stamped human_reviewed=false.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.approve_tag_suggestions(
  p_suggestion_ids uuid[],
  p_reviewer_id uuid DEFAULT NULL::uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  approved_count INTEGER := 0;
  suggestion RECORD;
  v_blocked   INTEGER;
BEGIN
  IF NOT has_role_jwt('admin'::app_role) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  -- A tag is not a taggable entity. Refuse loudly rather than writing a row that
  -- looks like an approval and is really a corrupted usage count.
  SELECT count(*) INTO v_blocked
  FROM public.tag_suggestions
  WHERE id = ANY(p_suggestion_ids)
    AND status = 'pending'
    AND entity_type = 'tag';

  IF v_blocked > 0 THEN
    RAISE EXCEPTION
      'cannot approve % tag-on-tag suggestion(s): approving assigns a tag to an entity, and these name a TAG as the entity. A near-duplicate warning is resolved by MERGING the two tags, or by rejecting it to dismiss the warning.',
      v_blocked
      USING ERRCODE = '22023';
  END IF;

  FOR suggestion IN
    SELECT id, entity_id, entity_type, tag_id
    FROM public.tag_suggestions
    WHERE id = ANY(p_suggestion_ids) AND status = 'pending' AND tag_id IS NOT NULL
  LOOP
    INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
    VALUES (suggestion.tag_id, suggestion.entity_id, suggestion.entity_type)
    ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;

    UPDATE public.tag_suggestions
    SET status = CASE WHEN p_reviewer_id IS NULL THEN 'auto_approved' ELSE 'approved' END,
        reviewed_by = p_reviewer_id,
        reviewed_at = now()
    WHERE id = suggestion.id;

    UPDATE public.unified_tags SET usage_count = (
      SELECT COUNT(*) FROM public.unified_tag_assignments WHERE tag_id = suggestion.tag_id
    ) WHERE id = suggestion.tag_id;

    approved_count := approved_count + 1;
  END LOOP;
  RETURN approved_count;
END;
$function$;

-- The inbox renders COALESCE(suggested_tag_name, ...) as the title, and for a
-- duplicate warning that string names only ONE side of the pair -- the reviewer
-- sees what it resembles and not what was flagged. Both ids are on the row, so
-- resolve them: the same half-a-pair defect the dedup queue's '? ⇄ ?' rendering
-- had, one queue over.
CREATE OR REPLACE VIEW public.triage_src_tags AS
 SELECT ts.id,
    'tags'::text AS queue_type,
    COALESCE(ts.entity_type, 'unknown'::text) AS content_type,
    CASE
      WHEN ts.entity_type = 'tag' AND flagged.name IS NOT NULL AND match.name IS NOT NULL
        THEN flagged.name || ' ⇄ ' || match.name
      ELSE COALESCE(ts.suggested_tag_name, ts.suggested_name, 'Tag suggestion'::text)
    END AS title,
    CASE
      WHEN ts.entity_type = 'tag' THEN COALESCE(ts.suggested_tag_name, ts.source)
      ELSE ts.source
    END AS subtitle,
    ts.status,
    ts.confidence AS confidence_score,
    ts.created_at,
    ts.source,
    ts.entity_id,
    ts.entity_type AS entity_table,
    false AS has_diff,
    NULL::uuid AS reporter_id,
    jsonb_build_object(
      'tag_id', ts.tag_id, 'reason', ts.reason, 'ai_model', ts.ai_model,
      'flagged_tag', flagged.name, 'flagged_usage', flagged.usage_count,
      'match_tag', match.name, 'match_usage', match.usage_count
    ) AS meta,
    NULL::text AS flag_type,
    CASE WHEN ts.entity_type = 'tag'
         THEN jsonb_build_object('approve_unsupported', true)
         ELSE '{}'::jsonb END AS risk_flags
   FROM tag_suggestions ts
   LEFT JOIN unified_tags flagged ON flagged.id = ts.entity_id AND ts.entity_type = 'tag'
   LEFT JOIN unified_tags match ON match.id = ts.tag_id AND ts.entity_type = 'tag'
  WHERE ts.status = 'pending'::text;

DO $verify$
DECLARE
  v_title text;
  v_ok    boolean := false;
BEGIN
  -- The guard must refuse, proven by CALLING it. A migration carries no JWT, so
  -- the admin check raises 42501 first and a plain "it raised" assertion would
  -- pass on the wrong exception entirely -- the vacuous class. Claim admin for
  -- the length of this transaction (set_config is_local := true) so the call
  -- reaches the guard, then assert the guard's OWN sqlstate and nothing else.
  PERFORM set_config('request.jwt.claims', '{"user_role":"admin"}', true);
  BEGIN
    PERFORM public.approve_tag_suggestions(
      ARRAY(SELECT id FROM public.tag_suggestions WHERE status='pending' AND entity_type='tag' LIMIT 1));
  EXCEPTION
    WHEN sqlstate '22023' THEN v_ok := true;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'approve_tag_suggestions did not refuse a tag-on-tag suggestion with 22023';
  END IF;

  -- POSITIVE CONTROL. A guard that refuses everything would pass the assertion
  -- above and break every legitimate approval. Verified on prod in a rolled-back
  -- transaction: an ordinary venues suggestion still approves (1 row,
  -- auto_approved) and the tag-on-tag row count stays at 41.
  IF EXISTS (SELECT 1 FROM public.tag_suggestions
              WHERE status = 'pending' AND entity_type <> 'tag') THEN
    BEGIN
      PERFORM public.approve_tag_suggestions(ARRAY[]::uuid[]);
    EXCEPTION WHEN sqlstate '22023' THEN
      RAISE EXCEPTION 'the guard refuses calls that contain no tag-on-tag suggestion';
    END;
  END IF;

  -- The queue row must name BOTH sides of the pair.
  SELECT title INTO v_title FROM public.triage_src_tags
   WHERE entity_table = 'tag' ORDER BY created_at DESC LIMIT 1;
  IF v_title IS NOT NULL AND position(' ⇄ ' in v_title) = 0 THEN
    RAISE EXCEPTION 'triage_src_tags still renders only one side of the pair: %', v_title;
  END IF;

  RAISE NOTICE 'tag duplicate-warning guard installed; sample title: %', coalesce(v_title, '(no rows)');
END $verify$;
