#!/usr/bin/env node
// Reports tag names that may not be English, and applies curated fixes.
//
// unified_tags.name IS the English label by design — name_i18n carries the
// translations and never holds an 'en' key (0 of 8,364 populated rows). So a
// non-English name is a vocabulary defect, not a localisation.
//
// The hard half is enforced in the database: trg_tag_language_guard rejects
// non-Latin script outright (Cyrillic/CJK/Arabic/Greek/Hebrew/Thai/Devanagari),
// which is deterministic and cannot false-positive.
//
// The soft half lives here, and it is a REPORT, not an automatic rewrite. The
// 2026-08-02 audit is why: of 92 non-ASCII tag names, only two were actually
// untranslated ('München', 'Queere Community'). The rest were
//   * people's names   — Ulrike Röseberg, Jannik Schümann, Beyoncé
//   * loanwords/brands — Jägermeister, Crème brûlée, Cachaça, Jalapeños
//   * anatomy/English  — Müllerian, Charité
// A bulk "translate everything that looks foreign" pass would have mangled ten
// people's names. Diacritics mark orthography, not language.
//
// The slug side is handled separately and IS mechanical: normalize_tag_slug()
// now transliterates (café -> cafe) instead of deleting accents, and migration
// 20260802110451 repaired the 67 historical rows.
//
// Auth: a Supabase personal access token (Management API). On macOS the CLI
//   token is read from the keychain automatically; otherwise set SUPABASE_PAT.
//
// Usage:
//   node scripts/data-quality/englishify-tags.mjs              # report only
//   node scripts/data-quality/englishify-tags.mjs --all        # include deprecated
//   node scripts/data-quality/englishify-tags.mjs --apply      # apply RENAMES below

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const ALL = args.includes('--all')

// Curated. Every entry is a decision a human made after reading the tag, its
// category and its usage — add to it rather than widening a heuristic.
// `null` means "deprecate": not an English concept and not worth a tag.
const RENAMES = {
  munchen: 'Munich', // English exonym
  'burgermeister-von-houston': null, // garbled "Bürgermeister von Houston", 0 uses
}

// Names that LOOK foreign but are correct English entries. Kept explicit so the
// report stays actionable instead of crying wolf every run.
const ALLOWED_NON_ASCII = new Set([
  'jagermeister', 'creme-brulee', 'cachaca', 'chevre', 'jalapenos', 'frappes',
  'mullerian', 'charite', 'beyonce',
])

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim()
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8')
}
const TOKEN = token()

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`mgmt API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

const statusFilter = ALL ? '' : `and status = 'active'`

const rows = await sql(`
  SELECT slug, name, status, usage_count, category
    FROM public.unified_tags
   WHERE name ~ '[^\\x00-\\x7F]' ${statusFilter}
   ORDER BY usage_count DESC NULLS LAST, slug;`)

const flagged = rows.filter((r) => !ALLOWED_NON_ASCII.has(r.slug))
console.log(`non-ASCII names: ${rows.length} (${flagged.length} not on the allow-list)\n`)
for (const r of flagged) {
  const verdict = r.slug in RENAMES ? (RENAMES[r.slug] ?? 'DEPRECATE') : 'review'
  console.log(
    `  ${String(r.usage_count ?? 0).padStart(5)}  ${r.slug.padEnd(32)} ${String(r.name).padEnd(28)} ${r.status.padEnd(10)} -> ${verdict}`,
  )
}

// Latin-script but plainly not English. Deliberately a small, high-precision
// word list: a broad one flags every venue named "Casa" or "Haus".
const foreign = await sql(`
  SELECT slug, name, status, usage_count
    FROM public.unified_tags
   WHERE name ~* '\\m(und|für|mit|von|nicht|schwul|lesbisch|queere|veranstaltung|künstler|hörspiel|hörbuch|identität|bisexualität|preisträger)\\M'
     ${statusFilter}
   ORDER BY usage_count DESC NULLS LAST;`)
console.log(`\nLatin-script foreign-word hits: ${foreign.length}`)
for (const r of foreign) console.log(`  ${String(r.usage_count ?? 0).padStart(5)}  ${r.slug} — ${r.name} (${r.status})`)

if (!APPLY) {
  console.log('\n(report only — pass --apply to action the curated RENAMES map)')
  process.exit(0)
}

for (const [slug, target] of Object.entries(RENAMES)) {
  // app.actor must not match 'system:%': log_unified_tag_change() raises when a
  // system actor touches a human_reviewed tag, and it aborts the whole statement.
  if (target === null) {
    await sql(`
      SELECT set_config('app.actor','admin:englishify-tags',false);
      UPDATE public.unified_tags
         SET status = 'deprecated', deprecated_at = now(),
             deprecation_reason = 'englishify: not an English concept'
       WHERE slug = '${slug}' AND status = 'active';`)
    console.log(`deprecated ${slug}`)
  } else {
    // Renaming the name re-derives the slug via trg_normalize_tag_input.
    await sql(`
      SELECT set_config('app.actor','admin:englishify-tags',false);
      UPDATE public.unified_tags SET name = '${target.replace(/'/g, "''")}' WHERE slug = '${slug}';`)
    console.log(`renamed ${slug} -> ${target}`)
  }
}
