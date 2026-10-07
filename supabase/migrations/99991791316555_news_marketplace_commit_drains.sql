-- ---------------------------------------------------------------------------
-- A human approve in the staging inbox publishes venues and events. It has
-- never published news or marketplace, because neither has a drain.
--
-- THE SHAPE. `triage_action`'s staging branch writes `review_status='approved'`
-- and nothing else; publishing is a separate hourly cron per entity family:
--
--   city-drain-commit         24 * * * *   commit_city_staging_batch(100)
--   vn-drain-commit           49 * * * *   commit_venue_staging_batch(100)
--   personality-drain-commit  51 * * * *   commit_personality_staging_batch(100)
--   ev-drain-commit           52 * * * *   commit_event_staging_batch(100)
--   -- no news drain, no marketplace drain
--
-- For news there is no batch function to schedule at all. `news_commit_staging_batch`
-- LOOKS like one and is not: its first argument is `p_job_id` and its WHERE is
-- `job_id = p_job_id`, so it drains ONE DAG run. Once that run finishes,
-- nothing ever revisits the row. `commit_news_staging_item` exists and is
-- called only by the Import Hub (`ingestion-review-api`), never by the inbox.
--
-- MEASURED COST. Rows passing BOTH documented commit gates
-- (`ai_validation_status='approved'` AND `review_status IN ('auto','approved')`),
-- still `disposition='pending'`:
--
--   news_articles          4,248 eligible   (360 human-approved, 3,888 auto)
--                          oldest 2026-05-12 — nearly five months
--   marketplace_listings   5,924 eligible   (5,915 human-approved!)
--                          oldest 2026-07-21
--
-- A reviewer approves one of these, the row leaves the queue, the content never
-- appears, and nothing anywhere records that it is stuck. That is the
-- "collected human decisions and discarded them" failure of the 40-day
-- `ai_validation_status` incident, one stage further down the pipe.
--
-- ---------------------------------------------------------------------------
-- WHY NEWS IS SAFE TO DRAIN AND MARKETPLACE PUBLISHES NOTHING
--
-- The batch template (copied from `commit_venue_staging_batch`) marks a row
-- `disposition='rejected'` when the item function THROWS. On a 4,248-row
-- backlog that is a mass-rejection risk, so it was measured before being
-- wired rather than after:
--
--   * `commit_news_staging_item` is defensive by construction. A terminal
--     disposition returns `noop`. A missing title or source_id marks the row
--     rejected ITSELF and returns `'rejected'` — it does not raise. So the
--     exception arm is reserved for genuine faults.
--   * Of the 4,248 eligible news rows, rows with no resolvable title: 0.
--     Rows with no resolvable source_id: 0. Nothing self-rejects.
--
-- Marketplace is the opposite and the number is the point:
-- `commit_marketplace_staging_batch` ALREADY EXISTS and needs only a cron —
-- but run against live data it returns ZERO rows. Its own selector is
-- stricter than the family template in three ways, and the 5,924 decompose
-- against them exactly:
--
--   disposition = 'pending'                         5,924
--   AND classification_result IS NOT NULL           1,241   (4,683 never classified)
--   AND dedup_status IN ('unique','duplicate')          0   (all 1,241 are merge_candidate)
--   -------------------------------------------------------
--   fully eligible                                      0
--
-- So the marketplace cron is armed and publishes nothing until the relevance
-- classifier reaches the 4,683 and dedup resolves the merge_candidates. That
-- is a correct state, and it is also indistinguishable from a cron that is
-- broken — the `would_merge: 0` shape this codebase keeps rediscovering. It
-- therefore ships WITH the sentinel below rather than as a silent no-op, and
-- the relevance gate is deliberately NOT relaxed: committing a listing the
-- LGBTQ+ classifier has never seen is the thing that gate exists to stop.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The news drain. Mirrors commit_venue_staging_batch — same FOR UPDATE
--    SKIP LOCKED, same per-row exception arm so one bad row cannot abort the
--    batch — plus the two rules below.
-- ---------------------------------------------------------------------------
-- TWO RULES THIS BATCH ADDS OVER THE VENUE TEMPLATE, both measured on the
-- backlog it exists to drain. Neither is in `commit_news_staging_item`,
-- because that function is also the Import Hub's commit path and changing it
-- changes a surface this migration did not measure.
--
-- RULE 1 — DEINDEX ANYTHING WITHOUT A PASSING VERDICT. `news_articles
-- .seo_indexable` DEFAULTS TO TRUE and `commit_news_staging_item` never sets
-- it, so a committed row is crawler-visible on arrival. Measured over the
-- 4,248 eligible rows: `quality_status='passed'` on **zero** of them —
-- `review` 1,938, no verdict at all 1,248, `rejected` 1,062. So the naive
-- drain publishes 3,186 articles to crawlers with an unresolved or absent
-- quality verdict. The precedent says that is not how this table behaves:
-- `rejected` articles are 0 of 13,258 indexable and 0 in search, while
-- `passed` runs 82.4% indexable. `review` and NULL have NO precedent — 0 rows
-- each — so there is no established answer to inherit and the safe one is
-- taken. The quality pipeline promotes a row later; this only ever withholds.
--
-- RULE 2 — NEVER LET A STALE STAGING VERDICT DOWNGRADE A LIVE ARTICLE.
-- `commit_news_staging_item`'s UPDATE arm does `quality_status =
-- coalesce(v_quality_status, quality_status)`, so a staging row carrying
-- `review` or `rejected` OVERWRITES a live `passed`. 1,367 of the 4,248 match
-- an existing article, and the overlap is not small:
--
--   staging (no verdict) -> live passed+indexable   310   (coalesce keeps passed — safe)
--   staging review       -> live passed+indexable   307   (DOWNGRADED)
--   staging rejected     -> live passed+indexable   120   (DOWNGRADED)
--
-- So without this rule the drain would downgrade **427 currently live,
-- indexable articles** and rule 1 would then deindex them — a drain whose
-- stated purpose is to publish removing 427 live pages. It is implemented as a
-- SELECTOR rather than a post-hoc restore: a first draft snapshotted the live
-- verdict after the fact and inferred "this was passed" from `seo_indexable`
-- being true, which is circular — that flag is the thing rule 1 writes. Not
-- selecting the row at all cannot be circular.
--
-- COST, STATED: the 1,367 matched rows keep `disposition='pending'` and go on
-- being counted by the sentinel. That is honest — they ARE unresolved staging
-- rows — and resolving them is a dedup/bookkeeping decision about duplicate
-- staging rows for one article, not a publishing one. The drain's job is to
-- publish what was never published: the 2,881 inserts.
create or replace function public.commit_news_staging_batch(p_limit integer default 50)
returns table(staging_id uuid, article_id uuid, action text)
language plpgsql
set search_path to 'public', 'pg_catalog'
as $fn$
declare
  r          record;
  res        record;
  v_staged_q text;
begin
  for r in
    select s.id, s.enriched_data
      from public.ingestion_staging s
     where s.target_table = 'news_articles'
       and s.disposition in ('pending','approved')
       and s.ai_validation_status = 'approved'
       and (s.dedup_status in ('unique','duplicate','merge_candidate') or s.dedup_status is null)
       and (s.review_status in ('auto','approved') or s.review_status is null)
       -- RULE 2, as a SELECTOR rather than a post-hoc repair: only rows whose
       -- article does not exist yet. A row that already matches a live article
       -- is not stranded — its content is published — and re-committing it can
       -- only do harm, because the item function's
       -- `coalesce(v_quality_status, quality_status)` would overwrite a live
       -- `passed` with this row's months-old `review` or `rejected`. Measured:
       -- 427 live indexable articles sit in exactly that overlap. Matching the
       -- item function's own two-key lookup (fingerprint, then url) keeps the
       -- selector and the committer agreeing about what "exists" means.
       and not exists (
         select 1 from public.news_articles a
          where a.fingerprint = public.news_compute_fingerprint(
                  nullif(btrim(coalesce(s.normalized_data->>'title',
                                        s.normalized_data->>'name', '')), ''),
                  coalesce(nullif(s.normalized_data->>'published_at','')::timestamptz,
                           nullif(s.normalized_data->'dates'->>'start','')::timestamptz,
                           nullif(s.normalized_data->'metadata'->>'published_at','')::timestamptz,
                           now()),
                  coalesce(nullif(s.normalized_data->>'source_id','')::uuid,
                           nullif(s.normalized_data->'metadata'->>'source_id','')::uuid),
                  nullif(btrim(coalesce(s.normalized_data->>'url',
                    case when jsonb_array_length(coalesce(s.normalized_data->'urls','[]'::jsonb)) > 0
                         then s.normalized_data->'urls'->>0 end,
                    s.normalized_data->'metadata'->>'url')), '')))
       and not exists (
         select 1 from public.news_articles a
          where a.url = nullif(btrim(coalesce(s.normalized_data->>'url',
                  case when jsonb_array_length(coalesce(s.normalized_data->'urls','[]'::jsonb)) > 0
                       then s.normalized_data->'urls'->>0 end,
                  s.normalized_data->'metadata'->>'url')), ''))
     order by s.created_at asc
     limit p_limit
     for update skip locked
  loop
    begin
      v_staged_q := nullif(r.enriched_data->>'quality_status', '');

      select * into res from public.commit_news_staging_item(r.id, 'batch');

      -- Rule 1: withhold anything that does not hold a passing verdict. Scoped
      -- to `inserted` because the selector guarantees this batch only ever
      -- inserts (rule 2), so an `updated` here would mean the selector and the
      -- item function disagree about what exists — in which case touching
      -- `seo_indexable` on somebody else's live article is the last thing to do.
      if res.article_id is not null and res.action = 'inserted' then
        update public.news_articles
           set seo_indexable = false
         where id = res.article_id
           and coalesce(quality_status, '') <> 'passed'
           and seo_indexable;
      end if;

      staging_id := r.id; article_id := res.article_id; action := res.action;
      return next;
    exception when others then
      update public.ingestion_staging set
        disposition   = 'rejected',
        error_message = 'commit_fn: ' || sqlerrm,
        updated_at    = now()
       where id = r.id;
      insert into public.ingestion_events (staging_id, stage, new_status, actor, payload)
      values (r.id, 'commit', 'rejected', 'batch', jsonb_build_object('error', sqlerrm));
    end;
  end loop;
end;
$fn$;

comment on function public.commit_news_staging_batch(integer) is
  'Hourly drain for approved news staging rows. NOT news_commit_staging_batch, '
  'which is scoped to one DAG run via p_job_id and cannot revisit a row after '
  'that run ends. Added 99991791316555 after 4,248 eligible rows — 360 of them '
  'human-approved, oldest 2026-05-12 — were found never published because the '
  'inbox had no drain to hand them to.';

grant execute on function public.commit_news_staging_batch(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Schedule both, and register both.
--
--    The registry is the record of truth (`admin_automations`), pg_cron is the
--    executor, and `sync_automations_to_cron()` reconciles them — so a job
--    created here without a registry row is "unregistered", which branch (a)
--    reports and deliberately never auto-kills. Both get both.
--
--    Minutes chosen to sit clear of the four existing drains (24/49/51/52) and
--    of the :41/:12 dedup drains that feed them.
-- ---------------------------------------------------------------------------
do $sched$
begin
  perform cron.unschedule('news-drain-commit')
    where exists (select 1 from cron.job where jobname = 'news-drain-commit');
  perform cron.schedule('news-drain-commit', '56 * * * *',
    $cmd$ SELECT count(*) FROM public.commit_news_staging_batch(100); $cmd$);

  perform cron.unschedule('mp-drain-commit')
    where exists (select 1 from cron.job where jobname = 'mp-drain-commit');
  perform cron.schedule('mp-drain-commit', '58 * * * *',
    $cmd$ SELECT count(*) FROM public.commit_marketplace_staging_batch(100); $cmd$);
end $sched$;

-- Shape copied from the live `city_drain_commit` row, not invented: `name` is
-- the JOBNAME (the reconciler matches on it), `trigger` is NOT NULL with no
-- default, and `action` carries a `jobname` key alongside the command.
insert into public.admin_automations
  (slug, name, description, managed_by, enabled, schedule, trigger, action, conditions)
values
  ('news_drain_commit', 'news-drain-commit',
   'News staging drain stage. Hourly: commits news rows that cleared '
   'validate/dedup/review. There was no news drain at all before this row — '
   'news_commit_staging_batch only looks like one, its WHERE is job_id = '
   'p_job_id, so it drains one DAG run and never revisits a row. 4,248 rows '
   'were eligible and unpublished, 360 of them approved by a human, oldest '
   '2026-05-12.',
   'system', true, '56 * * * *',
   jsonb_build_object('type','schedule'),
   jsonb_build_object('type','cron','jobname','news-drain-commit','command',
     'SELECT count(*) FROM public.commit_news_staging_batch(100);'),
   '[]'::jsonb),
  ('mp_drain_commit', 'mp-drain-commit',
   'Marketplace staging drain stage. Hourly. EXPECTED TO COMMIT 0 until the '
   'LGBTQ+ relevance classifier reaches the 4,683 unclassified rows and dedup '
   'resolves the 2,230 merge_candidates — commit_marketplace_staging_batch '
   'requires classification_result IS NOT NULL and dedup_status IN '
   '(unique,duplicate), and measured live it returns zero rows. '
   'staging_commit_drain_signals() names both blockers so that 0 is '
   'attributable rather than looking like a broken cron.',
   'system', true, '58 * * * *',
   jsonb_build_object('type','schedule'),
   jsonb_build_object('type','cron','jobname','mp-drain-commit','command',
     'SELECT count(*) FROM public.commit_marketplace_staging_batch(100);'),
   '[]'::jsonb)
on conflict (slug) do update
  set enabled     = true,
      schedule    = excluded.schedule,
      trigger     = excluded.trigger,
      action      = excluded.action,
      description = excluded.description;

-- ---------------------------------------------------------------------------
-- 3. Sentinel. A drain that commits nothing must not read like a drain that
--    has nothing to do.
--
--    Reports the eligible backlog and the oldest HUMAN-approved row per target
--    table, plus the two named marketplace blockers, so "0 committed" can
--    always be attributed. `targets_watched` is reported FIRST because zero
--    stranded rows over an empty watch list and a genuinely drained pipeline
--    return the same reassuring zeros.
-- ---------------------------------------------------------------------------
create or replace function public.staging_commit_drain_signals()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with watched(target_table, jobname) as (
    values ('venues','vn-drain-commit'), ('events','ev-drain-commit'),
           ('cities','city-drain-commit'), ('personalities','personality-drain-commit'),
           ('news_articles','news-drain-commit'), ('marketplace_listings','mp-drain-commit')
  ),
  elig as (
    select s.target_table,
           count(*) as eligible,
           count(*) filter (where s.review_status = 'approved') as human_approved,
           max(extract(epoch from (now() - s.created_at)) / 86400)
             filter (where s.review_status = 'approved') as oldest_human_days
      from public.ingestion_staging s
     where s.target_table in (select target_table from watched)
       and s.disposition in ('pending','approved')
       and s.ai_validation_status = 'approved'
       and (s.review_status in ('auto','approved') or s.review_status is null)
     group by 1
  )
  select jsonb_build_object(
    'targets_watched', (select count(*) from watched),
    'drains_scheduled', (select count(*) from watched w
                          join cron.job j on j.jobname = w.jobname and j.active),
    'missing_drains', coalesce((select jsonb_agg(w.jobname order by w.jobname)
                                  from watched w
                                 where not exists (select 1 from cron.job j
                                                    where j.jobname = w.jobname and j.active)), '[]'::jsonb),
    'by_target', coalesce((select jsonb_object_agg(w.target_table, jsonb_build_object(
                    'eligible', coalesce(e.eligible, 0),
                    'human_approved', coalesce(e.human_approved, 0),
                    'oldest_human_days', round(coalesce(e.oldest_human_days, 0)::numeric, 1),
                    'drain_scheduled', exists (select 1 from cron.job j
                                                where j.jobname = w.jobname and j.active)))
                    from watched w left join elig e on e.target_table = w.target_table), '{}'::jsonb),
    -- Named, not inferred: these are the two reasons the marketplace drain
    -- commits 0, and without them that 0 is unattributable.
    'marketplace_blocked_unclassified', (
      select count(*) from public.ingestion_staging
       where target_table = 'marketplace_listings' and disposition = 'pending'
         and ai_validation_status = 'approved' and classification_result is null),
    'marketplace_blocked_merge_candidate', (
      select count(*) from public.ingestion_staging
       where target_table = 'marketplace_listings' and disposition = 'pending'
         and ai_validation_status = 'approved' and dedup_status = 'merge_candidate')
  );
$fn$;

comment on function public.staging_commit_drain_signals() is
  'Per-target staging commit backlog and whether a drain cron exists for it. '
  'Reports targets_watched first: zero stranded rows over an empty watch list '
  'reads identically to a drained pipeline.';

revoke all on function public.staging_commit_drain_signals() from public, anon, authenticated;
grant execute on function public.staging_commit_drain_signals() to service_role;

-- ---------------------------------------------------------------------------
-- Postconditions. Reached state, so a re-run passes.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_sig     jsonb;
  v_missing jsonb;
  v_pub     int;
begin
  -- P1: the news batch exists and is NOT the job-scoped one.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'commit_news_staging_batch'
       and pg_get_function_identity_arguments(p.oid) = 'p_limit integer')
  then
    raise exception 'P1 failed: commit_news_staging_batch(integer) does not exist';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'commit_news_staging_batch'
       and pg_get_function_identity_arguments(p.oid) like '%p_job_id%')
  then
    raise exception 'P1 failed: commit_news_staging_batch took a job id — that is a DAG-run drain, not a backlog drain';
  end if;

  -- P2: both crons scheduled and active, and both registered. A job without a
  -- registry row reads as "unregistered" to the reconciler, which never kills
  -- it but also never manages it.
  if not exists (select 1 from cron.job where jobname = 'news-drain-commit' and active) then
    raise exception 'P2 failed: news-drain-commit is not an active cron job';
  end if;
  if not exists (select 1 from cron.job where jobname = 'mp-drain-commit' and active) then
    raise exception 'P2 failed: mp-drain-commit is not an active cron job';
  end if;
  if (select count(*) from public.admin_automations
       where slug in ('news_drain_commit','mp_drain_commit') and enabled) <> 2 then
    raise exception 'P2 failed: both drains must have an enabled admin_automations row';
  end if;

  -- P3: the sentinel runs, and says every watched target has a drain. This is
  -- the assertion the whole migration exists to make true.
  v_sig := public.staging_commit_drain_signals();
  if v_sig is null then
    raise exception 'P3 failed: staging_commit_drain_signals() returned null';
  end if;
  if (v_sig->>'targets_watched')::int < 6 then
    raise exception 'P3 failed: sentinel watches only % targets', v_sig->>'targets_watched';
  end if;
  v_missing := v_sig->'missing_drains';
  if jsonb_array_length(v_missing) <> 0 then
    raise exception 'P3 failed: these staging targets still have no commit drain: %', v_missing::text;
  end if;

  -- P4: anon and authenticated cannot read it. A SECURITY DEFINER aggregate
  -- granted to `authenticated` is granted to every member.
  if has_function_privilege('anon', 'public.staging_commit_drain_signals()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.staging_commit_drain_signals()', 'EXECUTE')
  then
    raise exception 'P4 failed: staging_commit_drain_signals is readable by anon or authenticated';
  end if;

  -- P5: the marketplace relevance gate is INTACT. The cheap way to make the
  -- marketplace drain publish something is to drop `classification_result IS
  -- NOT NULL`, which commits listings the LGBTQ+ classifier has never seen.
  select count(*) into v_pub
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'commit_marketplace_staging_batch'
     and position('classification_result IS NOT NULL' in p.prosrc) > 0;
  if v_pub <> 1 then
    raise exception 'P5 failed: commit_marketplace_staging_batch no longer requires classification_result';
  end if;

  raise notice 'news + marketplace commit drains scheduled; sentinel reports %', v_sig::text;
end $verify$;
