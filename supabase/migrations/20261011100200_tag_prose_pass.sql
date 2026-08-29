-- Tag glossary content quality, phase 3: the description truth + voice pass.
--
-- `tag-enrichment-sweep` gains mode='prose' (see the function header): one
-- LLM call per prose-bearing tag that (a) retracts prose describing the WRONG
-- SUBJECT — "Vamp" published a Belgian DJ's bio, "Bottom Bitch" a Doja Cat
-- song, "Vacuum Pump" industrial physics — and (b) rewrites right-subject
-- prose into the house voice (short_description derived alongside).
-- Non-sensitive high-confidence rewrites auto-apply; sensitive/adult and
-- low-confidence ones queue to ai_suggestions (decision 2026-08-29:
-- hybrid-by-confidence, sensitive always human-gated).
--
-- `prose_reviewed_at` is the pass's round-robin cursor, stamped on EVERY
-- visit whatever the outcome — the city-fields selector lesson: a visited-
-- but-unstamped row becomes a permanent queue head and starves the sweep.
-- Deliberately NOT in `trg_search_documents_tag`'s column list, so stamping
-- causes zero search churn; the prose writes themselves reindex, which is
-- correct because content changed.
--
-- Cadence: every 2 hours × 25 tags ≈ 300/day — the ~2,900 prose-bearing
-- active tags get a first pass in ~10 days, then it becomes a slow rolling
-- re-review (oldest first). Spend rides chatCompletion's existing budget and
-- breaker; AI_DISABLED stays the hard stop.

alter table public.unified_tags
  add column if not exists prose_reviewed_at timestamptz;

comment on column public.unified_tags.prose_reviewed_at is
  'Round-robin cursor of tag-enrichment-sweep mode=prose (subject check + house-voice rewrite). Stamped on every visit, including failed ones. Not a quality verdict.';

-- Partial index for the cursor scan (active, has prose, oldest first).
create index if not exists idx_unified_tags_prose_cursor
  on public.unified_tags (prose_reviewed_at asc nulls first)
  where status = 'active' and description is not null;

-- Registry row first, then the cron (registry is the record of record; a
-- retirement disables the row, never deletes it). Shape mirrors the live
-- `tag_enrichment_sweep` row: type 'cron' + net.http_post command, so the
-- run-tracking reconciler wraps it for dispatch/response truth.
insert into admin_automations (slug, name, description, trigger, action, schedule, enabled, managed_by)
values (
  'tag_prose_pass',
  'Tag glossary prose truth + voice pass',
  'tag-enrichment-sweep mode=prose: retracts wrong-subject glossary prose (and its wiki identity), rewrites right-subject prose into the house voice. Sensitive/adult always queue to ai_suggestions.',
  jsonb_build_object('type', 'schedule'),
  jsonb_build_object(
    'type', 'cron',
    'jobname', 'tag_prose_pass',
    'command', $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/tag-enrichment-sweep',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := jsonb_build_object('mode', 'prose', 'batch_limit', 25, 'triggered_by', 'cron'),
    timeout_milliseconds := 55000
  ) as request_id;
  $cmd$
  ),
  '30 */2 * * *',
  true,
  'system'
)
on conflict (slug) do update
  set enabled = true,
      schedule = excluded.schedule,
      action = excluded.action,
      description = excluded.description;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'tag_prose_pass') then
    perform cron.unschedule('tag_prose_pass');
  end if;
end $$;

select cron.schedule(
  'tag_prose_pass',
  '30 */2 * * *',
  $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/tag-enrichment-sweep',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := jsonb_build_object('mode', 'prose', 'batch_limit', 25, 'triggered_by', 'cron'),
    timeout_milliseconds := 55000
  ) as request_id;
  $cron$
);
