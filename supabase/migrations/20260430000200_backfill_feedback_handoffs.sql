-- Backfill existing handoff history into feedback_story_events.
-- Sources:
--   1. feedback_stories.handoffs jsonb array (story-level handoffs)
--   2. community_submissions.data->'handoffs' on members of stories
-- We do not delete the source data — it stays as the "legacy" record.
-- Events get kind='legacy_handoff' so the UI can render them with a tag.

-- 1. Story-level handoffs
INSERT INTO feedback_story_events (story_id, kind, payload, actor_kind, created_at)
SELECT
  s.id,
  'legacy_handoff',
  jsonb_build_object(
    'source', 'feedback_stories.handoffs',
    'target', h->>'target',
    'status', h->>'status',
    'prompt_preview', h->>'prompt_preview',
    'note', h->>'note',
    'by_name', h->>'by_name',
    'legacy_id', h->>'id'
  ),
  'user',
  COALESCE((h->>'at')::timestamptz, s.created_at)
FROM feedback_stories s
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.handoffs, '[]'::jsonb)) AS h
WHERE jsonb_typeof(s.handoffs) = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM feedback_story_events e
     WHERE e.story_id = s.id
       AND e.kind = 'legacy_handoff'
       AND e.payload->>'legacy_id' = h->>'id'
  );

-- 2. Submission-level handoffs (data.handoffs[]) — only for submissions that
-- belong to a story. If a submission belongs to multiple stories (rare but
-- possible) the event is recorded against each so the timeline stays useful.
INSERT INTO feedback_story_events (story_id, kind, payload, actor_kind, created_at)
SELECT
  m.story_id,
  'legacy_handoff',
  jsonb_build_object(
    'source', 'community_submissions.data.handoffs',
    'submission_id', cs.id,
    'target', h->>'target',
    'status', h->>'status',
    'prompt_preview', h->>'prompt_preview',
    'note', h->>'note',
    'by_name', h->>'by_name',
    'legacy_id', h->>'id'
  ),
  'user',
  COALESCE((h->>'at')::timestamptz, cs.submitted_at)
FROM community_submissions cs
JOIN feedback_story_members m ON m.submission_id = cs.id
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(cs.data->'handoffs', '[]'::jsonb)) AS h
WHERE jsonb_typeof(cs.data->'handoffs') = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM feedback_story_events e
     WHERE e.story_id = m.story_id
       AND e.kind = 'legacy_handoff'
       AND e.payload->>'legacy_id' = h->>'id'
       AND e.payload->>'submission_id' = cs.id::text
  );
