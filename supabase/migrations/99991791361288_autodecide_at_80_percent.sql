-- ---------------------------------------------------------------------------
-- Operator policy: decide at >= 0.80 confidence, machine, on every queue.
--
-- No new machinery. Both engines already existed and this lowers their bar:
--
--   review_queue_autoapprove  cron 2-59/5    run_review_queue_autoapprove(2000, 0.90)
--   dedup_review_autoapprove  cron 30 6 * *  run_dedup_review_autoapprove()  -- DEFAULT 0.95
--   triage_bulk_approve_high_conf            p_min_confidence DEFAULT 0.9    -- the inbox button
--
-- MEASURED BLAST RADIUS AT 0.80, on the open queues the day this was written:
--
--   dedup-review   201 of 201 open rows (confidence range 0.80–0.85)
--   quality-city    21 of  23 open rows (range 0.70–0.90)
--   staging          0 of 148 open rows — its confidence tops out at 0.500,
--                    so an 0.80 bar is a NO-OP there and that queue does not
--                    drain. Stated because "auto-approve at 80%" sounds like
--                    it empties the inbox and on staging it empties nothing.
--
-- WHAT THE DEDUP NUMBER MEANS, because 201-of-201 is not what it looks like.
-- The dedup engine already auto-merges what it is confident about: measured
-- `dedup_signals('venue')` → `would_merge 57`, `open_auto_eligible 0`. The 201
-- rows in the queue are the residue it DECLINED and parked for a human. So
-- this is a decision to merge the engine's own reject pile, which is exactly
-- what the operator asked for and is worth naming rather than burying.
-- It is also REVERSIBLE: `unmerge_venues`/`unmerge_entities` replay
-- `details.moved` for any merge stamped `schema:1`, and
-- `dedup_signals().merges_unreversible_since_fix` reads 0, so every merge this
-- makes can be undone. That is the fact that makes the lowered bar survivable.
--
-- `p_limit` stays 200, so the first nightly run takes 200 and the rest follow
-- the next night — a natural brake on a 201-row step change, left in place.
--
-- WHAT IS DELIBERATELY NOT CHANGED, and the one-line way to change it:
--
--   1. `review_field_registry.batchable` still holds 11 open city rows —
--      `lgbt_friendly_rating` (8) and `best_time_to_visit` (3). These are the
--      two fields with a measured fabrication record: 99991789843323 added the
--      `batchable` predicate after a threshold-only pass published 285
--      `city.lgbt_friendly_rating` and 7 `city.best_time_to_visit` rows, and
--      `best_time_to_visit` is the field that published the Busan Queer
--      Culture Festival as "June or July" when it runs in September/October
--      (June/July is Seoul's). The threshold is now 0.80 for them too; what
--      holds them is the per-field flag, which is DATA:
--        update review_field_registry set batchable = true
--         where entity_type='city' and field in ('lgbt_friendly_rating','best_time_to_visit');
--      One UPDATE per field, reversible, no deploy. The run summary already
--      reports `held_for_human_not_batchable` so the count is never silent.
--
--   2. Personality dedup pairs stay excluded (`entity_type <> 'personality'`
--      in `run_dedup_review_autoapprove`, mirroring
--      `approve_dedup_review_batch`'s own WHERE). Merging two different people
--      into one profile on a queer platform is an outing risk, and
--      `_personality_merge_core` repoints the relationship graph DROPPING
--      self-loops and already-existing edges rather than moving them, so this
--      is the one merge class no undo fully rebuilds. 0 personality pairs are
--      open today, so the exclusion costs nothing now. To include them:
--        -- remove `AND q.entity_type <> 'personality'` from
--        -- run_dedup_review_autoapprove, and drop the matching WHERE clause
--        -- in approve_dedup_review_batch, or the two disagree.
--
-- Threshold values live in the CALL, not in a second config table: the cron
-- command and the registry's `action.command` are the knob, which is one
-- UPDATE away and already the pattern these two rows use.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. run_dedup_review_autoapprove: DEFAULT 0.95 -> 0.80.
--
--    The cron calls it with NO arguments, so the default IS the policy.
--    Token substitution on the deployed definition rather than a restatement
--    of a ~110-line body with an EXECUTE format loop — the discipline
--    99991790719601 established, and the reason is that this body is the sole
--    machine writer of merges on this platform.
-- ---------------------------------------------------------------------------
do $patch$
declare
  v_def text;
  v_new text;
  v_old text := 'p_min_confidence numeric DEFAULT 0.95';
  v_want text := 'p_min_confidence numeric DEFAULT 0.80';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'run_dedup_review_autoapprove';
  if v_def is null then
    raise exception 'run_dedup_review_autoapprove not found';
  end if;

  if position(v_want in v_def) > 0 then
    raise notice 'run_dedup_review_autoapprove already defaults to 0.80';
  else
    -- Exactly one signature default, or refuse. A second occurrence would mean
    -- 0.95 also appears in the BODY as a comparison, and replacing that would
    -- change the logic rather than the default.
    if (length(v_def) - length(replace(v_def, v_old, ''))) / nullif(length(v_old), 0) <> 1 then
      raise exception 'expected exactly one "%" in run_dedup_review_autoapprove, refusing to guess', v_old;
    end if;
    v_new := replace(v_def, v_old, v_want);
    execute v_new;
  end if;
end $patch$;

-- ---------------------------------------------------------------------------
-- 2. triage_bulk_approve_high_conf: DEFAULT 0.9 -> 0.8.
--
--    The inbox's "Approve >=90%" button passes p_min_confidence explicitly, so
--    the client is changed in lockstep; the default moves so a caller that
--    omits it gets the same policy. Latent on today's data — staging's highest
--    confidence is 0.500 — which is why this is a policy alignment and not a
--    publish event.
-- ---------------------------------------------------------------------------
do $patch$
declare
  v_def text;
  v_old text := 'p_min_confidence numeric DEFAULT 0.9';
  v_want text := 'p_min_confidence numeric DEFAULT 0.8';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'triage_bulk_approve_high_conf';
  if v_def is null then
    raise exception 'triage_bulk_approve_high_conf not found';
  end if;

  if position(v_want in v_def) > 0 and position(v_old in v_def) = 0 then
    raise notice 'triage_bulk_approve_high_conf already defaults to 0.8';
  else
    -- `DEFAULT 0.9` is a PREFIX of `DEFAULT 0.95`, so an unanchored count
    -- would miscount against a body that mentioned either. Anchor on the end
    -- of the parameter.
    if (length(v_def) - length(replace(v_def, v_old || ',', ''))) / nullif(length(v_old || ','), 0)
       + (length(v_def) - length(replace(v_def, v_old || ')', ''))) / nullif(length(v_old || ')'), 0) <> 1 then
      raise exception 'could not find exactly one "%" parameter default, refusing to guess', v_old;
    end if;
    execute replace(replace(v_def, v_old || ',', v_want || ','), v_old || ')', v_want || ')');
  end if;
end $patch$;

-- ---------------------------------------------------------------------------
-- 3. review_queue_autoapprove: 0.90 -> 0.80, in the REGISTRY and in pg_cron.
--
--    The registry is the record of truth and `sync_automations_to_cron()` has
--    a command-drift branch that applies `action.command` to the live job, so
--    updating only pg_cron would be reverted by the nightly reconciler and
--    updating only the registry would take until 05:10 to take effect. Both,
--    then assert both — the `detect_stale_venues` lesson, where a migration
--    rescheduled a cron and the registry kept the old command for weeks.
-- ---------------------------------------------------------------------------
update public.admin_automations
   set action = jsonb_set(action, '{command}',
         to_jsonb('SELECT public.run_review_queue_autoapprove(2000, 0.80);'::text))
 where slug = 'review_queue_autoapprove';

do $cron$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'review_queue_autoapprove';
  if v_jobid is null then
    raise exception 'cron job review_queue_autoapprove not found — re-create it from its own migration';
  end if;
  -- Schedule unchanged; only the command moves.
  perform cron.alter_job(v_jobid,
    command := 'SELECT public.run_review_queue_autoapprove(2000, 0.80);');
end $cron$;

-- ---------------------------------------------------------------------------
-- Postconditions. The REACHED STATE, so a re-run that changes nothing passes.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_args text;
  v_cmd  text;
  v_reg  text;
  v_src  text;
begin
  -- P1: dedup auto-approve defaults to 0.80.
  select pg_get_function_arguments(p.oid) into v_args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'run_dedup_review_autoapprove';
  if position('DEFAULT 0.80' in v_args) = 0 then
    raise exception 'P1 failed: run_dedup_review_autoapprove still defaults to % — the cron passes no argument so the default IS the policy', v_args;
  end if;

  -- P2: and it STILL excludes personality pairs. The cheap way to satisfy P1
  -- is to rewrite the function; this asserts the outing-risk exclusion
  -- survived that rewrite.
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'run_dedup_review_autoapprove';
  if position(E'q.entity_type <> ''personality''' in v_src) = 0 then
    raise exception 'P2 failed: run_dedup_review_autoapprove no longer excludes personality pairs — merging two people is the one class no undo rebuilds';
  end if;

  -- P3: the bulk button's default moved.
  select pg_get_function_arguments(p.oid) into v_args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'triage_bulk_approve_high_conf';
  if position('DEFAULT 0.8' in v_args) = 0 then
    raise exception 'P3 failed: triage_bulk_approve_high_conf arguments are %', v_args;
  end if;

  -- P4: registry and pg_cron AGREE, and both say 0.80. Asserting one alone is
  -- how a threshold change survives a day and is then reverted by the
  -- reconciler.
  select action->>'command' into v_reg
    from public.admin_automations where slug = 'review_queue_autoapprove';
  select command into v_cmd from cron.job where jobname = 'review_queue_autoapprove';
  if v_reg is null or position('0.80' in v_reg) = 0 then
    raise exception 'P4 failed: registry command for review_queue_autoapprove is %', coalesce(v_reg, '(null)');
  end if;
  if v_cmd is null or position('0.80' in v_cmd) = 0 then
    raise exception 'P4 failed: live cron command for review_queue_autoapprove is %', coalesce(v_cmd, '(null)');
  end if;
  if v_reg <> v_cmd then
    raise exception 'P4 failed: registry and pg_cron disagree — registry=% cron=%', v_reg, v_cmd;
  end if;

  -- P5: the job is still scheduled and active. A threshold on a job that does
  -- not run is a policy nobody applies.
  if not exists (select 1 from cron.job
                  where jobname = 'review_queue_autoapprove' and active) then
    raise exception 'P5 failed: review_queue_autoapprove is not an active cron job';
  end if;
  if not exists (select 1 from public.admin_automations
                  where slug = 'review_queue_autoapprove' and enabled) then
    raise exception 'P5 failed: review_queue_autoapprove is disabled in the registry';
  end if;
  if not exists (select 1 from cron.job
                  where jobname = 'dedup_review_autoapprove' and active) then
    raise exception 'P5 failed: dedup_review_autoapprove is not an active cron job';
  end if;

  -- P6: the registry still REPORTS what it holds back, so the batchable
  -- residue can never be silent. Dropping this key would make "held for a
  -- human" indistinguishable from "there was nothing to do".
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'run_review_queue_autoapprove';
  if position('held_for_human_not_batchable' in v_src) = 0 then
    raise exception 'P6 failed: run_review_queue_autoapprove no longer reports held_for_human_not_batchable';
  end if;

  raise notice 'auto-decision bar is 0.80 on review_queue_autoapprove, dedup_review_autoapprove and triage_bulk_approve_high_conf';
end $verify$;
