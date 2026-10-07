-- ---------------------------------------------------------------------------
-- triage_action: an action a queue does not implement must RAISE, not return
-- {"ok": true}.
--
-- THE DEFECT. `triage_action` validates `p_action` against a five-value list,
-- runs a CASE over 17 queues where each branch is `IF approve … ELSIF reject …
-- [ELSIF reopen …] END IF` with NO ELSE, and then builds its success object
-- UNCONDITIONALLY after the CASE. So an action that matches the queue branch
-- but no IF arm falls straight through to `{"ok": true, "action": <action>}`,
-- and the inbox toasts success. Measured on the deployed body:
--
--   * `flag` has NO handler in ANY of the 17 branches — the string appears
--     exactly once in the whole function, in the `p_action NOT IN (...)` list.
--     The Flag button and the `f` key have therefore been silent no-ops for
--     every queue in the inbox, for their whole life.
--   * `reopen` has no handler in TEN branches: dedup-review, editorial,
--     org-link-review, and all five quality-* queues (and tags/duplicates
--     raise their own 22023 deliberately). `TriageView.handleUndo` fires
--     `reopen` for any last-acted row, so the U key reported "Reopened" and
--     reversed nothing.
--   * `skip` likewise has no handler. It is intercepted client-side today
--     (TriageView.tsx) so it never reaches the RPC, which is why it has not
--     bitten — but that is one caller's discipline, not a contract.
--
-- WHY dedup-review IS THE WORST CASE. Its approve calls `approve_dedup_review`
-- → `merge_venues` / `merge_cities` / `merge_entities`: it sets
-- `duplicate_of_id`, reparents children and mints a slug redirect. Undoing it
-- needs `unmerge_*`, which `reopen` never reaches. Measured before this
-- migration: `select count(*) from dedup_review_queue where status = 'open'
-- and reviewed_at is not null` → 0. Not one row has ever returned to open; the
-- path has never once worked. A reviewer who approved the wrong pair, pressed
-- U and read "Reopened" was told a merge had been reversed that was still live.
--
-- THE CONTRACT IS ALREADY DATA, AND WAS ALREADY CORRECT. `triage_sources.
-- capabilities.can_reopen` is set on all 17 rows and agrees exactly with the
-- real branches — true on the seven queues that have a reopen handler, false
-- on the ten that do not. `useTriageSourceCapabilities.ts` types the field and
-- its own docblock says it is there "so a later consumer has one place to read
-- them from"; grep found that consumer does not exist. So this needs no new
-- vocabulary: it makes the registry load-bearing instead of decorative.
--
-- WHY THE CHECK GOES *AFTER* THE CASE AND NOT BEFORE. `tags` and `duplicates`
-- already raise 22023 for reopen with messages that say WHY ("approving
-- creates tags" / "approving merges entities"), and `org-link-review` raises
-- for every action. A pre-CASE check would preempt all three with a generic
-- message and lose the better one. Placed after the CASE, those branches still
-- raise first and only a genuine fall-through reaches this. It also states the
-- defect directly: the assertion is "this action produced no effect", which is
-- what went wrong, rather than "this action is not in a list".
--
-- Token substitution on the deployed definition rather than a restatement of
-- the ~200-line CASE — the discipline `99991790362096` established for this
-- same function after `20260806140000` left the repo copy wrong for three
-- days. Every edit asserts its own before-state and after-state and aborts
-- rather than guessing. The canonical readable body remains 20260801050000.
-- ---------------------------------------------------------------------------

do $patch$
declare
  v_def    text;
  v_new    text;
  v_anchor text;
  v_guard  text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'triage_action';
  if v_def is null then
    raise exception 'triage_action not found';
  end if;
  v_new := v_def;

  -- Idempotent: the marker is the guard's own first line.
  if position('unhandled_triage_action' in v_new) > 0 then
    raise notice 'triage_action already refuses unhandled actions';
    return;
  end if;

  -- Anchor on the success-object assignment, which is the thing being guarded.
  -- Anchoring on `END CASE;` would be wrong by one statement and would put the
  -- guard before the CASE's own closing, which is not where the fall-through
  -- lands.
  v_anchor := E'  v_result := jsonb_build_object(';
  if (length(v_new) - length(replace(v_new, v_anchor, ''))) / nullif(length(v_anchor), 0) <> 1 then
    raise exception 'expected exactly one success-object assignment in triage_action, refusing to guess';
  end if;

  v_guard :=
       E'  -- unhandled_triage_action: a branch that matched no IF arm used to fall\n'
    || E'  -- through to the unconditional success object below, so `flag` on every\n'
    || E'  -- queue and `reopen` on the ten whose approve is not reversible returned\n'
    || E'  -- {"ok": true} and wrote nothing. The contract is the registry''s\n'
    || E'  -- capabilities.can_reopen, which was already correct for all 17 rows.\n'
    || E'  IF p_action IN (''flag'', ''skip'') THEN\n'
    || E'    RAISE EXCEPTION ''% is not a decision this inbox records'', p_action\n'
    || E'      USING ERRCODE = ''22023'',\n'
    || E'            HINT = ''Approve it, reject it, or leave the row open.'';\n'
    || E'  END IF;\n'
    || E'\n'
    || E'  IF p_action = ''reopen''\n'
    || E'     AND NOT coalesce((SELECT (capabilities->>''can_reopen'')::boolean\n'
    || E'                         FROM triage_sources WHERE queue_key = p_queue_type), false)\n'
    || E'  THEN\n'
    || E'    RAISE EXCEPTION ''reopen is not supported for the % queue'', p_queue_type\n'
    || E'      USING ERRCODE = ''22023'',\n'
    || E'            HINT = ''This queue''''s approve is not reversible from the inbox.'';\n'
    || E'  END IF;\n'
    || E'\n';

  v_new := replace(v_new, v_anchor, v_guard || v_anchor);
  execute v_new;
end $patch$;

-- ---------------------------------------------------------------------------
-- Postconditions. Assert the REACHED STATE, not the number of edits — a re-run
-- legitimately changes nothing and must still pass.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_src   text;
  v_bad   int;
  v_rows  int;
begin
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'triage_action';

  -- P1: the guard is present.
  if position('unhandled_triage_action' in v_src) = 0 then
    raise exception 'P1 failed: triage_action has no unhandled-action guard — flag still returns ok:true';
  end if;

  -- P2: it sits AFTER the CASE, not before it. Before the CASE it would
  -- preempt the tags/duplicates/org-link-review branches, whose own 22023
  -- messages explain why the action is refused.
  if position('unhandled_triage_action' in v_src) < position(E'END CASE;' in v_src) then
    raise exception 'P2 failed: the guard runs before END CASE and would preempt the branches that raise their own message';
  end if;

  -- P3: both arms raise. Asserting the condition alone passes with the RAISE
  -- replaced by NULL.
  if position(E'RAISE EXCEPTION ''% is not a decision this inbox records''' in v_src) = 0 then
    raise exception 'P3 failed: the flag/skip arm does not raise';
  end if;
  if position(E'RAISE EXCEPTION ''reopen is not supported for the % queue''' in v_src) = 0 then
    raise exception 'P3 failed: the reopen arm does not raise';
  end if;

  -- P4: the reopen arm reads the REGISTRY, not a hardcoded queue list. A
  -- literal list is how the search-drain sentinel ended up pinned to one slug
  -- out of ~240.
  if position('capabilities->>''can_reopen''' in v_src) = 0 then
    raise exception 'P4 failed: the reopen arm does not read triage_sources.capabilities.can_reopen';
  end if;

  -- P5: the registry is populated for every active queue, or the arm fails
  -- open. `coalesce(..., false)` makes a missing row refuse rather than allow,
  -- so this is a completeness check, not a safety one — but a queue with no
  -- row would be silently un-reopenable, which is a different lie.
  select count(*) into v_bad
    from triage_sources
   where active and (capabilities->>'can_reopen') is null;
  if v_bad > 0 then
    raise exception 'P5 failed: % active triage_sources rows do not declare can_reopen', v_bad;
  end if;

  -- P6: the declared contract still agrees with the real branches. `reopen`
  -- is implemented iff the body carries a reopen arm inside that queue's
  -- branch. Checked positively for the seven true rows so a registry edit
  -- that silently diverges from the CASE is caught here rather than by a
  -- reviewer pressing U.
  select count(*) into v_rows
    from triage_sources
   where active and (capabilities->>'can_reopen')::boolean;
  if v_rows <> 7 then
    raise exception 'P6 failed: % queues declare can_reopen, expected the 7 with a reopen arm', v_rows;
  end if;

  raise notice 'triage_action: flag/skip and unsupported reopen now RAISE 22023 instead of reporting success';
end $verify$;
