#!/usr/bin/env npx tsx
// Stage C helper: dump the live milestones table (read-only) to
// existing-milestones.json for cross-language dedupe against the new seed.
//
// Usage: npx tsx scripts/data-quality/history-import/export-existing.ts

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PROJECT = 'xqeacpakadqfxjxjcewc'

function token(): string {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim()
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8')
}

async function main() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    body: JSON.stringify({
      query: `
        select m.slug, m.title, m.date, m.date_precision, m.category, m.significance,
               co.code as country_code
        from public.milestones m
        left join public.countries co on co.id = m.country_id
        where m.duplicate_of_id is null
        order by m.date`,
    }),
  })
  if (!res.ok) throw new Error(`mgmt API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const rows = await res.json()
  const out = join(dirname(fileURLToPath(import.meta.url)), 'existing-milestones.json')
  writeFileSync(out, JSON.stringify(rows, null, 1))
  console.log(`${rows.length} existing milestones → existing-milestones.json`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
