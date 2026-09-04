-- The prose pass comes back on — review-only, and at a fraction of its old rate.
--
-- `20261018094000` disabled it after its first live batch retracted 16 tags and
-- 13 of those were WRONG (correct definitions of soft-limits, outing,
-- deadnaming, anxiety, genital-warts and more), and turned both of its
-- auto-apply paths off: `tag_prose_apply` refuses `p_retract`, and the edge
-- function queues rewrites instead of writing them.
--
-- WHAT CHANGED TO JUSTIFY RE-ENABLING: nothing about the judge. It is still
-- the same model with the same measured unreliability. What changed is that it
-- can no longer act on that unreliability — verified END TO END on prod before
-- this migration, not assumed:
--
--   * the DEPLOYED function was read back and confirmed to contain neither
--     `p_retract: true` nor the `confidence >= 0.8` auto-apply branch;
--   * a 5-tag batch was run live and reported
--     `prose_flagged: 1, prose_queued_rewrite: 4` — the retract/rewrite
--     counters no longer exist;
--   * `tag_change_log` for actor `llm:tag-prose-pass` stayed at 18 rows with
--     its last write still timestamped 16:30, i.e. BEFORE the fix. Zero
--     content writes. The queue grew 759 -> 767 and the cursor advanced 30 ->
--     35.
--
-- The human half is real and was checked rather than assumed: the queue is
-- `ai_suggestions`, surfaced at /admin/search-intelligence -> Suggestions
-- (`SuggestionsTab`, mounted by `AdminSearchIntelligence.tsx`), and approving
-- there PATCHes `search-intelligence/suggestions/:id`, which calls
-- `applySuggestion`, which has a `case 'description'` writing
-- description/short_description. The tab's own copy claims auto-apply covers
-- only tag/synonym/cluster_membership/translation — that copy is STALE, the
-- shared module gained 'description' later.
--
-- RATE: 10/day at 03:30, not the original 25 every two hours (~300/day).
-- Two reasons, both measured. The rewrite arm is only sampled at n=2 and one
-- of those was a downgrade into the register TAG_STYLE_SYSTEM bans (`ghosting`
-- lost "no reply, no explanation, no block" for "refers to the practice of
-- suddenly and without explanation ceasing all communication"). And the queue
-- ALREADY holds 767 pending tag-description suggestions that nobody is
-- working through — a producer that outruns its reviewer converts a review
-- gate into a rubber stamp, which is the same failure as auto-apply wearing a
-- hat. 10/day is a sample a human can actually read, and enough to judge
-- rewrite precision within a week.
--
-- 03:30 is free: the tag crons sit at 03:10 (category resync), 03:15 (quality
-- recompute), 03:45 (assignment reconcile) and 03:55 (category text resync).
--
-- `tag_relation_verify` stays DISABLED. Its broader arm measured ~29% correct
-- and proposed `HIV Transmission -> AIDS`; nothing here re-enables it.

update admin_automations
set enabled = true,
    schedule = '30 3 * * *',
    description = 'tag-enrichment-sweep mode=prose. REVIEW-ONLY: queues rewrites to ai_suggestions and logs wrong-subject verdicts without acting on them. Re-enabled 2026-08-29 at 10/day (was 25 every 2h) — its auto-apply paths were measured wrong 13/16 and the review queue already carries a backlog. Approve at /admin/search-intelligence -> Suggestions.',
    action = jsonb_set(action, '{command}', to_jsonb($cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/tag-enrichment-sweep',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := jsonb_build_object('mode', 'prose', 'batch_limit', 10, 'triggered_by', 'cron'),
    timeout_milliseconds := 55000
  ) as request_id;
  $cmd$::text)),
    updated_at = now()
where slug = 'tag_prose_pass';

do $$ begin
  if exists (select 1 from cron.job where jobname = 'tag_prose_pass') then
    perform cron.unschedule('tag_prose_pass');
  end if;
end $$;

select cron.schedule(
  'tag_prose_pass',
  '30 3 * * *',
  $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/tag-enrichment-sweep',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := jsonb_build_object('mode', 'prose', 'batch_limit', 10, 'triggered_by', 'cron'),
    timeout_milliseconds := 55000
  ) as request_id;
  $cron$
);

-- The safety property this whole wave rests on: re-enabling the SCHEDULE must
-- never re-enable the WRITE. Fail the migration rather than ship a prose pass
-- that can retract again.
do $$
begin
  if position('automated retraction is removed' in pg_get_functiondef('public.tag_prose_apply'::regproc)) = 0 then
    raise exception 'tag_prose_apply can still retract — refusing to re-enable the prose cron';
  end if;
end $$;
