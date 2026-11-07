#!/usr/bin/env node
/**
 * Link-rot guard for the published legal citations on /tags/:slug.
 *
 * `tag_sources` rows with `is_public` are the only place this site tells a reader
 * "here is the law". Each is an external URL on somebody else's server, and they
 * rot. Two pieces of evidence, both from this project:
 *
 *   - The OAS's own page for the American Convention on Human Rights
 *     (oas.org/dil/treaties_B-32_...htm) 302s to /wearesorry.htm. It was reported
 *     as HTTP 200 by the research pass and was already dead when re-checked
 *     minutes later. It never shipped only because every URL was fetched again
 *     before it entered the seed.
 *   - `mindlinetrans.org.uk`, published to trans people in distress, was
 *     re-registered and served an offshore-gambling affiliate site while our
 *     `link_status` still said `ok` (see 20260831100000). Rot is not always a
 *     404; sometimes the domain answers 200 with something worse.
 *
 * WHY THIS IS SCHEDULE-ONLY AND NOT A PR GATE. The failure it detects lives on
 * third-party servers, so wiring it to `pull_request` would let a UN outage block
 * every unrelated PR in the repo. A daily run still catches rot inside a day,
 * which is the right resolution for documents that change on the order of years.
 *
 * 403 IS NOT DEATH. ohchr.org, ulii.org and ilo.org/normlex all sit behind a
 * Cloudflare browser challenge and answer 403 to any non-browser client while
 * rendering perfectly for a reader. Reporting those as broken would train
 * whoever reads this output to ignore it, which is how the hotline check failed.
 * They are counted separately as UNVERIFIABLE and do not fail the run.
 *
 * A FAILED CONNECTION IS NOT DEATH EITHER, for exactly the same reason, and this
 * check called it death until 2026-10-14. A `fetch` that never completes — DNS,
 * TLS, reset, timeout — yields no status at all, and the runner cannot tell a
 * host that is gone from a host it merely could not reach. Measured: the Uganda
 * Anti-Homosexuality Act PDF on `parliament.go.ug` was reported
 * `HTTP 0 (fetch failed)` and hard-failed this gate on 10-13 and 10-14, while
 * the SAME url had passed as `54 ok, 0 dead` on 10-10 and 10-11 and served a
 * 991 KB application/pdf on demand throughout. A transport failure is therefore
 * UNVERIFIABLE, not DEAD. A status FROM the server (404/410, or a soft-404 that
 * lands on an error path) is evidence and still fails the run; a connection that
 * never happened is the absence of evidence. The cost is stated rather than
 * hidden: a host that truly vanishes now only warns, so read the unverifiable
 * list — a url that is unreachable run after run is rot, not weather.
 * Server failures and unsupported/authenticated requests are also unverifiable.
 * Only HTTP 404/410 or a detected soft-404 establishes that the document is gone.
 *
 * THE STATUS CODE CATCHES NOTHING ON THESE HOSTS — measured, not assumed. Every
 * one of the citation hosts answers a missing document with HTTP 200 and a
 * redirect to an error page:
 *
 *   treaties.un.org/…mtdsg_no=IV-99…  -> 200  treaties.un.org/pages/PageNotFound.aspx
 *   govinfo.gov/…/DOES-NOT-EXIST.htm  -> 200  govinfo.gov/error
 *
 * So a checker that trusts `res.ok` reports a citation to a nonexistent treaty as
 * healthy. The discriminating signal is the FINAL PATH, and note that the host is
 * unchanged in both cases — comparing hostnames alone (the obvious implementation)
 * would have caught neither.
 */

import { trimTrailingSlashes } from './lib/trim-trailing-slashes.mjs'

/** Final-path shapes that mean "this document is gone" despite a 200. */
const ERROR_PATH = /(pagenotfound|\/error\b|wearesorry|\/404\b|not[-_]?found)/i

const BASE = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!BASE || !KEY) {
  console.warn(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set — skipping legal-citation link check',
  )
  process.exit(0)
}

/** A real browser UA. Several government hosts 403 anything that looks automated. */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const rows = await fetch(
  `${BASE}/rest/v1/tag_sources?is_public=eq.true&select=official_title,source_url,jurisdiction,unified_tags(slug)`,
  { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
).then((r) => {
  if (!r.ok) throw new Error(`tag_sources fetch failed: ${r.status}`)
  return r.json()
})

if (!Array.isArray(rows) || rows.length === 0) {
  console.error('✗ no public legal citations found — the seed or the RLS/grant path regressed')
  process.exit(1)
}

/** @param {string} url */
async function probe(url) {
  // HEAD first: cheap, and most of these are large PDFs. Several hosts answer 405
  // to HEAD while serving GET fine, so fall through rather than trusting it.
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(25_000),
      })
      if (res.ok) {
        // A 200 that landed on an error page is the soft-404 above.
        let path = ''
        try {
          path = new URL(res.url).pathname
        } catch {
          /* fall through — a malformed final URL is judged on status alone */
        }
        if (ERROR_PATH.test(path)) {
          return { state: 'dead', code: res.status, final: `soft-404 → ${res.url}` }
        }
        return { state: 'ok', code: res.status, final: res.url }
      }
      // A challenge/ratelimit is "cannot verify from CI", not "gone".
      if (res.status === 403 || res.status === 429) {
        return { state: 'unverifiable', code: res.status, final: res.url }
      }
      if (method === 'GET') {
        return { state: res.status === 404 || res.status === 410 ? 'dead' : 'unverifiable', code: res.status, final: res.url }
      }
    } catch (err) {
      // No status came back at all, so the server said nothing about the
      // document. Unreachable-from-CI, not gone — see the header note.
      if (method === 'GET') {
        return { state: 'unverifiable', code: 0, final: String(err?.message ?? err).slice(0, 80) }
      }
    }
  }
  return { state: 'unverifiable', code: 0, final: 'unreachable' }
}

const dead = []
const unverifiable = []
const moved = []
let ok = 0

for (const row of rows) {
  const slug = row.unified_tags?.slug ?? '(unknown tag)'
  const url = row.source_url
  const r = await probe(url)

  if (r.state === 'ok') {
    ok += 1
    // A citation that silently became a redirect to somewhere else is the hotline
    // failure mode. Compare host AND path: the two soft-404s measured on these
    // hosts both keep the hostname and change only the path, so a host-only
    // comparison sees nothing. Query strings are ignored — treaties.un.org
    // rewrites them constantly and it means nothing.
    try {
      const a = new URL(url)
      const b = new URL(r.final)
      const from = `${a.hostname.replace(/^www\./, '')}${trimTrailingSlashes(a.pathname)}`
      const to = `${b.hostname.replace(/^www\./, '')}${trimTrailingSlashes(b.pathname)}`
      if (from !== to) {
        moved.push({ slug, from, to })
      }
    } catch {
      /* a malformed stored URL is already caught by the CHECK constraint */
    }
  } else if (r.state === 'unverifiable') {
    unverifiable.push({ slug, url, code: r.code, note: r.final })
  } else {
    dead.push({ slug, url, code: r.code, note: r.final })
  }
}

console.log(`legal citations: ${rows.length} checked — ${ok} ok, ${unverifiable.length} unverifiable, ${dead.length} dead`)

if (unverifiable.length) {
  // HTTP 403/429 and a failed connection are both "cannot verify from here",
  // but they are not the same thing to whoever reads this, so say which.
  console.log('\nUnverifiable from CI — open in a browser to confirm:')
  for (const u of unverifiable) {
    const why = u.code === 0 ? `unreachable (${u.note})`
      : u.code === 403 || u.code === 429 ? `HTTP ${u.code} (bot challenge/ratelimit)`
      : `HTTP ${u.code} (document could not be verified)`
    console.log(`  - ${u.slug}: ${why} ${u.url}`)
  }
  if (unverifiable.some((u) => u.code === 0)) {
    console.log(
      '  Note: an unreachable url that repeats run after run is rot, not weather — check it by hand.',
    )
  }
}

if (moved.length) {
  console.log('\nMoved (still 200, but not where the citation points — confirm it is still the law):')
  for (const m of moved) console.log(`  - ${m.slug}: ${m.from}  ->  ${m.to}`)
}

if (dead.length) {
  console.error('\n✗ DEAD legal citations — the page is citing a law nobody can read:')
  for (const d of dead) console.error(`  - ${d.slug}: HTTP ${d.code} ${d.url} (${d.note})`)
  console.error(
    '\nFix: find the instrument at a new primary URL, verify it by opening it, and update the row\n' +
      "(/admin/tags → the tag → Source of law). Do NOT just clear `is_public` — a law tag with no\n" +
      'citation is the state this whole feature exists to remove.',
  )
  process.exit(1)
}
