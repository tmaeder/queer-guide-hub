-- get_admin_review_queue(): the decisions scope throws away 98.6% of its rows AFTER
-- the union has carried them.
--
-- SYMPTOM. `Critical paths` reds intermittently on
-- `e2e/admin-inbox-renders.spec.ts:52` with `Initial queue HTTP 500:
-- {"code":"57014","message":"canceling statement due to statement timeout"}`.
-- `authenticated` carries `statement_timeout = 8s` (pg_roles.rolconfig). The identical
-- 57014 on the same RPC also red #4462 and #4459, so it is the queue, not one diff.
--
-- MY FIRST NUMBER WAS A SINGLE LOADED-INSTANCE SAMPLE AND IT NAMED THE WRONG SCOPE.
-- One call of `p_scope='decisions'` returned 7,070 ms, which reads as 1.13x headroom.
-- Over five runs each:
--
--              min      avg      max   spread
--   all       3,107    4,149    5,267   1.7x
--   decisions 2,088    2,376    2,949   1.4x
--
-- So `all` is the expensive scope and this migration does NOT fix it — see the end.
-- Quote a repeated measurement on this instance; a single timing moves by 3x.
--
-- WHERE THE WORK GOES. `authorized` UNION ALLs every active row of all 41 source views
-- — ~320,000 — and `filtered`/`sorted` then take 50:
--
--   admin_review_src_business_quality ... 258,048 rows, 2,227 ms
--   admin_review_src_general_review ....  24,338 rows,   644 ms
--   admin_review_src_event_quality .....  34,853 rows,   203 ms
--   the other 38 together .............. ~2,900 rows
--
-- Those 258k are machine completeness findings over 91,705 entities
-- (`description_missing_or_thin` 88,217, `media_missing` 86,946, `contact_missing`
-- 81,791) — 5,161 pages, in a queue with 5 human decisions in 60 days. Whether they
-- belong in a review queue is a PRODUCT question, deliberately not answered here:
-- this changes how a page is computed, never what the queue contains.
--
-- THE FIX, and it is one clause. `admin_review_finding_codes` holds 24 rows over
-- exactly 3 queue_keys — business-quality, event-quality, general-review — which are
-- precisely the three biggest views. `p_scope='decisions'` means `not u.is_finding`,
-- so it keeps 4,467 of those views' 317,239 rows and discards the rest after the union
-- has already carried them:
--
--   business-quality ... 258,048 ->   512
--   event-quality ......  34,853 -> 1,264
--   general-review .....  24,338 -> 2,691
--
-- Pushing that predicate into each branch as a NOT EXISTS took the isolated union from
-- 21,133 ms to 850 ms (24.9x) at an identical 6,723 rows, and the whole function from
-- 2,488 ms to 1,182 ms (2.11x) over four paired runs.
--
-- IT IS OMITTED ENTIRELY FOR THE 38 QUEUES WITH NO CODES, decided from the table
-- rather than from a hardcoded list, so a fourth queue gaining a finding code starts
-- being pushed down with no code change.
--
-- WHY THE JOIN STAYS, which is the whole reason this is a safe change. The obvious
-- version also drops the now-redundant `left join admin_review_finding_codes` and
-- hardcodes `false as is_finding`. I measured that and it is NOT worth it:
--
--   * it buys nothing. Once the branch filter has removed 313k rows the join runs on
--     ~6,700, and removing it measured 0.95x on `all` — inside the noise.
--   * it SILENTLY CHANGES THE API. `items` is `d.item||to_jsonb(s)`, so dropping the
--     column removes a key from the payload. Nothing in src/, functions/ or e2e/ reads
--     `is_finding` — but my first attempt did exactly this and only a byte-comparison
--     of old against new output caught it.
--   * it would force the outer `format()` template to be renumbered, and mixing
--     sequential `%s` with `%N$s` there is how I produced two more broken drafts.
--
-- So the outer template, the `authorized` CTE, the join, `is_finding`, the ORDER BY,
-- `details`, the counts cache, every total, the role gate and the four copies of the
-- per-source authorisation predicate are all BYTE-IDENTICAL to before. The only edit
-- is a `%s` on the branch builder.
--
-- `not u.is_finding` IS DELIBERATELY LEFT IN PLACE ABOVE THE UNION. It is now
-- redundant for the pushed-down queues, and that redundancy is the point: filtering
-- twice with the same predicate cannot change a result set, so equivalence does not
-- depend on my having enumerated the finding-bearing queues correctly. If the subquery
-- and the table ever disagree, the outer predicate still decides.
--
-- EQUIVALENCE MEASURED, not argued: `decisions` across all three sort modes and page 2
-- returns jsonb identical to the pre-change function (`updated_at`/`counts_as_of`
-- stripped, both being now()), and `all` is unchanged as a control for the common path.
--
-- PATCHED FROM pg_get_functiondef WITH AN EXACTLY-ONCE ANCHOR rather than restated.
-- The body is 6,119 bytes of dense dynamic SQL whose live text is NOT what any repo
-- file says — restating it is how a later migration silently reverts an earlier one.
--
-- THE VERIFY BLOCK GREPS pg_get_functiondef WITHOUT STRIPPING COMMENTS, which
-- check-functiondef-asserts.mjs exists to forbid, so here is why it is sound rather
-- than lucky. Measured on the live body: `--` occurs ZERO times, so there is no prose
-- for a needle to hide in, and each needle appears exactly once in code (join 1,
-- is_finding 1, `not u.is_finding` 1, counts 2, the 42501 raise 1). Every check is a
-- PRESENCE check (`position(...) = 0` then raise), and comments can only ever make
-- one of those falsely GREEN — never falsely red — which needs the needle to exist
-- only in a comment. The patch adds no comment to the body either. Note the gate
-- itself passes this file by WINDOW-MISS (its scan is +/-3 lines around the
-- functiondef call and the position() calls sit further down), so do not read its
-- green as the argument; this paragraph is.
--
-- NOT FIXED HERE, deliberately: `all` at ~4.1s avg. Its cost is the union and the
-- sort, not the join, so the remaining lever is a per-branch top-N — which only pays
-- where an index can serve the branch ordering (true for `age`, and for `priority` on
-- the big view via `admin_review_eqf_first_seen_idx`: 313 blocks / 1.3 ms instead of
-- 2,227 ms) and is actively WORSE for `p_sort='confidence'`, where that view's
-- `confidence_score` is a constant NULL with no index and all 41 branches would sort
-- their full contents independently. That needs a scratch database to verify across
-- 5 scopes x 3 sorts, and is its own change.

do $patch$
declare
  v_src text;
  v_anchor text := 'from public.%I u'',
  r.risk,r.label,r.risk,r.public_impact,r.sla_hours,r.priority_weight,r.can_reopen,r.view_name)';
  v_repl text := 'from public.%I u %s'',
  r.risk,r.label,r.risk,r.public_impact,r.sla_hours,r.priority_weight,r.can_reopen,r.view_name,
  case when p_scope=''decisions'' and exists(select 1 from public.admin_review_finding_codes fc where fc.queue_key=r.queue_key)
    then format(''where not exists(select 1 from public.admin_review_finding_codes f where f.queue_key=%L and f.subtitle_match=u.subtitle)'', r.queue_key)
    else '''' end)';
  v_hits int;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_admin_review_queue';

  if v_src is null then
    raise exception 'get_admin_review_queue does not exist';
  end if;

  -- Exactly once, or the patch is landing somewhere unintended. The sibling
  -- `v_details` builder also ends in `from public.%I u` but with a different argument
  -- tail, which is what makes this anchor unique.
  v_hits := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
  if v_hits <> 1 then
    raise exception 'anchor matched % times, expected exactly 1 — the function body has moved', v_hits;
  end if;

  execute replace(v_src, v_anchor, v_repl);
end
$patch$;

do $verify$
declare
  v_src text;
  v_res jsonb;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_admin_review_queue';

  -- P1: the pushdown is present, and reads the table rather than a hardcoded list.
  if position('where not exists(select 1 from public.admin_review_finding_codes f where f.queue_key=%L and f.subtitle_match=u.subtitle)' in v_src) = 0 then
    raise exception 'P1 failed: the per-branch NOT EXISTS is not in the branch builder';
  end if;
  if position('exists(select 1 from public.admin_review_finding_codes fc where fc.queue_key=r.queue_key)' in v_src) = 0 then
    raise exception 'P1 failed: the pushdown is not gated on the queue actually having finding codes';
  end if;
  if position('p_scope=''decisions''' in v_src) = 0 then
    raise exception 'P1 failed: the pushdown is not scoped to decisions';
  end if;

  -- P2: everything this migration promises NOT to touch is still there. Each of these
  -- is a silent regression if it goes: without the join `is_finding` leaves the
  -- payload, and without the outer predicate equivalence would rest on my enumeration
  -- of the finding-bearing queues being right.
  if position('left join public.admin_review_finding_codes f' in v_src) = 0 then
    raise exception 'P2 failed: the finding-codes join was removed — is_finding leaves the API payload';
  end if;
  if position('(f.queue_key is not null) as is_finding' in v_src) = 0 then
    raise exception 'P2 failed: is_finding is no longer computed from the join';
  end if;
  if position('else ''not u.is_finding'' end' in v_src) = 0 then
    raise exception 'P2 failed: the outer decisions predicate was dropped — the redundancy is what makes this safe';
  end if;
  if position('case when $4=''priority'' then urgency_rank else 0 end desc' in v_src) = 0 then
    raise exception 'P2 failed: the ORDER BY changed; this migration does not touch it';
  end if;
  if position('admin_review_queue_counts' in v_src) = 0 then
    raise exception 'P2 failed: the counts cache reference is gone';
  end if;

  -- P3: the role gate. A SECURITY DEFINER queue that stopped checking is the one
  -- regression here that would not look like a bug.
  if position('has_any_role_jwt(array[''admin'',''moderator'',''editor'']::public.app_role[])' in v_src) = 0 then
    raise exception 'P3 failed: the staff-account gate is gone';
  end if;
  if position('Review queue requires a staff account' in v_src) = 0 then
    raise exception 'P3 failed: the 42501 raise is gone';
  end if;

  -- P4: it RUNS. CREATE OR REPLACE only parses a plpgsql body, so a broken generated
  -- query compiles cleanly and fails on the first call — which is exactly how the
  -- 42601 in the top-N draft behaved, and how the 42702 in 99991791872772 did.
  -- A migration has no JWT, so claim admin for the length of this block.
  perform set_config('request.jwt.claims', '{"user_role":"admin","role":"authenticated"}', true);
  v_res := public.get_admin_review_queue(p_scope => 'decisions');
  if v_res is null or not (v_res ? 'items' and v_res ? 'total' and v_res ? 'sources'
       and v_res ? 'decisions_total' and v_res ? 'findings_total') then
    raise exception 'P4 failed: decisions returned %', coalesce(v_res::text, 'null');
  end if;
  -- And the other scopes still run, since the branch builder is shared.
  v_res := public.get_admin_review_queue(p_scope => 'all');
  if v_res is null or not (v_res ? 'items') then
    raise exception 'P4 failed: the all scope stopped returning items';
  end if;
  v_res := public.get_admin_review_queue(p_scope => 'decisions', p_sort => 'confidence');
  if v_res is null or not (v_res ? 'items') then
    raise exception 'P4 failed: decisions/confidence stopped returning items';
  end if;

  raise notice 'get_admin_review_queue: P1-P4 pass';
end
$verify$;
