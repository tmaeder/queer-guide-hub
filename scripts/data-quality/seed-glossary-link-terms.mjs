#!/usr/bin/env node
// Propose CANDIDATE rows for `glossary_link_terms` — the vocabulary of surface
// forms that may become inline links inside body prose.
//
// THIS SCRIPT NEVER ACTIVATES ANYTHING. It writes `status='candidate'`, which
// links nothing anywhere. A human moves a row to 'active'. That is the whole
// design, and the reason is measured rather than cautious: matching every active
// tag name against 800 city descriptions on prod produced
//
//     A            747 hits   -- a real status='active', seo_indexable tag
//     Town         219
//     River        152
//     Community    129
//     Middle        26        -- is_adult = true  ("Middle East")
//     Offering      17        -- is_adult = true  ("offering visitors…")
//     Public        15        -- is_adult = true  ("public transport")
//
// 1,628 matches over a 400-city sample, 4.1 per description, 93 of them adult
// tags. This is the same defect class as the alias auto-tagging incident fixed
// in 20260910151200 ('culture' → Crops on 2,609 news articles, 'cbt' → Cock &
// Ball Torture), where every alias was a silent auto-tagging rule.
//
// TWO FILTERS, AND ONLY ONE OF THEM IS A SAFETY PROPERTY.
//
//   1. The GATES (tag active, not merged, indexable, not adult, not anon-gated,
//      has a definition) are enforced in `glossary_link_terms_public`, so they
//      hold no matter what this script proposes. Applied here too, to keep the
//      candidate list honest.
//
//   2. The COLLISION VETO — drop any surface form that already appears in our
//      own prose corpus more than --collision-floor times — is NOT a safety
//      property and must never be promoted to one. It makes the review list
//      tractable and orders it; the wrong-SENSE class survives it entirely (a
//      rare word can still be the wrong sense on a kink or health page, which is
//      how "Vacuum Pump" came to publish Otto von Guericke's 1650 device).
//      Every row still needs a human.
//
// TWO THINGS THE FIRST REVIEW PASS MEASURED, which this script now reports
// rather than leaving the next reviewer to rediscover.
//
// (1) `usage_count` DESC SURFACES THE LEAST LINKABLE TERMS FIRST. A tag is
//     high-usage precisely because it is broad: the head of that ordering is
//     `Queer` (12,549 uses, 248 own-prose hits), `Pride`, `LGBTQ` (726),
//     `Community` (922) — words this platform uses on nearly every page, where a
//     link teaches the reader nothing. It is kept as the ordering because it
//     makes the queue finite and repeatable, NOT because it ranks value.
//
// (2) THE TAG NAME IS THE WRONG SURFACE FORM FOR HYPHENATED FACET LABELS.
//     Measured as-written vs de-hyphenated against own-voice prose:
//       Gay-Men 0 / 159   Gay-Bar 0 / 84   Outdoor-Seating 0 / 50
//       Happy-Hour 0 / 32 Human-Rights 1 / 42
//     Prose writes "gay bar"; the facet label is "Gay-Bar"; the matcher is exact
//     on the surface form. So a 0 for these means NEVER MATCHES, not safe — and
//     the failure mode is an inert row that reads as coverage. `spaced_hits`
//     below makes that visible per row and `suggested_form` names the form that
//     actually occurs. `Non-Binary` (74 / 0) is the counter-example: this is
//     per-term, never a rule about hyphens.
//
// Review order is `usage_count` descending — see (1) for why that is a
// tractability device and not a ranking of value.
//
// The rule to apply per row is the one the alias incident earned: IS THIS STRING
// EVER AN ORDINARY ENGLISH WORD, A PLACE, A PERSON, OR AN ACRONYM FOR SOMETHING
// ELSE IN THIS CORPUS? Read back what the term WOULD link, joined to the host
// titles — never the count. The count looks fine when the links are wrong.
//
// Usage:
//   node scripts/data-quality/seed-glossary-link-terms.mjs            # dry run
//   node scripts/data-quality/seed-glossary-link-terms.mjs --write
//   node scripts/data-quality/seed-glossary-link-terms.mjs --limit 200 --write
//
// Re-running is safe and idempotent: the unique index on `surface_form_key`
// makes an already-proposed OR ALREADY-REJECTED form un-reproposable, so a
// rejection is a permanent tombstone rather than junk that returns every run.

import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'

const PROJECT = process.env.SUPABASE_PROJECT_ID ?? 'xqeacpakadqfxjxjcewc'
const UA = 'queer-guide-glossary-link-seed/1.0'
const OUT_DIR = 'scripts/data-quality/out'

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const val = (f) => {
  const i = args.indexOf(f)
  return i >= 0 ? args[i + 1] : undefined
}

const WRITE = has('--write')
const LIMIT = Number(val('--limit') ?? 400)
// 0 means "the surface form must not appear in our own prose at all". Raising it
// trades review volume for recall and is a judgement, so it is a flag.
const COLLISION_FLOOR = Number(val('--collision-floor') ?? 0)
// Mirrors MIN_SURFACE_FORM_LENGTH in src/lib/glossaryLinks.ts and the CHECK on
// the table. Three independent copies is deliberate: the matcher refuses a short
// form at match time, the schema refuses it at write time, and this refuses to
// propose it.
const MIN_LEN = 3

let _token
function token() {
  if (_token) return _token
  if (process.env.SUPABASE_PAT) return (_token = process.env.SUPABASE_PAT)
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim()
  return (_token = Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8'))
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      'User-Agent': UA,
    },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`mgmt API ${res.status}: ${(await res.text()).slice(0, 400)}`)
  return res.json()
}

/**
 * Candidate surface forms with their collision count against our own prose.
 *
 * The collision corpus is deliberately OUR VOICE — city and country
 * descriptions — rather than the whole database: it is what a false positive
 * would disfigure, and it is small enough to scan in one query. `\y` is the
 * Postgres word boundary; `\b` does NOT mean word boundary there and is the
 * trap the news-category work already hit.
 */
const CANDIDATE_SQL = `
with cand as (
  select u.id, u.name, u.slug, u.usage_count
    from unified_tags u
   where u.status = 'active'
     and u.merged_into_id is null
     and coalesce(u.seo_indexable, false)
     and not coalesce(u.is_adult, false)
     and not public.tag_is_anon_gated(u.is_sensitive, u.verification_status)
     and (nullif(btrim(coalesce(u.description, '')), '') is not null
       or nullif(btrim(coalesce(u.short_description, '')), '') is not null
       or nullif(btrim(coalesce(u.long_description, '')), '') is not null)
     and length(btrim(u.name)) >= ${MIN_LEN}
     -- Already proposed, activated or REJECTED: the unique index would refuse
     -- the insert anyway; excluding them here keeps the report honest about what
     -- is genuinely new.
     and not exists (
       select 1 from glossary_link_terms g
        where g.surface_form_key = lower(btrim(u.name))
     )
),
prose as (
  select description as body from cities
   where description is not null and length(description) > 120
     and coalesce(shell_status::text, 'real') not in ('ghost', 'merged')
  union all
  select description from countries where description is not null and length(description) > 120
)
select c.id, c.name, c.slug, coalesce(c.usage_count, 0) as usage_count,
       (select count(*) from prose p
         where p.body ~* ('\\y' || regexp_replace(c.name, '([().*+?\\[\\]{}\\\\^$|])', '\\\\\\1', 'g') || '\\y')
       ) as collisions,
       -- The de-hyphenated form. When this is high and collisions is 0, the tag
       -- NAME is an inert surface form and the spaced one is what prose uses.
       -- (No backticks in this comment: it lives inside a JS template literal,
       --  and a backtick here silently terminates the string.)
       (select count(*) from prose p
         where c.name like '%-%'
           and p.body ~* ('\\y' || regexp_replace(replace(c.name,'-',' '), '([().*+?\\[\\]{}\\\\^$|])', '\\\\\\1', 'g') || '\\y')
       ) as spaced_hits
  from cand c
 order by coalesce(c.usage_count, 0) desc, c.name asc
 limit ${LIMIT * 4};
`

function quote(s) {
  return `'${String(s).replace(/'/g, "''")}'`
}

async function main() {
  // Pre-flight, so running this before the migration lands says so plainly
  // instead of surfacing a bare `42P01: relation … does not exist`.
  const [{ present }] = await sql(
    `select (to_regclass('public.glossary_link_terms') is not null) as present;`,
  )
  if (!present) {
    console.error(
      'glossary_link_terms does not exist yet — apply migration 20600101100000 first.\n' +
        'Nothing was read or written.',
    )
    process.exit(1)
  }

  console.log(`Reading candidates (limit ${LIMIT}, collision floor ${COLLISION_FLOOR})…`)
  const rows = await sql(CANDIDATE_SQL)
  if (!Array.isArray(rows)) throw new Error(`unexpected response: ${JSON.stringify(rows).slice(0, 200)}`)

  const kept = rows.filter((r) => Number(r.collisions) <= COLLISION_FLOOR).slice(0, LIMIT)
  const vetoed = rows.filter((r) => Number(r.collisions) > COLLISION_FLOOR)

  console.log(`\n  ${rows.length} gated candidates read`)
  console.log(`  ${vetoed.length} vetoed by the collision filter`)
  console.log(`  ${kept.length} proposed as candidates (capped at --limit ${LIMIT})`)

  // No silent caps: if the veto or the limit dropped work, say what.
  if (vetoed.length > 0) {
    const worst = vetoed
      .slice()
      .sort((a, b) => Number(b.collisions) - Number(a.collisions))
      .slice(0, 12)
      .map((r) => `${r.name} (${r.collisions})`)
      .join(', ')
    console.log(`\n  Worst collisions, NOT proposed: ${worst}`)
  }
  // An INERT row is not a safe row. If the tag name never occurs in prose but
  // its de-hyphenated form does, activating the name produces a row that links
  // nothing while reading as coverage — so name them separately from the
  // collision vetoes rather than letting them sit in the "clean" pile.
  const inert = kept.filter((r) => Number(r.collisions) === 0 && Number(r.spaced_hits) > 0)
  if (inert.length > 0) {
    console.log(
      `\n  ${inert.length} proposed term(s) NEVER MATCH as written — prose uses the spaced form:`,
    )
    for (const r of inert.slice(0, 15)) {
      console.log(`    ${r.name}  (0 as written, ${r.spaced_hits} as "${String(r.name).replace(/-/g, ' ')}")`)
    }
    console.log('    Activating these as-is yields inert rows. Author the spaced surface form instead.')
  }

  if (rows.length >= LIMIT * 4) {
    console.log(
      `\n  NOTE: the candidate query itself hit its own ${LIMIT * 4}-row read cap — more candidates exist beyond this page.`,
    )
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const reportPath = `${OUT_DIR}/glossary-link-candidates.json`
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generated_for_project: PROJECT,
        collision_floor: COLLISION_FLOOR,
        proposed: kept,
        vetoed_by_collision: vetoed,
      },
      null,
      2,
    ),
  )
  console.log(`\n  Report: ${reportPath}`)

  if (!WRITE) {
    console.log('\nDry run — nothing written. Re-run with --write to insert candidates.')
    console.log('Then REVIEW each row before setting status=\'active\'; a candidate links nothing.')
    return
  }
  if (kept.length === 0) {
    console.log('\nNothing to write.')
    return
  }

  const values = kept
    .map((r) => `(${quote(r.id)}::uuid, ${quote(r.name)}, 'candidate')`)
    .join(',\n    ')
  // `on conflict do nothing` on the surface-form key: a form a human already
  // rejected is a tombstone and must not be resurrected by a later run.
  const res = await sql(`
    insert into glossary_link_terms (tag_id, surface_form, status)
    values
    ${values}
    on conflict (surface_form_key) do nothing
    returning surface_form;
  `)
  const inserted = Array.isArray(res) ? res.length : 0
  console.log(`\n  Inserted ${inserted} candidates (${kept.length - inserted} already known or tombstoned).`)
  console.log('  NOTHING IS LIVE YET — review, then set status=\'active\' per row.')
}

main().catch((e) => {
  console.error(e.message ?? e)
  process.exit(1)
})
