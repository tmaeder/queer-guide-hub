#!/usr/bin/env node
// Replace resized-derivative product images with the merchant's own original.
//
// Context: a scraper stores whatever `<img src>` a product grid rendered, and
// several storefront platforms render a THUMBNAIL there. Measured on this
// corpus, mr-s-leather's covers are 135×135 because every one is a Magento
// cache derivative, and invinciblerubber's are 840×840 because OpenCart names
// the resize in the path. 7,409 of 283,842 listing image URLs (2.6%) carry
// that evidence; the other 97.4% are already the merchant's best copy and this
// script deliberately leaves them alone — see the audit script for why "the
// images look soft" is usually a fact about the merchant, not about us.
//
// The rewrite rules and the accept/reject gate live in
// supabase/functions/_shared/image-upscale.ts so the mirror function and this
// driver cannot drift. Nothing here trusts a rule: every candidate is fetched
// and MEASURED, and only a strictly better picture is kept.
//
// ── What gets written ──────────────────────────────────────────────────────
// Two rows per upgraded image, and BOTH are required:
//   1. `marketplace_listings.images` — the merchant URL the card falls back to.
//   2. `image_asset_links` → a fresh `image_assets` row for the new URL.
// Repointing the link is the load-bearing half. `Image.tsx` prefers
// `optimized_url` over `listing.images[0]`, so upgrading the listing alone
// leaves the OLD 135px R2 mirror winning the ladder and nothing changes on
// screen. The new asset is written `optimization_status='pending'`, which
// `useEntityImageAssets` skips by design — so the card serves the upgraded
// merchant URL immediately and switches to R2 whenever optimize-images-batch
// next runs. The old asset row is left alone: it may be linked from elsewhere,
// and an unlinked asset is harmless.
//
// Writing requires an explicit `--apply`; without it the script measures and
// reports and touches nothing. That is the opposite of the usual convention on
// purpose — this rewrites image URLs on live listings, the failure mode is
// silent (a wrong-but-plausible photo), and the useful mode is the read-only
// one. A default-write script also means an accidental `import` of this module
// starts a sweep, which is exactly what happened during development, hence the
// entry-point guard at the bottom.
//
// Usage:
//   node scripts/data-quality/upgrade-marketplace-images.mjs --limit 200
//   node scripts/data-quality/upgrade-marketplace-images.mjs --source mrsleather --apply
//   node scripts/data-quality/upgrade-marketplace-images.mjs --all --apply

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createHostLimiter, probeImage } from '../lib/image-probe.mjs'
import {
  isRealUpgrade,
  looksLikePlaceholder,
  upscaleCandidates,
} from '../../supabase/functions/_shared/image-upscale.ts'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const DRY_RUN = !args.includes('--apply')
const LIMIT = args.includes('--all') ? null : Number(flag('limit', 200))
const SOURCE = flag('source', null)
const RECHECK = args.includes('--recheck')
// Merchants rate-limit, and being rate-limited mid-sweep is worse than being
// slow: mr-s-leather and misterb both answer 403 under a 16-thread probe and
// 200 at a walking pace, and a 403 is indistinguishable from "no bigger copy
// exists" unless you already know to re-test. 6 is measured-safe on both.
const CONCURRENCY = Number(flag('concurrency', 6))

// A candidate whose bytes recur across unrelated products is a storefront's
// "no image available" asset, not a better photo of this item. mr-s-leather
// serves a 500×600 placeholder, byte-identical at 6,678 B, for every product
// whose real file is missing. The rules never guess filenames, so this should
// stay at zero — it is a backstop, and if it fires the rule that produced the
// hash needs re-examining rather than the threshold needs raising.
const PLACEHOLDER_MIN_HITS = 5

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim()
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8')
}
const TOKEN = token()

/**
 * One statement against the management API, retried on transport faults.
 *
 * The write phase is a loop of hundreds of statements, and a run that dies
 * partway wastes all the merchant requests that produced it. Two faults were
 * measured doing exactly that, and they need DIFFERENT treatment:
 *
 *   - transport (`getaddrinfo` against api.supabase.com) — one blip killed a
 *     pass that had already measured 300 listings;
 *   - `429 ThrottlerException` — the management API rate-limits a few hundred
 *     statements in quick succession, which killed a pass at 200 of 400
 *     writes.
 *
 * So 429 and 5xx retry with backoff; every other HTTP status does not, because
 * a 4xx there means the SQL is wrong and repeating it just fails slower.
 */
const RETRYABLE_STATUS = /^mgmt API (429|5\d\d):/

async function sql(query, attempt = 0) {
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) throw new Error(`mgmt API ${res.status}: ${(await res.text()).slice(0, 400)}`)
    return res.json()
  } catch (e) {
    const msg = String(e?.message ?? '')
    const isHttp = msg.startsWith('mgmt API ')
    const retryable = !isHttp || RETRYABLE_STATUS.test(msg)
    if (!retryable || attempt >= 6) throw e
    // 429 needs a real pause, not a 1s nudge: the limiter is per-minute.
    const base = RETRYABLE_STATUS.test(msg) && msg.includes('429') ? 5000 : 1000
    await new Promise((r) => setTimeout(r, base * 2 ** attempt))
    return sql(query, attempt + 1)
  }
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`

const perHost = createHostLimiter({ gapMs: Number(flag('host-gap', 250)) })
const probe = (url) => perHost(url, () => probeImage(url))

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++
        if (i >= items.length) return
        out[i] = await fn(items[i], i)
      }
    }),
  )
  return out
}

/**
 * Best verified upgrade for one image URL, or null.
 *
 * Candidates are tried in rule order and the WIDEST verified winner is kept,
 * not the first — a URL can carry two independent shrinkers (a Shopify size
 * token AND a `width=` param) and they do not always agree on which is bigger.
 */
async function bestUpgrade(current) {
  const candidates = upscaleCandidates(current).filter((c) => !looksLikePlaceholder(c.url))
  if (!candidates.length) return null

  const now = await probe(current)
  // Without a baseline there is nothing to compare against, and "bigger than
  // unknown" is not a judgement. A merchant that is briefly rate-limiting us
  // must not have its whole catalogue rewritten on a guess.
  if (now.error) return { skipped: `current_${now.error}` }

  let best = null
  for (const c of candidates) {
    const got = await probe(c.url)
    if (got.error) continue
    if (!isRealUpgrade(now, got, c.preservesAspect)) continue
    if (!best || got.w > best.probe.w) best = { ...c, probe: got }
  }
  return best ? { from: now, to: best } : null
}

async function main() {
  const filters = [
    `l.status = 'active'`,
    `l.images is not null`,
    SOURCE ? `l.source_type = ${lit(SOURCE)}` : null,
    // Terminal sentinel. A listing whose derivative URL has no bigger sibling
    // stays matching the derivative filter forever, so without this the
    // work-list never shrinks and every pass re-measures the same unfixable
    // head — measured on invinciblerubber, where three passes over `order by
    // id limit 300` kept reporting 521 remaining because 246 of each 300 have
    // no larger original. Same starvation as the city-fields selector before
    // `data_unavailable` was introduced. `--recheck` clears the stamp's effect
    // for when a rule changes and past verdicts are worth revisiting.
    RECHECK ? null : `not (l.attributes ? 'image_upscale')`,
    // Only rows carrying evidence of a derivative. Mirrors the rules in
    // image-upscale.ts; a row that slips through simply yields no candidates.
    `exists (
       select 1 from unnest(l.images) im
       where im ~ '/media/catalog/product/cache/[0-9a-f]{16,}/'
          or im ~ '/image/cache/.+-\\d{2,4}x\\d{2,4}\\.'
          or im ~ '/wp-content/uploads/.+-\\d{2,4}x\\d{2,4}\\.'
          or (im ~ '[?&]width=' and (im like '%cdn.shopify.com%' or im like '%/cdn/shop/%'))
          or (im ~ '[?&](w|h|imwidth|sw|maxwidth)=' and im not like '%cdn.shopify.com%')
     )`,
  ].filter(Boolean)

  const rows = await sql(`
    select l.id, l.source_type, l.images
    from marketplace_listings l
    where ${filters.join(' and ')}
    order by l.id
    ${LIMIT ? `limit ${LIMIT}` : ''}`)

  console.log(`${rows.length} listings carry a derivative URL${DRY_RUN ? ' (dry run)' : ''}`)

  const hashHits = new Map()
  // Why a baseline could not be read. A merchant that rate-limits us reads as
  // "no upgrade available" unless this is surfaced — which is how misterb was
  // first misdiagnosed as permanently blocking bot traffic when it was
  // answering 200 to a slower caller the whole time.
  const skipReasons = new Map()
  // Listings where at least one image could not be measured at all. These are
  // excluded from the terminal stamp below — see the note there.
  const skippedListingIds = new Set()
  const stats = { images: 0, unchanged: 0, skipped: 0, retracted: 0 }
  // Every accepted upgrade, kept flat so the placeholder backstop below can
  // retract individual images before any listing array is assembled.
  const wins = []

  let done = 0
  await mapLimit(rows, CONCURRENCY, async (row) => {
    const images = row.images ?? []
    for (let i = 0; i < images.length; i++) {
      const url = images[i]
      if (!url) continue
      stats.images++
      const result = await bestUpgrade(url)
      if (!result) {
        stats.unchanged++
        continue
      }
      if (result.skipped) {
        stats.skipped++
        skipReasons.set(result.skipped, (skipReasons.get(result.skipped) ?? 0) + 1)
        skippedListingIds.add(row.id)
        continue
      }
      const { from, to } = result
      hashHits.set(to.probe.hash, (hashHits.get(to.probe.hash) ?? 0) + 1)
      wins.push({ id: row.id, source_type: row.source_type, index: i, url: to.url, hash: to.probe.hash, rule: to.rule, from, to: to.probe })
      if (i === 0) {
        console.log(`  ${row.source_type}: ${from.w}×${from.h} → ${to.probe.w}×${to.probe.h}  (${to.rule})`)
      }
    }
    if (++done % 50 === 0) process.stdout.write(`  scanned ${done}/${rows.length}\r`)
  })

  // Placeholder backstop, applied AFTER the sweep: a recurring hash is only
  // visible once enough of the corpus has been seen, so this retracts rather
  // than prevents.
  const banned = new Set([...hashHits.entries()].filter(([, n]) => n >= PLACEHOLDER_MIN_HITS).map(([h]) => h))
  const kept = wins.filter((w) => !banned.has(w.hash))
  stats.retracted = wins.length - kept.length
  if (banned.size) {
    console.warn(
      `\n!! ${banned.size} candidate hash(es) recur across ${PLACEHOLDER_MIN_HITS}+ products — treating as placeholders, dropping ${stats.retracted} upgrade(s).`,
    )
    for (const w of wins.filter((w) => banned.has(w.hash)).slice(0, 3)) {
      console.warn(`   e.g. ${w.rule} → ${w.url}`)
    }
    console.warn('   Investigate the RULE that produced them; do not raise the threshold.')
  }

  // Rebuild each listing's array from the kept wins only.
  const byListing = new Map(rows.map((r) => [r.id, { id: r.id, images: [...(r.images ?? [])], changed: false }]))
  for (const w of kept) {
    const entry = byListing.get(w.id)
    entry.images[w.index] = w.url
    entry.changed = true
  }
  const pending = [...byListing.values()].filter((e) => e.changed)

  const byRule = new Map()
  for (const w of kept) byRule.set(w.rule, (byRule.get(w.rule) ?? 0) + 1)

  console.log(
    `\nlistings changed ${pending.length} · images upgraded ${kept.length} · unchanged ${stats.unchanged} · skipped ${stats.skipped} · retracted ${stats.retracted}`,
  )
  for (const [rule, n] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${rule}: ${n}`)
  if (skipReasons.size) {
    console.log('skipped because the CURRENT image could not be measured:')
    for (const [why, n] of [...skipReasons.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${why}: ${n}`)
    console.log('  (a 403/429 here is rate limiting, not absence of a better copy — lower --concurrency and re-run)')
  }

  if (DRY_RUN) {
    console.log('\ndry run — nothing written')
    return
  }
  if (!pending.length) return

  // One statement per listing: `images` is an array whose order is the
  // gallery's order, so it is rewritten whole rather than element-wise.
  let written = 0
  for (const p of pending) {
    const arr = `array[${p.images.map(lit).join(',')}]::text[]`
    await sql(`update marketplace_listings set images = ${arr}, updated_at = now() where id = ${lit(p.id)};`)

    // Repoint the cover link at a fresh pending asset so the stale R2 mirror
    // stops winning the source ladder. url_hash is the natural key
    // `upsertImageAsset` uses, so an image already registered under a
    // different listing is reused rather than duplicated.
    //
    // Delete-then-insert rather than `update ... set asset_id`: the link PK is
    // (asset_id, entity_type, entity_id, role), a listing can carry several
    // cover-role links at different sort_orders, and if the upgraded URL is
    // ALREADY one of them the update collides with the existing row. That is
    // not an edge case — it fired on the first listing of the first real run,
    // because a shop's cache derivative and its original are often both already
    // registered. The conflict clause promotes the existing link to sort_order
    // 0 instead of failing.
    const cover = p.images[0]
    if (cover) {
      const urlHash = createHash('sha256').update(cover).digest('hex')
      await sql(`
        with asset as (
          insert into image_assets (url_hash, url, source, status, optimization_status, last_seen_at)
          values (${lit(urlHash)}, ${lit(cover)}, 'scraper', 'active', 'pending', now())
          on conflict (url_hash) do update set last_seen_at = now()
          returning id
        ), cleared as (
          delete from image_asset_links
          where entity_type = 'marketplace_listing' and entity_id = ${lit(p.id)} and sort_order = 0
            and asset_id is distinct from (select id from asset)
        )
        insert into image_asset_links (asset_id, entity_type, entity_id, role, sort_order)
        select (select id from asset), 'marketplace_listing', ${lit(p.id)}, 'cover', 0
        on conflict (asset_id, entity_type, entity_id, role) do update set sort_order = 0;`)
    }
    if (++written % 25 === 0) process.stdout.write(`  wrote ${written}/${pending.length}\r`)
  }
  console.log(`\nwrote ${written} listings`)

  // Stamp the listings this pass actually MEASURED, upgraded or not — a "no
  // bigger copy exists" verdict is the result that most needs recording, since
  // it is the one that would otherwise be recomputed on every future pass.
  //
  // A listing whose probes were BLOCKED is deliberately not stamped. Stamping
  // it would record a 403 as a verdict and write the merchant off permanently
  // — 2,194 misterb listings sit behind a bot wall right now, and if that wall
  // ever comes down they must be reachable again. This is the same distinction
  // the skip-reason tally exists to surface, applied to what gets persisted.
  // Batched because the management API throttles a few hundred statements in a
  // row.
  const blocked = new Set(skippedListingIds)
  const examined = rows.map((r) => r.id).filter((id) => !blocked.has(id))
  if (blocked.size) {
    console.log(`${blocked.size} listing(s) left unstamped — their images could not be measured, which is not a verdict`)
  }
  for (let i = 0; i < examined.length; i += 200) {
    const chunk = examined.slice(i, i + 200)
    await sql(`
      update marketplace_listings
      set attributes = coalesce(attributes, '{}'::jsonb)
        || jsonb_build_object('image_upscale', jsonb_build_object('attempted_at', now()))
      where id in (${chunk.map(lit).join(',')});`)
  }
  console.log(`stamped ${examined.length} listings as examined`)
  console.log('R2 mirrors follow whenever optimize-images-batch next runs; until then the card serves the upgraded merchant URL.')
}

// Only sweep when run as a command. Without this an `import` of this module —
// to reuse a helper, or by a test runner globbing scripts/ — starts a live
// sweep against production as a side effect of loading the file.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
