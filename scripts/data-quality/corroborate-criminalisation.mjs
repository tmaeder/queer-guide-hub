#!/usr/bin/env node
/**
 * Second opinion on the two safety-gate rights fields, from the US State Department
 * Country Reports on Human Rights Practices.
 *
 * WHY THIS SOURCE. Every one of the 18 RIGHT_TOPICS columns rested on ILGA alone — the
 * data behind location_is_high_risk(), venues/events/organizations RLS and
 * compose_safety_note(). State Dept reports are PUBLIC DOMAIN (US Government work), so
 * there is no licence constraint on storing or displaying them; that is precisely what
 * killed the Equaldex arm, whose free terms forbid commercial display and any storage
 * past 30 days. They are independent embassy reporting, so unlike the Wikipedia/Wikidata
 * rights tables (which heavily cite ILGA) they are not a derivative of the source they
 * are meant to check.
 *
 * SCOPE: `lgbti_criminalization.legal` and `death_penalty`. Nothing else. Those two drive
 * the gate; a full second opinion on 250x18 is a large build for marginal safety value.
 *
 * IT NEVER WRITES `countries`. Results land in `country_rights_corroboration`. That is
 * the structural form of "flag, never overwrite" — not a rule someone can forget, but a
 * table with no write path into the rights columns.
 *
 * THE ANCHOR. 2023 reports carry a structured `Criminalization:` sub-label inside "Acts
 * of Violence, Criminalization, and Other Abuses Based on Sexual Orientation...". That
 * heading appears THREE times per page (contents, body, footer nav) and only the body one
 * is followed by the sub-label — which is what makes this a precise anchor rather than a
 * prose guess. Taking "the last occurrence" grabs the footer nav and yields the table of
 * contents for every country, which is how the first draft classified all six test
 * countries identically as `unknown`.
 *
 * `unknown` IS A VERDICT, NOT A FAILURE. No report, no section, or contradictory wording
 * records `unknown` and corroborates nothing. Absence of evidence must never read as
 * agreement.
 *
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/data-quality/corroborate-criminalisation.mjs [--limit N] [--dry-run]
 */

const BASE = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
// Validated at the boundary: YEAR is interpolated into the report URL, and the workflow
// exposes it as a workflow_dispatch input. Dispatch already requires write access, but a
// value that reaches a URL should be shaped here rather than trusted from the caller.
const YEAR = process.env.SD_REPORT_YEAR || '2023'
if (!/^\d{4}$/.test(YEAR)) {
  console.error(`SD_REPORT_YEAR must be a 4-digit year, got: ${JSON.stringify(YEAR)}`)
  process.exit(1)
}
const LIMIT = Number((process.argv.find(a => a.startsWith('--limit=')) || '').split('=')[1] || 0)
const DRY = process.argv.includes('--dry-run')

if (!BASE || !KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

const sb = (path, init = {}) =>
  fetch(`${BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

/**
 * HTML entities, decoded in ONE pass.
 *
 * A chain of `.replace()` calls ending with `&amp;` -> `&` can DOUBLE-UNESCAPE: the
 * ampersand it produces can combine with the following text into a new entity that another
 * rule then decodes again, so `&amp;#8217;` — an author writing the literal text
 * `&#8217;` — comes out as an apostrophe rather than the characters they wrote. A single
 * regex with a lookup table cannot do that, because each match is consumed exactly once.
 * (CodeQL js/double-escaping.)
 */
const ENTITIES = {
  '&#8216;': "'", '&#8217;': "'", '&#8218;': "'", '&#8219;': "'",
  '&lsquo;': "'", '&rsquo;': "'", '&#39;': "'", '&apos;': "'",
  '&#8220;': '"', '&#8221;': '"', '&ldquo;': '"', '&rdquo;': '"', '&quot;': '"',
  '&nbsp;': ' ', '&#160;': ' ',
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&#8211;': '-', '&#8212;': '-',
}

const plain = (h) =>
  h
    // `\s*` before the closing `>`: `</script >` is valid HTML and a rigid `</script>`
    // does not match it, so script source would survive into the extracted prose and could
    // corrupt a verdict. `\b` stops `<scriptfoo>` being treated as an opening script tag.
    // (CodeQL js/bad-tag-filter.)
    // `[^>]*` rather than `\s*` before the closing `>`: the HTML spec ends a script
    // element on `</script` followed by any of whitespace, `/` or `>`, so `</script foo>`
    // and `</script/>` both close it and a `\s*`-only pattern misses them — script source
    // then survives into the extracted prose and can corrupt a verdict. This is the
    // CodeQL js/bad-tag-filter finding the comment claimed to have handled.
    .replace(/<script\b[\s\S]*?<\/script[^>]*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    // Unrecognised entities become a space rather than being left as-is: this text is
    // matched against legal-status patterns, and a stray `&#8230;` inside a sentence is
    // noise either way, but leaving a literal `&` invites the very re-combination the
    // single pass exists to prevent.
    .replace(/&(?:#\d{1,6}|#x[0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,8});/g,
      (m) => ENTITIES[m] ?? ENTITIES[m.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')

/** The report's own `Criminalization:` paragraph — see the anchor note in the header. */
function crimParagraph(txt) {
  const re =
    /Criminalization,\s*and\s*Other\s*Abuses[^.]{0,140}?Characteristics\s*(.{0,80}?)Criminalization\s*:\s*/gis
  let m
  let best = null
  while ((m = re.exec(txt)) !== null) if ((m[1] || '').length < 60) best = m
  if (!best) return ''
  const start = best.index + best[0].length
  const rest = txt.slice(start, start + 3000)
  const stop = rest.search(
    /\b(?:Violence and Harassment|Discrimination|Availability of Legal Gender Recognition|Involuntary or Coercive Medical|Restrictions of F\s*reedom)\s*:/i,
  )
  return (stop > 0 ? rest.slice(0, stop) : rest).trim()
}

// CLASSIFY ON THE LEADING SENTENCE, NOT THE WHOLE PARAGRAPH. State Dept opens this
// paragraph with the legal status and then elaborates on enforcement, court cases and
// related offences — so scanning the whole thing makes both patterns fire and everything
// reads `ambiguous`. Measured on the first 12 countries alphabetically: whole-paragraph
// matching produced 4 false `ambiguous` (Albania, Andorra and Argentina all open "No laws
// criminalized…"; Algeria opens "The law criminalized…"), i.e. every one of them was
// unambiguous in its first clause and contradicted only by later context.
// THE NEGATION IS ROUTINELY INTERRUPTED, and a rigid `no laws criminaliz` misses it.
// Measured across all 250: six countries that plainly do not criminalise — Switzerland,
// Greece, Cyprus, Costa Rica, Kosovo, Belarus — were read as `criminalized` purely
// because of the words sitting inside the negation:
//     "There were no laws THAT criminalized …"          (CH, GR, CR, XK)
//     "There were no laws THAT EXPLICITLY criminalized …" (BY)
//     "No ROC laws criminalized …"                        (CY)
// So the determiner span is explicit and bounded rather than adjacent. Bounded, not
// greedy: an unbounded gap would let a "no" three sentences earlier negate an unrelated
// criminalisation clause.
const NOCRIM = new RegExp(
  [
    String.raw`\bno\s+(?:[\w“”"']+\s+){0,3}laws?\s+(?:that\s+)?(?:[\w]+\s+){0,2}(?:criminaliz|prohibit|against)`,
    String.raw`\bno\s+laws?\s+against`,
    String.raw`did\s+not\s+criminaliz`,
    String.raw`(?:was|were)\s+not\s+(?:illegal|criminaliz)`,
    String.raw`decriminaliz`,
    String.raw`ruled\s+unconstitutional`,
    String.raw`struck\s+down`,
  ].join('|'),
  'i',
)
const CRIM = /\b(?:was|were)\s+illegal|criminaliz\w*\s+(?:consensual\s+)?same-sex|law\s+criminaliz|considered\s+consensual\s+same-sex[^.]{0,40}criminal/i

/** First 1-2 sentences — where the status is stated before the elaboration begins. */
function lead(para) {
  const m = para.match(/^.{0,400}?[.!?](?=\s|$)/s)
  return m ? m[0] : para.slice(0, 300)
}
// "punishable by death" must count. Matching only "death penalty" missed Iran, whose
// report says "punishable by death, flogging, or a lesser punishment". Deliberately does
// NOT match bare "death" — "beaten to death" / "death threats" are not sentencing law.
const DEATH = /death\s+penalty|capital\s+punishment|(?:punishable\s+by|sentenced?\s+to|penalty\s+of)\s+death/i

/** countries.name -> state.gov slug. */
function slugFor(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * A 404 AND A 429 ARE NOT THE SAME ANSWER, and collapsing them is the whole trap.
 *
 * 404 means the report does not exist — dependent territories have no State Dept entry,
 * which is a real coverage boundary and a correct, terminal `unknown`. 429 means WE were
 * throttled and learned nothing. Recording both as `unknown` would let a rate limit
 * masquerade as "this country has no second opinion" — permanently, and silently, because
 * the row would look identical to a genuine gap.
 *
 * Measured: a full 250-country pass at concurrency 5 trips state.gov's limiter partway
 * through, after which EVERY request 429s. The first full run reported 91 `unknown`; an
 * unknown proportion of those were throttling, not missing reports, and nothing in the
 * output distinguished them.
 *
 * So transient statuses retry with backoff and, if they still fail, return `error` —
 * which is NOT written as a verdict and is retried on the next run.
 */
const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504])

async function fetchReport(url, attempt = 0) {
  let res
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' })
  } catch (e) {
    if (attempt < 3) {
      await sleep(2000 * 2 ** attempt)
      return fetchReport(url, attempt + 1)
    }
    return { kind: 'error', reason: `fetch failed: ${e.message}` }
  }
  if (res.ok) return { kind: 'ok', res }
  if (TRANSIENT.has(res.status)) {
    if (attempt < 4) {
      const ra = Number(res.headers.get('retry-after'))
      await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 3000 * 2 ** attempt)
      return fetchReport(url, attempt + 1)
    }
    return { kind: 'error', reason: `HTTP ${res.status} after retries` }
  }
  return { kind: 'absent', reason: `HTTP ${res.status}` }
}

async function classify(name) {
  const slug = slugFor(name)
  const url = `https://www.state.gov/reports/${YEAR}-country-reports-on-human-rights-practices/${slug}/`
  const got = await fetchReport(url)
  if (got.kind === 'error') return { verdict: 'error', reason: got.reason, url }
  if (got.kind === 'absent') return { verdict: 'unknown', reason: got.reason, url }
  const res = got.res

  const para = crimParagraph(plain(await res.text()))
  if (!para) return { verdict: 'unknown', reason: 'no Criminalization: anchor', url }

  const head = lead(para)

  // NEGATION WINS IN THE LEAD, and the order is load-bearing. "No laws criminalized
  // consensual same-sex conduct" CONTAINS the affirmative pattern as a substring — the
  // negation is carried entirely by the two words in front of it. Testing CRIM first (or
  // testing both and calling a double match ambiguous) made Albania, Andorra and
  // Argentina read `ambiguous` when all three state the legal position unambiguously.
  // ...but the negation only wins when the affirmative it contains belongs to the SAME
  // clause. The paragraph above is right that "no laws criminalized ..." carries its
  // negation in the words in front of the CRIM match; it is not right that a NOCRIM hit
  // ANYWHERE in the lead makes the country legal. Measured against real State Dept
  // phrasings, the unguarded form resolved all three of these to `legal`:
  //
  //   "The law criminalized consensual same-sex sexual conduct between adults, and there
  //    was no movement toward decriminalization."
  //   "The law criminalized same-sex sexual conduct, although the constitutional court
  //    struck down a related provision in 2022."
  //   "Consensual same-sex sexual conduct was illegal and activists campaigning for
  //    decriminalization faced harassment."
  //
  // Each states criminalization outright and merely mentions decriminalization, but
  // NOCRIM matches the bare stems `decriminaliz` / `struck down`, so it fired and
  // returned `criminalized: false, death_penalty: false`. On this platform that is the
  // direction that gets someone hurt: a false `legal` understates exposure, where a false
  // `ambiguous` only asks a human to look. So the CRIM match must fall OUTSIDE the
  // negation's own span before the negation is trusted.
  // The discriminator is ORDER, not overlap. A negation governs the criminalization
  // clause that FOLLOWS it ("no laws criminalized…", "did not criminalize…", "ruled
  // unconstitutional the law criminalizing…"); an affirmative that comes FIRST is the
  // main clause, and a later negation is a subordinate aside about reform, campaigning
  // or a partial strike-down. Verified against all eight shapes: the three false-safe
  // phrasings above all have CRIM before NOCRIM, and the five that must stay `legal` —
  // the Switzerland/Cyprus/Belarus/Albania forms plus India's "ruled unconstitutional
  // the law criminalizing same-sex conduct" — all have NOCRIM first.
  //
  // An earlier attempt tested whether CRIM fell outside the negation's matched span
  // instead; that reads India as ambiguous, because "ruled unconstitutional" and "law
  // criminaliz" are adjacent but non-overlapping. Order is the property that separates
  // the two sets.
  const nocrimHit = head.match(NOCRIM)
  if (nocrimHit) {
    const crimHit = head.match(CRIM)
    const affirmativeLeads = crimHit && crimHit.index < nocrimHit.index
    if (!affirmativeLeads) {
      return {
        verdict: 'legal',
        url,
        criminalized: false,
        death_penalty: false,
        evidence: para.slice(0, 900),
      }
    }
    // else: the paragraph states criminalization and only mentions reform afterwards.
    // Fall through to the mixed-wording path, which resolves `ambiguous` and asks a
    // human — the safe direction when the wording is genuinely mixed.
  }
  let yes = CRIM.test(head)
  let no = false
  // Only widen to the full paragraph when the lead says nothing either way.
  if (!yes) {
    no = NOCRIM.test(para)
    yes = CRIM.test(para)
  }
  // Both firing across the widened paragraph is genuinely mixed wording (a partial
  // repeal, a struck-down statute still on the books). Do not guess — `ambiguous`
  // corroborates nothing, which is the safe outcome.
  const verdict = no && yes ? 'ambiguous' : no ? 'legal' : yes ? 'criminalized' : 'unknown'
  return {
    verdict,
    url,
    criminalized: verdict === 'criminalized' ? true : verdict === 'legal' ? false : null,
    death_penalty: verdict === 'criminalized' ? DEATH.test(para) : verdict === 'legal' ? false : null,
    evidence: para.slice(0, 900),
  }
}

const r = await sb('countries?select=id,code,name,lgbti_criminalization&duplicate_of_id=is.null&order=name')
if (!r.ok) { console.error(`countries fetch → ${r.status}`); process.exit(1) }
let countries = await r.json()
if (LIMIT) countries = countries.slice(0, LIMIT)

// `error` is tallied but NEVER written as a verdict — it means we learned nothing, and a
// row saying `unknown` would be indistinguishable from a country that genuinely has no
// report. The next run retries it.
const tally = { criminalized: 0, legal: 0, unknown: 0, ambiguous: 0, error: 0 }
const disagreements = []
const rows = []
let written = 0

// Bounded concurrency: state.gov is slow enough that 250 sequential fetches is the
// bottleneck (~8 min), not politeness. Five at a time is well inside normal browsing.
// Concurrency 5 with no delay trips state.gov's rate limiter partway through a 250-country
// pass, after which every request 429s. Two at a time with a courtesy gap keeps a full run
// inside the limit; the retry/backoff in fetchReport is the safety net, not the plan.
const POOL = Number(process.env.SD_POOL || 2)
const GAP_MS = Number(process.env.SD_GAP_MS || 400)
async function pooled(items, worker) {
  const it = items[Symbol.iterator]()
  await Promise.all(
    Array.from({ length: POOL }, async () => {
      for (;;) {
        const n = it.next()
        if (n.done) return
        await worker(n.value)
        if (GAP_MS) await sleep(GAP_MS)
      }
    }),
  )
}

await pooled(countries, async (c) => {
  const ilgaLegal = c.lgbti_criminalization?.legal
  const ilgaCrim = ilgaLegal === undefined || ilgaLegal === null ? null : String(ilgaLegal) === 'false'
  // ILGA splits capital exposure across TWO fields and neither is sufficient alone —
  // `death_penalty: 'No legal certainty'` is ILGA explicitly recording that death IS
  // possible, not that it is absent. Reading `/^yes$/i` alone made Afghanistan, Pakistan,
  // Qatar, Somalia and the UAE come back `false`, exactly as if ILGA had said "No", and
  // this script then reported them as disagreeing with the State Dept report — a
  // disagreement it had manufactured itself. `src/utils/equalityScore.ts` carries the
  // canonical `deathPenaltyRisk()` and names these same five countries; this is that
  // function, inlined because it is TS and this is a plain .mjs script. Keep the two in
  // step: `'possible'` must never read as a negative finding.
  const ilgaDeath = (() => {
    const crim = c.lgbti_criminalization ?? {}
    const dp = String(crim.death_penalty ?? '').trim()
    // Checked first: Nigeria is 'Yes' while its penalty text names only prison.
    if (/^yes$/i.test(dp) || /death/i.test(dp)) return true
    if (/no legal certainty/i.test(dp)) return true
    return /death/i.test(String(crim.penalty ?? ''))
  })()

  const out = await classify(c.name)
  tally[out.verdict] = (tally[out.verdict] || 0) + 1

  // Learned nothing — do not record a verdict at all. Writing `unknown` here would make a
  // throttled request permanently indistinguishable from a country with no report.
  if (out.verdict === 'error') {
    process.stderr.write(`\n  ! ${c.code} ${c.name}: ${out.reason} (will retry next run)`)
    return
  }

  const agrees =
    out.verdict === 'criminalized' || out.verdict === 'legal'
      ? ilgaCrim === null
        ? null
        : out.criminalized === ilgaCrim
      : null

  if (agrees === false) disagreements.push({ code: c.code, name: c.name, ilga: ilgaCrim, sd: out.criminalized })
  if (out.death_penalty === true && !ilgaDeath)
    disagreements.push({ code: c.code, name: c.name, field: 'death_penalty', ilga: ilgaDeath, sd: true })

  rows.push({
    country_id: c.id,
    code: c.code,
    source: 'us_state_dept_hrp',
    source_url: out.url,
    source_year: YEAR,
    criminalized: out.criminalized ?? null,
    death_penalty: out.death_penalty ?? null,
    verdict: out.verdict,
    evidence: (out.evidence ?? out.reason ?? '').slice(0, 900),
    ilga_criminalized: ilgaCrim,
    ilga_death_penalty: ilgaDeath,
    agrees,
  })

  if (!DRY) {
    const w = await sb('country_rights_corroboration?on_conflict=country_id,source,source_year', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        country_id: c.id,
        source: 'us_state_dept_hrp',
        source_url: out.url,
        source_year: YEAR,
        criminalized: out.criminalized ?? null,
        death_penalty: out.death_penalty ?? null,
        verdict: out.verdict,
        evidence: out.evidence ?? out.reason ?? null,
        ilga_criminalized: ilgaCrim,
        ilga_death_penalty: ilgaDeath,
        agrees,
        observed_at: new Date().toISOString(),
      }),
    })
    if (w.ok) written++
    else if (written < 3) console.error(`  write failed for ${c.name}: ${w.status} ${await w.text()}`)
  }
  process.stderr.write(`\r  ${Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(' ')}   `)
})

const OUT = (process.argv.find((a) => a.startsWith('--out=')) || '').split('=')[1]
if (OUT) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(OUT, JSON.stringify(rows, null, 0))
  console.log(`\nwrote ${rows.length} rows to ${OUT}`)
}

console.log(`\n\nwritten: ${written}`)
console.log(`verdicts: ${JSON.stringify(tally)}`)
console.log(`\ndisagreements with ILGA (${disagreements.length}):`)
for (const d of disagreements) console.log(`  ${d.code} ${d.name}: field=${d.field || 'criminalized'} ilga=${d.ilga} state_dept=${d.sd}`)
