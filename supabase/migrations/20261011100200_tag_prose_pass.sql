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

-- The cursor joins the derived-columns exemption of log_unified_tag_change().
-- That trigger RAISEs when a human_reviewed row is modified by an actor still
-- reading 'system:trigger' (i.e. one that never declared itself), and a
-- cursor stamp on a human_reviewed row would trip it — found by dry-running
-- this wave in a rolled-back transaction on prod. prose_reviewed_at is
-- exactly the class the array describes ("recomputed by scheduled jobs,
-- never human-curated"). Restated from the LIVE definition (last touched by
-- 20260801080000, which added confidence_score); the only change is the one
-- array member.
CREATE OR REPLACE FUNCTION public.log_unified_tag_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor TEXT := COALESCE(current_setting('app.actor', true), 'system:trigger');
  -- Recomputed by scheduled jobs, never human-curated.
  v_derived CONSTANT text[] := ARRAY[
    'usage_count', 'updated_at',
    'quality_score', 'quality_breakdown', 'last_quality_at', 'confidence_score',
    'prose_reviewed_at'
  ];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.human_reviewed = TRUE
       AND v_actor LIKE 'system:%'
       AND (to_jsonb(NEW) - v_derived) IS DISTINCT FROM (to_jsonb(OLD) - v_derived) THEN
      RAISE EXCEPTION 'human_reviewed tag % cannot be modified by %', OLD.id, v_actor;
    END IF;
    INSERT INTO tag_change_log(tag_id, action_type, before_data, after_data, actor)
      VALUES (OLD.id, 'update', to_jsonb(OLD), to_jsonb(NEW), v_actor);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO tag_change_log(tag_id, action_type, before_data, actor)
      VALUES (OLD.id, 'delete', to_jsonb(OLD), v_actor);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO tag_change_log(tag_id, action_type, after_data, actor)
      VALUES (NEW.id, 'create', to_jsonb(NEW), v_actor);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$;

-- Content writes go through ONE attributed, audited door. The guard above
-- blocks UNDECLARED writers ('system:%'), not machine writers per se — every
-- migration pierces it by declaring app.actor, and 79% of prose-bearing
-- active tags are human_reviewed=true (2,290 of 2,903; the flag was largely
-- bulk-stamped, see the human-reviewed-is-not-evidence audit), so a pass
-- that skipped them could not do its job. This RPC declares
-- 'llm:tag-prose-pass', so every write lands in tag_change_log under a real
-- actor and is reversible row-by-row. It refuses sensitive/adult rows
-- outright — those may only travel the ai_suggestions review path, whatever
-- the caller claims (defence in depth against a bug in the edge function).
create or replace function public.tag_prose_apply(
  p_tag_id uuid,
  p_description text default null,
  p_short_description text default null,
  p_retract boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare v_row unified_tags%rowtype;
begin
  perform set_config('app.actor', 'llm:tag-prose-pass', true);
  select * into v_row from unified_tags where id = p_tag_id and status = 'active';
  if not found then return; end if;
  if v_row.is_sensitive or v_row.is_adult then
    raise exception 'tag_prose_apply: % is sensitive/adult — review path only', p_tag_id;
  end if;

  if p_retract then
    -- Wrong subject: remove the claim and the identity it was derived from.
    -- The weekly medical-codes/hierarchy syncs regenerate from wikidata_id, so
    -- a wrong identifier rebuilds wrong data forever; a null one rebuilds
    -- nothing, and the thin-page machinery deindexes until prose is re-earned.
    update unified_tags
    set description = null, short_description = null, long_description = null,
        wikidata_id = null, wikipedia_url = null, updated_at = now()
    where id = p_tag_id;
  else
    update unified_tags
    set description = coalesce(p_description, description),
        short_description = coalesce(p_short_description, short_description),
        updated_at = now()
    where id = p_tag_id;
  end if;
end $$;
revoke all on function public.tag_prose_apply(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.tag_prose_apply(uuid, text, text, boolean) to service_role;

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
