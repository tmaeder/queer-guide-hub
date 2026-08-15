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
      if (method === 'GET') return { state: 'dead', code: res.status, final: res.url }
    } catch (err) {
      if (method === 'GET') {
        return { state: 'dead', code: 0, final: String(err?.message ?? err).slice(0, 80) }
      }
    }
  }
  return { state: 'dead', code: 0, final: 'unreachable' }
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
      const from = `${a.hostname.replace(/^www\./, '')}${a.pathname.replace(/\/$/, '')}`
      const to = `${b.hostname.replace(/^www\./, '')}${b.pathname.replace(/\/$/, '')}`
      if (from !== to) {
        moved.push({ slug, from, to })
      }
    } catch {
      /* a malformed stored URL is already caught by the CHECK constraint */
    }
  } else if (r.state === 'unverifiable') {
    unverifiable.push({ slug, url, code: r.code })
  } else {
    dead.push({ slug, url, code: r.code, note: r.final })
  }
}

console.log(`legal citations: ${rows.length} checked — ${ok} ok, ${unverifiable.length} unverifiable, ${dead.length} dead`)

if (unverifiable.length) {
  console.log('\nUnverifiable from CI (bot challenge — open in a browser to confirm):')
  for (const u of unverifiable) console.log(`  - ${u.slug}: HTTP ${u.code} ${u.url}`)
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
