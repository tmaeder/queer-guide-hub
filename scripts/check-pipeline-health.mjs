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

  // Unreachable NEWS rows (2026-09-02). stale_pending_by_entity counts rows but
  // cannot say whether they are queued or DEAD, and that ambiguity is why this
  // hid: for months the number read as "the drain is behind" while the rows
  // could never move again. staging_unreachable_stats() applies the consumers'
  // own selectors, so it answers the question the count cannot.
  //
  // News-only on purpose: enrichment_status is read by exactly one commit RPC
  // (news_commit_staging_batch), so advancing it strands news and nothing else.
  // Applying the same test to every entity type reported 406 venue/marketplace
  // rows legitimately queued for HUMAN review as "unreachable". See the header
  // of 20261206100100 for the full measurement.
  //
  // recent_24h is a ZERO-INVARIANT and is checked before the stale thresholds
  // because it is the actionable half: it counts only rows stranded in the last
  // day, so it does not decay as the backlog ages and cannot be satisfied by
  // waiting. A historical backlog is a cleanup decision; a non-zero recent_24h
  // means a writer is stranding rows right now.
  let unreachable = null
  const unreachRes = await fetch(`${BASE}/rest/v1/rpc/staging_unreachable_stats`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!unreachRes.ok) {
    console.warn(`⚠ staging_unreachable_stats → HTTP ${unreachRes.status} (RPC missing? migration 20261206100100)`)
  } else {
    unreachable = await unreachRes.json()
    const recent = Number(unreachable.recent_24h ?? 0)
    const total = Number(unreachable.total ?? 0)
    if (recent > 0) {
      console.error(
        `✗ Staging stranding ACTIVE: ${recent} news row(s) became unreachable in the last 24h. ` +
        `A news row is unreachable when disposition=pending and enrichment_status='completed' ` +
        `with a quality_score but no quality_status — scored by pipeline-quality-score, never ` +
        `seen by pipeline-quality-enhance, the only caller of news_commit_staging_batch for an ` +
        `orphan row. Historical total ${total}. ` +
        `Prime suspect: a stage advancing enrichment_status on a row it did not enrich ` +
        `(see supabase/functions/_shared/quality-score-gating.ts).`,
      )
      process.exit(1)
    }
    if (total > 0) {
      console.warn(
        `⚠ ${total} unreachable news staging row(s) remain from before the fix ` +
        `(oldest ${unreachable.oldest_created_at}) — ` +
        `cleanup decision, not a live regression (recent_24h=0).`,
      )
    } else {
      console.log('✓ No unreachable news staging rows')
    }
  }

  // Context for the count-based thresholds below: how much of the stale number
  // is dead rather than merely slow. Without it the two are indistinguishable.
  const deadNote = unreachable ? ` — ${unreachable.total} of these are UNREACHABLE news rows` : ''
  if ((staleWorst && Number(staleWorst[1]) > 5000) || staleTotal > 10000) {
    console.error(`✗ Staging starvation: ${staleTotal} rows pending >48h (${JSON.stringify(stale)})${deadNote} — a drain/fill path is dead`)
    process.exit(1)
  }
  if (staleTotal > 3500) {
    console.warn(`⚠ Staging stale-pending rising: ${staleTotal} rows >48h (${JSON.stringify(stale)})${deadNote}`)
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
  // Accessibility contradictions (2026-08-30). An entity asserting both halves
  // of a pair — "wheelchair accessible" AND "not wheelchair accessible" — is
  // publishing a claim that strands a disabled person at a door either way.
  //
  // ZERO TOLERANCE, NO BASELINE, deliberately its own key rather than folded
  // into a broader quality count. Same reasoning as stranded_human_approved
  // directly above: 14 rows hid under a 3,500-row warn floor for 40 days, and
  // this corpus is smaller still, so any threshold at all would hide it.
  //
  // trg_venues_accessibility_resolve / trg_events_accessibility_resolve make
  // this state unreachable through INSERT and UPDATE, so a non-zero count is
  // never "some drift" — it is a writer that got around the trigger.
  //
  // The ABSENT key is reported separately from a zero count. Defaulting a
  // missing key to {} would make an undeployed sentinel indistinguishable from
  // a clean corpus — "no rows found" and "nobody looked" must never read the
  // same, which is the whole lesson of this file.
  const contradictions = hygiene.accessibility_contradictions
  if (contradictions === undefined) {
    console.warn('⚠ pipeline_hygiene_stats has no accessibility_contradictions key —')
    console.warn('  20261201100000 is not applied, so this check measured NOTHING (it did not pass).')
  }
  const contradictionTotal = Object.values(contradictions ?? {}).reduce((a, b) => a + Number(b), 0)
  if (contradictionTotal > 0) {
    console.error(`✗ ${contradictionTotal} entity/entities assert both halves of an accessibility pair (${JSON.stringify(contradictions)})`)
    console.error('  e.g. wheelchair-accessible AND not-wheelchair-accessible on one row.')
    console.error('  The BEFORE triggers make this unreachable, so a writer bypassed them —')
    console.error('  check for a COPY, a disabled trigger, or a new table with the column and no guard.')
    console.error('  Resolve with: UPDATE <t> SET accessibility_attributes = accessibility_attributes WHERE ...')
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
  if (contradictions !== undefined) {
    console.log('✓ Accessibility contradictions: 0 (zero-tolerance, no baseline)')
  }
}

// 5a. Wrong-entity Wikidata links on the glossary (2026-08-29). tag-enrichment-sweep
//     resolved a tag's QID by fetching the Wikipedia summary of its RAW NAME and
//     adopting whatever the redirect served — `golden-shower` → Cassia fistula,
//     `passing` → Q4 death, which then published ICPC-2 A96 through the weekly
//     tag_medical_codes_sync. 1,535 identifiers were cleared. The sweep's work-list is
//     `wikidata_id is null`, i.e. exactly those rows, so it revisits every one of them
//     and the cohort regrows the moment the guard in _shared/tag-wiki-guard.ts stops
//     holding. NO BASELINE ALLOWANCE: the RPC only reports a tag that re-acquired the
//     SAME id it was cleared of, which the guard makes unreachable, so one row means
//     the guard is gone — not that a human relinked something.
{
  const res = await fetch(`${BASE}/rest/v1/rpc/tag_wikidata_repair_regressions`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) {
    console.warn(`⚠ tag_wikidata_repair_regressions → HTTP ${res.status} (RPC missing?)`)
  } else {
    const rows = await res.json()
    if (Array.isArray(rows) && rows.length > 0) {
      console.error(`✗ ${rows.length} glossary tag(s) re-acquired the wrong Wikidata id they were cleared of:`)
      for (const r of rows.slice(0, 10)) console.error(`    /tags/${r.slug} → ${r.wikidata_id}`)
      console.error('  tag-enrichment-sweep is adopting name-resolved identities again.')
      console.error('  Check mayAdoptWikiIdentity in supabase/functions/_shared/tag-wiki-guard.ts is still called.')
      process.exit(1)
    }
    console.log('✓ No glossary tag has re-acquired a cleared wrong-entity Wikidata id')
  }
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

// 8. LLM provider chain (2026-08). NVIDIA sits in front of Cloudflare Workers
//    AI for every edge-function chat call, and it is NOT behind AI Gateway
//    (unsupported provider) — so llm_call_log.provider is the only place the
//    path is visible at all. Two failure modes are invisible without this:
//
//    (a) NVIDIA silently serving NOTHING. The rate limiter denies when its RPC
//        is unreachable, which is the safe direction but means a function
//        deployed ahead of its migration falls back 100% of the time and just
//        looks like a normal Cloudflare bill.
//    (b) The circuit stuck open long after the cause cleared.
//
//    WARN-ONLY, ALL OF IT. NVIDIA being unavailable is the fallback working
//    correctly, not an outage — nothing is broken, we are just paying
//    Cloudflare. Failing CI on it would train people to ignore this check.
{
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const res = await fetch(
    `${BASE}/rest/v1/llm_call_log?select=provider&called_at=gte.${since}`,
    { headers },
  )
  if (!res.ok) {
    console.warn(`⚠ llm_call_log probe → HTTP ${res.status} (provider column missing?)`)
  } else {
    const rows = await res.json()
    const by = {}
    for (const r of rows) by[r.provider ?? 'unattributed'] = (by[r.provider ?? 'unattributed'] ?? 0) + 1
    const total = rows.length
    const nvidia = by.nvidia ?? 0

    // `last_error` is NOT selected, because this table does not have that
    // column — and asking for it made the whole probe useless. PostgREST
    // answers an unknown select column with 400 42703, so `cb.ok` was always
    // false, `breaker` was always null, and failure mode (b) — the one named
    // four lines up — could never be reported. Worse, the block then fell
    // through to the ✓ branch and declared the chain healthy. Verified
    // 2026-09-02: `select=code,name` → 200, `select=code,name,last_error` → 400.
    //
    // The reason a breaker tripped lives in the edge-function logs, as
    // `[llm-router] nvidia <kind> ... status=<n>: <body>` — the router prints
    // it precisely because there is nowhere on this row to store it.
    const cb = await fetch(
      `${BASE}/rest/v1/api_circuit_breakers?select=state,open_until,failure_count&api_name=eq.llm.nvidia`,
      { headers },
    )
    // A failed probe must SAY so. Silently treating it as "no breaker row" is
    // how the bug above survived: the check reported success while measuring
    // nothing at all.
    if (!cb.ok) {
      console.warn(
        `⚠ llm.nvidia breaker probe → HTTP ${cb.status} — circuit state NOT checked ` +
          `(a column in the select probably does not exist)`,
      )
    }
    const breaker = cb.ok ? (await cb.json())[0] : null

    if (breaker?.state === 'open') {
      console.warn(
        `⚠ llm.nvidia circuit OPEN until ${breaker.open_until} after ` +
          `${breaker.failure_count} failure(s) — reason is in the edge-function logs: ` +
          `grep '[llm-router] nvidia'`,
      )
    } else if (total > 0 && nvidia === 0) {
      console.warn(
        `⚠ ${total} LLM calls in 24h and NOT ONE went to NVIDIA (${JSON.stringify(by)}) — ` +
          'check NVIDIA_API_KEY is set and that migration 20261014100000 (llm_rate_acquire) has applied; ' +
          'a missing rate RPC makes the router fall back silently, every time',
      )
    } else if (total === 0) {
      console.log('✓ LLM provider chain: no calls in 24h (nothing to report)')
    } else {
      console.log(
        `✓ LLM provider chain: ${((nvidia / total) * 100).toFixed(0)}% of ${total} calls on NVIDIA ` +
          `(${JSON.stringify(by)})`,
      )
    }
  }
}

// 9. Harm-reduction source freshness (2026-08-30). `substance_interactions`
//    backs /tags/interactions, which answers "can I combine these two?" — and
//    it had NO watcher of any kind. Nothing checked it because nothing wrote to
//    it: the 421 TripSit rows were loaded once by 20260909172500 and sat at
//    `fetched_at = 2026-08-15` with no cron, no registry row, and no sentinel.
//    A rating nobody re-checks is a claim we are making on our own authority
//    while printing someone else's name under it.
//
//    THE EXPECTED-FRESH SET IS DERIVED, NOT LISTED. `ingestion_sources` rows
//    whose `target_table` is this table ARE the automated paths, and their
//    `slug` is the value written into `substance_interactions.source`. Writing
//    `['tripsit']` here would repeat the mistake check 6b was added to fix — a
//    sentinel hardcoded to one slug while its own comment described the general
//    mechanism — and would leave a future eve&rave or FDA sync permanently
//    unwatched. A source with no registered path is a hand-curated import and
//    can only warn; it has nothing to be late for.
//
//    THE GATE ARMS ITSELF. Between this shipping and the first cron firing the
//    data is genuinely stale, so an unconditional fail would ship red and train
//    people to ignore it. `max(fetched_at) > automation registered_at` means
//    the path has demonstrably written at least once; until then it warns —
//    but only for two weeks, after which "registered and has never written a
//    row" is itself the failure.
{
  const STALE_FAIL_DAYS = 14 // two missed runs of a weekly schedule
  const days = (iso) => (Date.now() - new Date(iso).getTime()) / 864e5

  const sources = await get(
    'ingestion_sources?target_table=eq.substance_interactions&is_enabled=is.true&select=slug,name,schedule',
  )
  // An explicit limit with a guard, because PostgREST's default page is 1000 and
  // a silently truncated read would compute `max(fetched_at)` over a SUBSET —
  // which reads as staleness that is not there, or hides staleness that is. 476
  // rows today; the guard is what makes growing past the page size loud.
  const ROW_CAP = 5000
  const rows = await get(`substance_interactions?select=source,fetched_at&limit=${ROW_CAP}`)

  if (rows.length === 0) {
    console.error('✗ substance_interactions is EMPTY — /tags/interactions renders nothing')
    process.exit(1)
  }
  if (rows.length >= ROW_CAP) {
    console.error(`✗ substance_interactions read hit the ${ROW_CAP}-row cap — per-source max(fetched_at) is computed over a truncated set and cannot be trusted`)
    process.exit(1)
  }

  // POSITIVE CONTROL: this gate must be watching something.
  //
  // The source query filters `is_enabled=is.true`, and PostgREST answers a
  // no-match with an empty SET, not an error — so flipping that one flag makes
  // the loop below iterate zero times and the whole staleness gate pass while
  // checking nothing. The rows keep serving either way (476 today). The only
  // trace would be tripsit quietly joining the "no automated refresh path"
  // warn beside the hand-curated sources, which reads as normal.
  //
  // Note the flag is NOT the one the loop already handles: that branch reads
  // `admin_automations.enabled`, a different column in a different table. A
  // source disabled in `ingestion_sources` never reaches it.
  //
  // Failing is deliberate. Retiring the last automated refresher for
  // drug-interaction data should require saying so in code, not a silent flag
  // flip — same reasoning as "retiring a cron means retiring the registry row".
  if (sources.length === 0) {
    console.error(
      `✗ substance_interactions has ${rows.length} rows but NO enabled row in ingestion_sources — ` +
        `the staleness gate is disarmed and would have passed without checking anything`,
    )
    process.exit(1)
  }

  const newest = new Map()
  const counts = new Map()
  for (const r of rows) {
    counts.set(r.source, (counts.get(r.source) ?? 0) + 1)
    if (!newest.has(r.source) || r.fetched_at > newest.get(r.source)) newest.set(r.source, r.fetched_at)
  }

  // Registration time of each automated path, so "has it ever written?" is
  // answerable without depending on run tracking.
  const autoSlugs = sources.map((s) => s.slug)
  const registered = new Map()
  if (autoSlugs.length) {
    const regs = await get(
      `admin_automations?slug=in.(${autoSlugs.map((s) => `source_${s}`).join(',')})&select=slug,created_at,enabled`,
    )
    for (const a of regs) registered.set(a.slug.replace(/^source_/, ''), a)
  }

  const failures = []
  for (const src of sources) {
    const reg = registered.get(src.slug)
    if (!reg) {
      failures.push(`${src.slug}: ingestion_sources says it is automated but there is no source_${src.slug} automation — nothing schedules it`)
      continue
    }
    if (!reg.enabled) {
      failures.push(`${src.slug}: source_${src.slug} is DISABLED — check admin_automation_runs.summary for auto_paused before assuming a human did it`)
      continue
    }
    const last = newest.get(src.slug)
    if (!last) {
      failures.push(`${src.slug}: registered as a source but owns 0 rows in substance_interactions`)
      continue
    }
    const armed = new Date(last) > new Date(reg.created_at)
    const age = days(last)
    if (!armed) {
      if (days(reg.created_at) > STALE_FAIL_DAYS) {
        failures.push(
          `${src.slug}: registered ${days(reg.created_at).toFixed(0)}d ago and has never refreshed a row ` +
            `(newest fetched_at ${last}) — the cron is not firing`,
        )
      } else {
        console.warn(`⚠ ${src.slug} interactions: registered, first run pending (newest fetched_at ${last})`)
      }
      continue
    }
    if (age > STALE_FAIL_DAYS) {
      failures.push(`${src.slug}: newest fetched_at is ${age.toFixed(0)}d old (schedule ${src.schedule}, limit ${STALE_FAIL_DAYS}d)`)
    } else {
      console.log(`✓ ${src.slug} interactions fresh (${counts.get(src.slug)} rows, ${age.toFixed(1)}d old)`)
    }
  }

  // Sources in the data with no registered path. Not a failure — they are
  // one-off curated imports — but the age is worth saying out loud, because
  // "loaded once in August and forgotten" is the exact state this whole check
  // exists because of.
  const manual = [...newest.keys()].filter((s) => !sources.some((x) => x.slug === s))
  if (manual.length) {
    console.warn(
      `⚠ interaction sources with no automated refresh path: ` +
        manual.map((s) => `${s} (${counts.get(s)} rows, ${days(newest.get(s)).toFixed(0)}d old)`).join(', '),
    )
  }

  if (failures.length) {
    console.error(`✗ substance_interactions staleness:`)
    for (const f of failures) console.error(`    ${f}`)
    console.error('  /tags/interactions is serving ratings nobody has re-checked. Check the source_* cron and its breaker.')
    process.exit(1)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Circuit breakers — EVERY row, not just llm.nvidia
//
// This is the blind spot §3.7 of docs/architecture/open-data-integration.md
// names, and 2026-08-30 is what it costs: `eventbrite` reached **500 recorded
// failures with success_count 0** — never once green since the row was created
// on 2026-03-30 — while `admin_automations.ev_fill_eventbrite` reported
// `last_run_status='success'` every 6 hours and stayed `enabled`. The two
// layers disagree by construction whenever a source swallows its per-item
// errors and still returns HTTP 200: `recordFailure` has already run inside
// `withCircuitBreaker`, but a 200 RESETS `consecutive_failures`, so auto-pause
// is structurally unreachable and nothing anywhere goes red. The breaker row is
// the ONLY layer that told the truth, and nothing was reading it.
//
// The signal is `success_count === 0` — "this source has never once worked" —
// NOT the failure count. A high count on a source that also succeeds is a flaky
// upstream; zero successes ever is a dead endpoint, a rejected key, or a wrong
// URL, and it will not fix itself.
//
// DO NOT rewrite this to key on `last_success_at`. That column is only written
// by an explicit `recordSuccess()`, so a source that runs fine but never calls
// it stays frozen forever: `ilga_graphql` reads **2026-04-21** while ILGA
// actually imports nightly and updated 239/250 countries this morning. Judging
// freshness by that column is how a previous session concluded a four-month
// outage that was not happening.
{
  const res = await fetch(
    `${BASE}/rest/v1/api_circuit_breakers` +
      `?select=api_name,state,failure_count,success_count,last_failure_at&state=eq.open`,
    { headers },
  )
  if (!res.ok) {
    console.warn(`⚠ api_circuit_breakers probe → HTTP ${res.status}`)
  } else {
    const open = await res.json()

    // Known and deliberately not-fixed. A reason is mandatory: this map is the
    // difference between "we decided to live with it" and "nobody looked". Same
    // contract as the auto-paused-and-still-failing carve-out for automations —
    // a documented dead source warns; an UNDOCUMENTED one fails.
    const DISPOSITIONED = {
      eventbrite:
        'RETIRED 2026-08-30 (20261107100000). eventbriteapi.com/v3/events/search/ returns 404 ' +
        'with AND without credentials — the 404 precedes auth, so no key fixes it and there is no ' +
        'successor endpoint. Cron unscheduled, registry row disabled, and the events DAG node is a ' +
        'no-op skip via the RETIRED flag. Nothing calls it now, so this row should fall out of the ' +
        '24h window on its own; if it does NOT, something is still invoking source-eventbrite.',
      foursquare:
        'Legacy api.foursquare.com is sunset; a port to places-api.foursquare.com plus a paid ' +
        'service key is a product decision, not a repair. No cron — the callers are the ' +
        'venue-ingestion-unified (03:00) and hotel-ingestion-pipeline (04:00) DAG nodes. Since ' +
        '2026-08-30 a rejected credential is an InvalidCredentialsError raised OUTSIDE the breaker ' +
        'and records a SUCCESS, so this row should self-clear on the next venue DAG run.',
      awin:
        'UNFIXED, tracked. AWIN_FEED_URL is set (an unset one would return a skipped 200 before ' +
        'the breaker is touched) but the feed does not answer 2xx. mp_fill_awin auto-paused on ' +
        '2026-08-19 — correctly, because source-awin does NOT swallow its breaker error — yet the ' +
        'marketplace-ingestion DAG (04:00) still calls it, which is why the count keeps moving ' +
        'after the pause. Pausing a fill cron does not stop a DAG node.',
    }

    const dayAgo = Date.now() - 86400_000
    const neverWorked = open.filter(
      (b) => (b.success_count ?? 0) === 0 && b.last_failure_at && Date.parse(b.last_failure_at) >= dayAgo,
    )
    const undocumented = neverWorked.filter((b) => !DISPOSITIONED[b.api_name])

    for (const b of open) {
      const tag = DISPOSITIONED[b.api_name] ? 'known' : 'UNDOCUMENTED'
      console.log(
        `  · breaker OPEN [${tag}] ${b.api_name}: ${b.failure_count} failures, ` +
          `${b.success_count ?? 0} successes, last failure ${b.last_failure_at ?? 'never'}`,
      )
    }
    for (const b of neverWorked.filter((x) => DISPOSITIONED[x.api_name])) {
      console.warn(`⚠ ${b.api_name} has never succeeded and is still being called — ${DISPOSITIONED[b.api_name]}`)
    }

    if (undocumented.length > 0) {
      for (const b of undocumented) {
        console.error(
          `✗ ${b.api_name}: circuit OPEN, ${b.failure_count} failures, NEVER succeeded ` +
            `(success_count 0), and still failing as of ${b.last_failure_at}.`,
        )
      }
      console.error(
        '✗ A source that has never once succeeded is being called on a schedule and NOTHING else ' +
          'reports it — the calling automation may well read last_run_status=success, because a ' +
          'source that swallows per-item errors still returns HTTP 200. Find the caller ' +
          "(cron AND `select name from pipeline_definitions where nodes::text ilike '%source-<x>%'` " +
          '— a paused cron does not stop a DAG node), then either repair it or retire it and add a ' +
          'reason to DISPOSITIONED above.',
      )
      process.exit(1)
    }
    if (open.length === 0) console.log('✓ No circuit breakers open')
    else console.log(`✓ ${open.length} breaker(s) open, all with a recorded disposition`)
  }
}

console.log('✓ Pipeline health check passed')
