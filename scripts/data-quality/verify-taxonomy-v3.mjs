#!/usr/bin/env node
// End-to-end verification of the taxonomy-v3 recategorization, against PROD.
//
// Checks the three surfaces that can disagree, because each has its own
// writer and this program's defects all lived in the gaps between them:
//   * the DATABASE (tag_categories, the junction, both denorm mirrors)
//   * the EDGE (the 301s in public/_redirects, which no test can see off
//     Cloudflare — `_redirects` is inert anywhere else)
//   * the RENDERED PAGE (what a reader actually gets at /tags)
//
// Every check states what it measured, not just pass/fail, so a run is
// readable as a report rather than a green tick.
//
//   node scripts/data-quality/verify-taxonomy-v3.mjs
//   node scripts/data-quality/verify-taxonomy-v3.mjs --base https://queer.guide

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const argv = process.argv.slice(2)
const BASE = (argv[argv.indexOf('--base') + 1] || '').startsWith('http')
  ? argv[argv.indexOf('--base') + 1]
  : 'https://queer.guide'

const V3_LINES = [
  'identity',
  'sex-kink',
  'relationships-family',
  'health',
  'safety-consent',
  'culture-community',
  'history-rights',
  'places-scene',
]

// The 15 slugs that changed. Surviving stops kept their URLs and need no rule.
const REDIRECTS = {
  'identity-expression': 'identity',
  'sexuality-kink': 'sex-kink',
  'relationships-connection': 'relationships-family',
  'health-wellness': 'health',
  'safety-practices': 'safety-consent',
  'community-culture': 'culture-community',
  'history-heritage': 'history-rights',
  'rights-activism': 'history-rights',
  'places-travel': 'places-scene',
  'support-news': 'places-scene',
  'sexual-roles': 'bdsm-power-exchange',
  'body-types-archetypes': 'kink-community',
  'care-access': 'physical-reproductive',
  'current-affairs': 'political-activism',
  'professions-allies': 'support-services',
}

// Same resolution as refile-tag-remainder.mjs: the CLI stores the PAT under
// the service name "Supabase CLI", base64 with a go-keyring prefix.
function pat() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim()
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8')
}

const TOKEN = pat()

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`SQL ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

let failures = 0
let checks = 0
function report(ok, label, detail) {
  checks++
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
}

// ── Database ──────────────────────────────────────────────────────────────
async function checkDatabase() {
  console.log('\n── database ──')

  const [tree] = await sql(`
    select
      (select count(*) from tag_categories where level = 0) as lines,
      (select count(*) from tag_categories where level = 1) as stops,
      (select count(*) from tag_categories c where c.level = 1
         and not exists (select 1 from tag_categories p where p.id = c.parent_id)) as orphan_stops,
      (select count(*) from tag_categories where level = 0
         and slug not in (${V3_LINES.map((s) => `'${s}'`).join(',')})) as non_v3_lines`)
  report(Number(tree.lines) === 8, 'exactly 8 lines', `found ${tree.lines}`)
  report(Number(tree.non_v3_lines) === 0, 'no v2 line survives', `${tree.non_v3_lines} unexpected`)
  report(Number(tree.orphan_stops) === 0, 'no orphaned stop', `${tree.orphan_stops} orphans`)
  console.log(`      (${tree.stops} stops)`)

  const [filing] = await sql(`
    select
      (select count(*) from unified_tags u
         where u.category_id is not null
           and not exists (select 1 from tag_categories c where c.id = u.category_id)) as dangling_id,
      (select count(*) from unified_tags u
         where u.category is not null
           and not exists (select 1 from tag_categories c where c.name = u.category)) as legacy_text,
      (select count(*) from (select tag_id from tag_category_assignments
         where is_primary group by tag_id having count(*) > 1) d) as dup_primaries,
      (select count(*) from unified_tags u
         where u.status = 'active' and u.merged_into_id is null
           and u.slug !~ '^(mat|vibe|occ|dept|attr|own|rating|color|size|genre|fit)-'
           and not exists (select 1 from tag_category_assignments a
                             where a.tag_id = u.id and a.is_primary)) as active_unfiled`)
  report(Number(filing.dangling_id) === 0, 'no dangling category_id', `${filing.dangling_id}`)
  report(
    Number(filing.legacy_text) === 0,
    'no legacy category TEXT value',
    `${filing.legacy_text} (this is e2e-tag-taxonomy check #8)`,
  )
  report(Number(filing.dup_primaries) === 0, 'one primary per tag', `${filing.dup_primaries} dupes`)
  console.log(`      (${filing.active_unfiled} active non-facet tags carry no primary)`)

  // The age gate is the safety-critical invariant of the whole program.
  const [gate] = await sql(`
    select
      (select count(*) from unified_tags t
         join tag_category_assignments a on a.tag_id = t.id
         join tag_categories c on c.id = a.category_id
         left join tag_categories p on p.id = c.parent_id
        where t.status = 'active' and t.merged_into_id is null
          and (c.name = 'Sex & Kink' or p.name = 'Sex & Kink')
          and t.is_adult is not true) as kink_missing_flag,
      (select count(*) from unified_tags where status='active' and merged_into_id is null
         and is_adult) as adult_total,
      (select count(*) from unified_tags t
         join tag_category_assignments a on a.tag_id = t.id and a.is_primary
         join tag_categories c on c.id = a.category_id
        where t.status = 'active' and t.is_adult
          and c.slug in ('venues-nightlife','safe-spaces','audiences','vibe-crowd',
                         'travel-destinations','support-services','accommodation',
                         'sports-recreation','events-scene')
          and lower(t.name) <> 'cruising') as descriptors_gated`)
  report(
    Number(gate.kink_missing_flag) === 0,
    'every kink tag keeps its age gate',
    `${gate.kink_missing_flag} missing (of ${gate.adult_total} adult tags)`,
  )
  report(
    Number(gate.descriptors_gated) === 0,
    'no venue descriptor is age-gated',
    `${gate.descriptors_gated} over-gated`,
  )

  // The namespace rule: marketplace facets belong to no glossary category.
  const [ns] = await sql(`
    select count(*) as filed from unified_tags t
     where t.slug ~ '^(mat|vibe|occ|dept|attr|own|rating|color|size|genre|fit)-'
       and t.status = 'active'
       and (t.category_id is not null or t.category is not null
            or exists (select 1 from tag_category_assignments a where a.tag_id = t.id))`)
  report(Number(ns.filed) === 0, 'no namespaced facet is filed in the glossary', `${ns.filed} filed`)

  // Kind axis actually populated.
  const kinds = await sql(`
    select entity_kind::text as kind, count(*) as n from unified_tags
     where status='active' and merged_into_id is null group by 1 order by 2 desc`)
  const total = kinds.reduce((s, k) => s + Number(k.n), 0)
  const concept = Number(kinds.find((k) => k.kind === 'concept')?.n ?? 0)
  report(
    kinds.length >= 4 && concept / total < 0.95,
    'kind axis is populated',
    kinds.map((k) => `${k.kind} ${k.n}`).join(', '),
  )
}

// ── Edge ──────────────────────────────────────────────────────────────────
async function checkRedirects() {
  console.log('\n── edge redirects ──')
  let bad = 0
  for (const [from, to] of Object.entries(REDIRECTS)) {
    const res = await fetch(`${BASE}/tags/c/${from}`, { redirect: 'manual' })
    const loc = res.headers.get('location') || ''
    const ok = res.status === 301 && loc.endsWith(`/tags/c/${to}`)
    if (!ok) {
      bad++
      console.log(`      /tags/c/${from} -> ${res.status} ${loc || '(no location)'}`)
    }
  }
  report(bad === 0, `all ${Object.keys(REDIRECTS).length} retired category slugs 301`, `${bad} wrong`)

  // A surviving stop must NOT redirect — a rule for it would be a self-redirect.
  const survivor = await fetch(`${BASE}/tags/c/sexual-health`, { redirect: 'manual' })
  report(
    survivor.status === 200,
    'a surviving stop is served, not redirected',
    `/tags/c/sexual-health -> ${survivor.status}`,
  )
}

// ── Rendered page ─────────────────────────────────────────────────────────
// Anything asserted against a PLAIN fetch of this SPA is vacuous: the shell
// carries no content until React hydrates, so `!/Fetishes/.test(html)` passes
// on a page that never mentioned anything at all. The crawler UA is the
// honest surface — functions/_middleware.ts injects real server-rendered
// content for bots, which is also exactly what search engines index.
const BOT = { headers: { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' } }

async function checkPages() {
  console.log('\n── rendered pages (crawler view) ──')

  for (const line of V3_LINES) {
    const res = await fetch(`${BASE}/tags/c/${line}`)
    if (res.status !== 200) {
      report(false, `line /tags/c/${line} serves`, `${res.status}`)
      return
    }
  }
  report(true, `all 8 line pages serve 200`)

  // A re-filed tag's page must name its NEW stop and not its old one. Sauna
  // is the canonical case twice over: it moved out of Fetishes into Venue
  // Types, and its leftover junction row is what kept it age-gated.
  const sauna = await fetch(`${BASE}/tags/sauna`, BOT).then((r) => r.text())
  const namesNew = /Venue Types/.test(sauna)
  report(
    namesNew && !/Fetishes/.test(sauna),
    'sauna names Venue Types and no kink stop',
    namesNew ? 'ok' : 'page did not name Venue Types — check the bot render, not just the DB',
  )

  // Clothing-Optional was the highest-usage over-gated descriptor (1,690).
  const co = await fetch(`${BASE}/tags/clothing-optional`, BOT).then((r) => r.text())
  report(
    /Venue Features|Venue Types|Safe Spaces/.test(co),
    'clothing-optional names a venue stop',
  )
}

console.log(`taxonomy v3 verification — ${BASE}`)
await checkDatabase()
await checkRedirects()
await checkPages()
console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${checks - failures}/${checks} checks passed`)
process.exit(failures === 0 ? 0 : 1)
