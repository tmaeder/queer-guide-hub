#!/usr/bin/env node
/**
 * Nightly pipeline health check.
 * Called by .github/workflows/pipeline-health.yml
 * Exit 1 if any enabled pipeline only failed (no completions) in last 24h.
 */

const BASE = process.env.SUPABASE_URL
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!BASE || !KEY) {
  console.warn('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set — skipping pipeline health check')
  process.exit(0)
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const since24h  = new Date(Date.now() - 86400_000).toISOString()
const since7d   = new Date(Date.now() - 7 * 86400_000).toISOString()

async function get(path) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { headers })
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`)
  return res.json()
}

// 1. Open alerts
const alerts = await get('pipeline_health_alerts?resolved_at=is.null&select=kind,subject,first_seen_at')
if (alerts.length > 0) {
  console.warn(`⚠ ${alerts.length} open health alert(s):`)
  for (const a of alerts) console.warn(`  - [${a.kind}] ${a.subject} since ${a.first_seen_at}`)
} else {
  console.log('✓ No open health alerts')
}

// 2. Daily pipeline runs (last 24h)
const runs24h = await get(`pipeline_runs?created_at=gte.${encodeURIComponent(since24h)}&select=pipeline_name,status`)
const completed24h = new Set(runs24h.filter(r => r.status === 'completed').map(r => r.pipeline_name))
const failed24h    = new Set(runs24h.filter(r => r.status === 'failed').map(r => r.pipeline_name))
const onlyFailed   = [...failed24h].filter(n => !completed24h.has(n))

console.log(`✓ Pipelines completed in last 24h: ${[...completed24h].join(', ') || 'none'}`)

if (onlyFailed.length > 0) {
  console.error(`✗ Pipelines with ONLY failures in last 24h: ${onlyFailed.join(', ')}`)
  process.exit(1)
}

// 3. Daily pipelines — warn if missing from 24h window
const dailyExpected = [
  'news-ingestion', 'venue-ingestion-unified', 'events-ingestion-bulletproof',
  'marketplace-ingestion', 'personality-ingestion', 'hotel-ingestion-pipeline',
]
const missingDaily = dailyExpected.filter(n => runs24h.length > 0 && !completed24h.has(n) && !failed24h.has(n))
if (missingDaily.length > 0) {
  console.warn(`⚠ Daily pipelines with no runs in 24h: ${missingDaily.join(', ')}`)
}

// 4. Weekly pipelines (city, country, tags) — warn if no run in last 7 days
const runs7d = await get(`pipeline_runs?created_at=gte.${encodeURIComponent(since7d)}&select=pipeline_name,status`)
const completed7d = new Set(runs7d.filter(r => r.status === 'completed').map(r => r.pipeline_name))
const weeklyExpected = ['city-ingestion', 'country-ingestion', 'tags-ingestion']
const missingWeekly = weeklyExpected.filter(n => !completed7d.has(n))
if (missingWeekly.length > 0) {
  console.warn(`⚠ Weekly pipelines with no completed run in 7 days: ${missingWeekly.join(', ')}`)
} else {
  console.log(`✓ Weekly pipelines completed in last 7 days: ${weeklyExpected.join(', ')}`)
}

// 5. Cron + staging hygiene (P0 simplification guards, 2026-07-26)
const hygieneRes = await fetch(`${BASE}/rest/v1/rpc/pipeline_hygiene_stats`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: '{}',
})
if (!hygieneRes.ok) {
  console.warn(`⚠ pipeline_hygiene_stats → HTTP ${hygieneRes.status} (RPC missing?)`)
} else {
  const hygiene = await hygieneRes.json()
  const legacy = hygiene.legacy_cron_jobs ?? []
  if (legacy.length > 0) {
    console.error(`✗ Legacy pipeline crons resurrected: ${legacy.join(', ')}`)
    process.exit(1)
  }
  if ((hygiene.i18n_percombo_cron_count ?? 0) > 0) {
    console.error(`✗ Per-combo i18n crons re-appeared (${hygiene.i18n_percombo_cron_count}) — the i18n_translation_dispatch job replaced them`)
    process.exit(1)
  }
  const pending = hygiene.staging_pending_review ?? 0
  if (pending > 5000) {
    console.error(`✗ ingestion_staging pending_review backlog at ${pending} (limit 5000) — auto-triage sweeps are falling behind`)
    process.exit(1)
  }
  const unregistered = hygiene.unregistered_cron_jobs ?? []
  if (unregistered.length > 0) {
    console.error(`✗ Cron jobs with no admin_automations registry row: ${unregistered.join(', ')} — register them (P1 registry-of-record policy)`)
    process.exit(1)
  }
  // Starved-path sentinel (overhaul P2): rows stuck mid-pipeline >48h. Live
  // baseline at introduction was ~2.8k (news ~1.9k, marketplace ~0.9k, oldest
  // from June) — thresholds sit above that so only NEW starvation fails.
  const stale = hygiene.stale_pending_by_entity ?? {}
  const staleTotal = Object.values(stale).reduce((a, b) => a + Number(b), 0)
  const staleWorst = Object.entries(stale).sort((a, b) => Number(b[1]) - Number(a[1]))[0]
  if ((staleWorst && Number(staleWorst[1]) > 5000) || staleTotal > 10000) {
    console.error(`✗ Staging starvation: ${staleTotal} rows pending >48h (${JSON.stringify(stale)}) — a drain/fill path is dead`)
    process.exit(1)
  }
  if (staleTotal > 3500) {
    console.warn(`⚠ Staging stale-pending rising: ${staleTotal} rows >48h (${JSON.stringify(stale)})`)
  }
  // Human decisions the pipeline threw away (2026-08-22). A row that is
  // disposition=pending AND review_status=approved AND ai_validation_status
  // <> approved is stuck by definition: every stage from dedup to commit reads
  // ai_validation_status, so nothing will ever look at it again. There is no
  // baseline allowance — trg_staging_human_approval_clears_validation makes the
  // state unreachable, so a single row means a writer bypassed the trigger (an
  // INSERT, or a hard validator rejection nobody may auto-override).
  //
  // Deliberately NOT folded into the stale_pending thresholds above: 14 event
  // rows sat under that 3,500-row warn floor for 40 days.
  const stranded = hygiene.stranded_human_approved ?? {}
  const strandedTotal = Object.values(stranded).reduce((a, b) => a + Number(b), 0)
  if (strandedTotal > 0) {
    console.error(`✗ ${strandedTotal} staging row(s) approved by a human but blocked from every downstream stage (${JSON.stringify(stranded)})`)
    console.error('  They read ai_validation_status <> approved while review_status = approved.')
    console.error('  Find the writer that set review_status without an UPDATE the promotion trigger can see.')
    process.exit(1)
  }
  // City duplication (2026-08-25). Every unique key on `cities` keys on the
  // string, so exact-name duplicates are already impossible — measured 0 groups
  // over 5,552 live rows — and the class that survives is "same place, different
  // string": Kapstadt beside Cape Town, Teheran beside Tehran. Nothing counted
  // it before this block, so a writer that starts minting exonyms again was
  // invisible.
  //
  // Baselines are the live values at introduction. near_pairs FAILS on growth
  // rather than on an absolute number, because the standing 196 are existing
  // work for the coordinate sweep arm and clearing them is a separate,
  // human-reviewed job — what must never happen is the number going UP.
  const city = hygiene.city_dup_signals ?? {}
  const CITY_NEAR_PAIR_BASELINE = 196
  const nearPairs = Number(city.near_pairs ?? 0)
  if (nearPairs > CITY_NEAR_PAIR_BASELINE) {
    console.error(`✗ City near-duplicate pairs rose to ${nearPairs} (baseline ${CITY_NEAR_PAIR_BASELINE})`)
    console.error('  A path is creating cities without going through city_resolve_or_create.')
    console.error('  Check the five writers: backfill-venue-cities, resolve-or-create-city,')
    console.error('  venue-import-helpers, commit_city_staging_item, useCMSEditor.')
    process.exit(1)
  }
  // The queue is the sink for every refusal. A refusal nobody drains is a
  // silent loss, which is the exact failure refusing exists to prevent — so
  // this is about the drain being ALIVE, not about the depth. Phrased as
  // depth AND age together: a real import burst is legitimately deep for a
  // few minutes; a dead drain is deep and old.
  const qPending = Number(city.resolve_queue_pending ?? 0)
  const qOldestH = Number(city.resolve_queue_oldest_pending_hours ?? 0)
  if (qPending > 50 && qOldestH > 48) {
    console.error(`✗ city_resolve_queue: ${qPending} pending, oldest ${qOldestH}h — the drain is dead`)
    console.error('  Expected job: city_resolve_drain (*/15). Check admin_automations.enabled and cron.job.')
    process.exit(1)
  }
  // Warnings only: these are the machinery that makes prevention structural,
  // and they improve over nights, not over one CI run. A stall is worth saying
  // out loud — city-factual-backfill once filled nothing for 36 days without
  // anything going red.
  const qidPct = Number(city.qid_coverage_pct ?? 0)
  if (qidPct < 51) {
    console.warn(`⚠ City Wikidata coverage fell to ${qidPct}% (was 51% at baseline) — city_qid_gap_link may be stalled`)
  }
  if (Number(city.alias_rows ?? 0) <= 386 && Number(city.cities_without_aliases ?? 0) > 0) {
    console.warn(`⚠ city_aliases still at ${city.alias_rows} rows with ${city.cities_without_aliases} cities uncovered — city_alias_harvest has not run`)
  }
  console.log(`✓ Cron hygiene clean (${hygiene.cron_total} active jobs); staging pending_review=${pending}, stale_pending=${staleTotal}`)
  console.log(`✓ City dup signals: near_pairs=${nearPairs}, qid=${qidPct}%, aliases=${city.alias_rows}, queue=${qPending}`)
}

// 5b. Automation run-tracking gaps (2026-09). Until this landed, 142 of 144
//     enabled cron automations had never recorded a run, so consecutive_failures
//     never moved and auto-pause could not fire. These two checks keep it that
//     way only if it stays true.
{
  const res = await fetch(`${BASE}/rest/v1/rpc/admin_automation_tracking_gaps`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) {
    console.warn(`⚠ admin_automation_tracking_gaps → HTTP ${res.status} (RPC missing?)`)
  } else {
    const gaps = await res.json()

    // A cron command that reaches net.http_post through a helper we have NOT
    // patched would be projected from cron.job_run_details as a success the
    // moment the request is enqueued — a false green that also resets
    // consecutive_failures. That is strictly worse than the blank column this
    // system replaced, so it fails the build rather than warning.
    const untracked = gaps.untracked_http_dispatchers ?? []
    if (untracked.length > 0) {
      console.error(
        `✗ Automations dispatching HTTP through an untracked helper: ${untracked.join(', ')} — ` +
          `route the helper through public.automation_http_post and add it to admin_automation_tracked_callers`,
      )
      process.exit(1)
    }

    // Runs left open long past any pg_net timeout mean the reaper is not
    // running; net._http_response is only retained ~6h, so a stalled reaper
    // loses the evidence permanently rather than catching up later.
    const openRuns = Number(gaps.open_runs_over_1h ?? 0)
    if (openRuns > 50) {
      console.error(`✗ ${openRuns} automation runs open >1h — admin_automation_reap is not running`)
      process.exit(1)
    }

    // A client-side pg_net timeout is absence of evidence, not evidence of
    // failure, so it is recorded as 'partial' and deliberately does NOT
    // auto-pause. That makes this warning the only thing standing between an
    // unverifiable job and looking healthy: nobody has ever seen one of its
    // outcomes. Fix per job by raising timeout_milliseconds in the registered
    // command until the response fits inside it.
    const unverifiable = gaps.unverifiable_automations ?? []
    if (unverifiable.length > 0) {
      console.warn(
        `⚠ ${unverifiable.length} automation(s) whose every run in 24h was unverifiable ` +
          `(client-side timeout / lost request): ${unverifiable.join(', ')} — raise timeout_milliseconds`,
      )
    }

    const silent = gaps.silent_automations ?? []
    if (silent.length > 0) {
      console.warn(`⚠ ${silent.length} at-most-daily automation(s) with no recorded run in 48h: ${silent.slice(0, 15).join(', ')}${silent.length > 15 ? ', …' : ''}`)
    } else {
      console.log('✓ Every at-most-daily automation recorded a run in the last 48h')
    }
  }
}

// 6. Search reindex drain (P1 overhaul, 2026-08): entity writes enqueue into
//    search_reindex_queue; search_reindex_drain applies them every minute. When
//    it stops, nothing reaches search_documents and every newly committed
//    venue/event/city is invisible to /search, autocomplete and the
//    recommendation RPCs while the site itself looks entirely normal.
//
//    LIVENESS, NOT DEPTH, is the signal. This check used to fail only on
//    `depth > 25000 && oldestMin > 60`, and on 2026-08-22 it sat through a real
//    freeze: the drain had been auto-paused for 70 minutes with 9,565 rows
//    queued, which cleared the age half and missed the depth half, so it warned
//    and passed. Depth cannot decide this in either direction — a HEALTHY drain
//    working through a 25k backfill at 400 rows/min legitimately leaves the
//    oldest row an hour old, while a DEAD drain on a quiet day never gets deep
//    at all. Whether it ran is unambiguous, so that is what fails the build.
{
  const drain = await get('admin_automations?slug=eq.search_reindex_drain&select=enabled')
  if (!drain.length) {
    // Not "nothing to check": the registry row IS the schedule for this job
    // (sync_automations_to_cron drives pg_cron from it), so a missing row means
    // nothing runs the drain at all.
    console.error('✗ no admin_automations row for search_reindex_drain — nothing schedules the drain')
    process.exit(1)
  }
  if (!drain[0].enabled) {
    console.error('✗ search_reindex_drain is DISABLED — the whole search index is frozen')
    console.error('  Check admin_automation_runs.summary for `auto_paused` before assuming a human did it:')
    console.error('  a later success resets consecutive_failures/last_run_status but never re-enables the row.')
    process.exit(1)
  }

  const stats = await get('search_reindex_drain_stats?select=ran_at,failed&limit=1')
  if (!stats.length) {
    console.warn('⚠ search_reindex_drain_stats empty — the drain has never run')
  } else {
    const staleMin = (Date.now() - new Date(stats[0].ran_at).getTime()) / 60000
    if (staleMin > 15) {
      console.error(`✗ search_reindex_drain last ran ${staleMin.toFixed(0)}min ago (schedule is every minute) — index frozen`)
      process.exit(1)
    }
    if (stats[0].failed > 0) {
      console.warn(`⚠ last drain re-queued ${stats[0].failed} row(s) after per-row errors`)
    }
  }

  const res = await fetch(`${BASE}/rest/v1/search_reindex_queue?select=created_at&order=id.asc&limit=1`, {
    headers: { ...headers, Prefer: 'count=exact' },
  })
  if (!res.ok) {
    console.warn(`⚠ search_reindex_queue probe → HTTP ${res.status} (pre-P1 schema?)`)
  } else {
    const depth = Number(res.headers.get('content-range')?.split('/')[1] ?? 0)
    const rows = await res.json()
    const oldestMin = rows.length ? (Date.now() - new Date(rows[0].created_at).getTime()) / 60000 : 0
    if (depth > 5000 || oldestMin > 15) {
      console.warn(`⚠ search_reindex_queue busy: depth=${depth}, oldest=${oldestMin.toFixed(0)}min (backfill in flight is normal)`)
    } else {
      console.log(`✓ search reindex drain healthy (depth=${depth})`)
    }
  }
}

// 6b. Auto-paused-then-recovered automations, for EVERY slug (2026-08-25).
//
//    Check 6 above has described this exact mechanism in prose since 2026-08-22
//    — "a later success resets consecutive_failures/last_run_status but never
//    re-enables the row" — while testing it for ONE automation out of ~240.
//    Four days later the same mechanism took `workflow_dispatcher_1min` out and
//    nothing noticed for 40 hours: it is the sole stepper for every DAG, so all
//    seven ingestion pipelines stopped mid-run, news/events/venue ingest went to
//    ~0 rows/day, and push notifications died with it. It was the THIRD
//    occurrence (search_reindex_drain 2026-08-22, admin_automation_reap
//    2026-08-16). A sentinel that names the failure mode but scopes itself to a
//    single slug is how a known bug keeps landing.
//
//    THE PAUSE ERASES ITS OWN EVIDENCE, which is what makes this hard to see by
//    hand: auto-pause sets enabled=false, then any later success resets
//    consecutive_failures to 0 and last_run_status to 'success' WITHOUT
//    re-enabling. The row then reads exactly like a deliberate human retirement.
//    The only durable record is `summary.auto_paused` on the historical run row,
//    so that — not the automation row — is what this reads.
//
//    FAIL vs WARN is the whole design. "Disabled" alone cannot fail the build:
//    plenty of rows are legitimately retired or genuinely broken
//    (marketplace_variant_backfill sits at 288 real consecutive failures and
//    SHOULD stay paused). The false-disable has a distinct shape — it was
//    auto-paused, and then it went back to succeeding, and it is still off:
//
//        auto_paused in history  AND  consecutive_failures = 0
//                                AND  last_run_status = 'success'
//                                AND  enabled = false
//
//    Verified against production 2026-08-25: this rule flags exactly the
//    false-disables (it caught marketplace_taxonomy_backfill, an 8th victim of
//    the same sweep that the by-hand restore had missed — 21,613 listings still
//    unclassified, so demonstrably not a retirement) and leaves all ten
//    genuinely-paused/retired rows on the warn path.
{
  const since = new Date(Date.now() - 14 * 864e5).toISOString()
  const disabled = await get('admin_automations?enabled=is.false&select=id,slug,consecutive_failures,last_run_status')
  if (disabled.length) {
    const ids = disabled.map((a) => a.id).join(',')
    const pausedRuns = await get(
      `admin_automation_runs?automation_id=in.(${ids})&summary->>auto_paused=eq.true&started_at=gte.${since}&select=automation_id`,
    )
    const pausedIds = new Set(pausedRuns.map((r) => r.automation_id))
    const suspects = disabled.filter((a) => pausedIds.has(a.id))
    // Recovered but still switched off — the row's own columns say "healthy".
    const falseDisabled = suspects.filter(
      (a) => Number(a.consecutive_failures) === 0 && a.last_run_status === 'success',
    )
    const stillFailing = suspects.filter((a) => !falseDisabled.includes(a))

    if (stillFailing.length) {
      console.warn(
        `⚠ ${stillFailing.length} automation(s) auto-paused and still failing (expected to stay off): ` +
          stillFailing.map((a) => `${a.slug}(${a.consecutive_failures})`).join(', '),
      )
    }
    if (falseDisabled.length) {
      console.error(
        `✗ ${falseDisabled.length} automation(s) auto-paused, then RECOVERED, and never re-enabled: ` +
          falseDisabled.map((a) => a.slug).join(', '),
      )
      console.error('  Their last recorded run SUCCEEDED — the pause was a transient blip, not a decision.')
      console.error('  They are off and, if pg_cron has already been reconciled, unscheduled as well.')
      console.error('  Restore: UPDATE admin_automations SET enabled=true, consecutive_failures=0 WHERE slug IN (…);')
      console.error("  then SELECT sync_automations_to_cron(true) — and CHECK its `recreated` list actually names them:")
      console.error("  an action of type 'rpc' carries no action.command, so the reconciler CANNOT reschedule it and")
      console.error('  the cron must be recreated from the migration that first scheduled it.')
      process.exit(1)
    }
    if (!falseDisabled.length) {
      console.log(`✓ No auto-paused-then-recovered automations (${disabled.length} disabled row(s) checked)`)
    }
  }
}

// 7. Embedding drain (2026-08). `workers/ingest` is the ONLY writer of the
//    1024-dim vectors in content_embeddings, which feed search_embeddings — the
//    vector arm of search_hybrid. Nothing checked it, and it had been starving
//    for months: sized as a "backstop" for a Supabase DB webhook that does not
//    exist (zero triggers reach net.http_request), at 15 rows / 10 min for all
//    eleven entity types, with a newest-first work list so the tail was never
//    reached. 6,209 marketplace listings were keyword-searchable and
//    vector-invisible; nothing anywhere said so.
//
//    LIVENESS FAILS, DEPTH ONLY WARNS — the same rule the search_reindex_drain
//    check above had to learn. A big import legitimately makes this deep and
//    old for a few hours, so depth cannot decide it; but workers/ingest is the
//    sole writer of the table, so "nothing has been embedded in 30 minutes
//    while work is queued" is unambiguous.
{
  const res = await fetch(`${BASE}/rest/v1/rpc/get_stale_embedding_backlog`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) {
    console.warn(`⚠ get_stale_embedding_backlog → HTTP ${res.status} (RPC missing?)`)
  } else {
    const b = await res.json()
    const missing = Number(b.total_missing ?? 0)
    const stale = Number(b.total_stale ?? 0)
    const depth = missing + stale
    const lastMin = b.last_embedded_at
      ? (Date.now() - new Date(b.last_embedded_at).getTime()) / 60000
      : Infinity

    // The cron is every 5 minutes; 30 covers a couple of missed runs.
    if (depth > 0 && lastMin > 30) {
      console.error(
        `✗ embedding drain silent for ${Number.isFinite(lastMin) ? lastMin.toFixed(0) + 'min' : 'ever'} ` +
          `with ${depth} rows queued (${missing} never embedded) — new content is vector-invisible`,
      )
      console.error('  Check the queer-guide-search-ingest cron in the Cloudflare dashboard.')
      console.error('  A 1027 on any *.queer.guide worker means the account request quota, not this worker.')
      process.exit(1)
    }

    const oldestH = b.oldest_dirty_at
      ? (Date.now() - new Date(b.oldest_dirty_at).getTime()) / 3600000
      : 0
    // No baseline allowance is set here yet on purpose: at 200 rows every 5
    // minutes the drain clears 57,600/day, so once the 2026-08 backlog is gone
    // a steady-state depth in the thousands means intake outran the drain and
    // DRAIN_LIMIT needs raising. Measure a week of steady state before turning
    // either of these into a hard failure.
    if (missing > 5000 || oldestH > 24) {
      console.warn(
        `⚠ embedding backlog: ${missing} missing + ${stale} stale, head of queue ${oldestH.toFixed(0)}h old ` +
          `(${JSON.stringify(b.missing ?? {})}) — raise DRAIN_LIMIT if this is steady state, not an import`,
      )
    } else {
      console.log(`✓ embedding drain healthy (depth=${depth}, last write ${lastMin.toFixed(0)}min ago)`)
    }
  }
}

console.log('✓ Pipeline health check passed')
