#!/usr/bin/env npx tsx
// Post-import cleanup: link the ~42 milestones that landed with a free-text
// country_name but no country_id (the enricher gave a country name the
// import's code-first resolver didn't map — e.g. "USA"). Resolves by matching
// country_name to countries.name (case-insensitive) + a USA→US alias. Genuine
// historical states (East Germany, Czechoslovakia) have no modern code and stay
// free-text. Small + reversible (only sets country_id where it was null).
//
// Same Management-API path as import-milestones.ts.
// Usage: npx tsx scripts/data-quality/history-import/backfill-country-ids.ts [--dry-run]

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const DRY = process.argv.includes('--dry-run')

function token(): string {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim()
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8')
}
const TOKEN = token()

async function sql(query: string): Promise<any[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`mgmt API ${res.status}: ${(await res.text()).slice(0, 400)}`)
  return res.json() as Promise<any[]>
}

const MATCH = `m.country_id is null and m.country_name is not null
  and (lower(m.country_name) = lower(c.name) or (lower(m.country_name) = 'usa' and c.code = 'US'))`

async function main() {
  const preview = await sql(
    `select m.country_name, c.name as resolves_to, count(*) as n
     from public.milestones m join public.countries c on ${MATCH}
     group by 1,2 order by n desc`,
  )
  console.log('Will resolve:')
  for (const r of preview) console.log(`  ${r.n}× "${r.country_name}" → ${r.resolves_to}`)
  const total = preview.reduce((s, r) => s + Number(r.n), 0)
  console.log(`Total: ${total} rows`)

  const stillNull = await sql(
    `select country_name, count(*) n from public.milestones m
     where country_id is null and country_name is not null
       and not exists (select 1 from public.countries c where ${MATCH})
     group by 1 order by n desc`,
  )
  if (stillNull.length)
    console.log(
      `Left as free-text (no modern code): ${stillNull.map((r) => `${r.country_name}(${r.n})`).join(', ')}`,
    )

  if (DRY) {
    console.log('[dry-run] no writes')
    return
  }
  await sql(
    `update public.milestones m set country_id = c.id from public.countries c where ${MATCH}`,
  )
  const [after] = await sql(
    `select count(*) filter (where country_id is null and country_name is not null) as still_null,
            count(*) filter (where country_name ilike 'usa') as usa_named
     from public.milestones`,
  )
  console.log('After:', after)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
