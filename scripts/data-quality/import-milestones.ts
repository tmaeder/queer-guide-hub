#!/usr/bin/env npx tsx
// One-shot import of the curated queer-history milestones from the person-db
// curation tool (tools/person-db/src/lib/milestones.ts, ~110 entries) into the
// live `milestones` table + `milestone_links` (personality N:M).
//
// Resolution: German country names → alpha-2 via the tool's flags.ts map (plus
// a small supplement for names it lacks) → countries.code; cities country-scoped
// by lower(unaccent(name)); linked persons by personalities.slug. Unresolved
// anything → warning + kept as free text (country_name/city_name) or stashed in
// field_provenance.unresolved_persons.
//
// Idempotent: upsert on slug. Re-runs never overwrite status/review_status/
// is_featured (admin-owned after launch); personality links are delete+reinsert.
//
// Auth: Supabase Management API via the macOS-keychain CLI token (house
// pattern; set SUPABASE_PAT to override). Batches of 25 keep the
// search_documents sync trigger load trivial on the disk-constrained DB.
//
// Usage:
//   npx tsx scripts/data-quality/import-milestones.ts --dry-run
//   npx tsx scripts/data-quality/import-milestones.ts

import { execFileSync } from 'node:child_process'
import { MILESTONE_SEED, type Milestone } from '../../tools/person-db/src/lib/milestones'
import { nameToAlpha2 } from '../../tools/person-db/src/lib/flags'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const DRY = process.argv.includes('--dry-run')
const BATCH = 25

// Seed country names the tool's flags.ts map doesn't cover.
const EXTRA_CC: Record<string, string> = {
  'vereinigte staaten': 'US',
  uruguay: 'UY',
  mauritius: 'MU',
  botswana: 'BW',
  bhutan: 'BT',
  ecuador: 'EC',
}

const CATEGORY_MAP: Record<string, string> = {
  'Aufstand / Bewegung': 'uprising-movement',
  'Gesetz / Gleichstellung': 'law-equality',
  'Recht / Entkriminalisierung': 'law-decriminalization',
  'Recht / Kriminalisierung': 'law-criminalization',
  Entpathologisierung: 'depathologization',
  'Verfolgung / Zerstörung': 'persecution-destruction',
}

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

// Dollar-quoted jsonb literal (content is trusted seed data; the tag never
// appears in it).
function jsonbLit(value: unknown): string {
  const s = JSON.stringify(value)
  if (s.includes('$mjson$')) throw new Error('dollar-quote tag collision')
  return `$mjson$${s}$mjson$::jsonb`
}

function parseDate(raw: string | undefined): { date: string; precision: string } | null {
  if (!raw) return null
  if (/^\d{4}$/.test(raw)) return { date: `${raw}-01-01`, precision: 'year' }
  if (/^\d{4}-\d{2}$/.test(raw)) return { date: `${raw}-01`, precision: 'month' }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { date: raw, precision: 'day' }
  return null
}

async function main() {
  // Dedupe seeds by id (merged blocks may overlap)
  const seen = new Map<string, Milestone>()
  for (const m of MILESTONE_SEED) {
    if (seen.has(m.id)) console.warn(`⚠ duplicate seed id (later wins): ${m.id}`)
    seen.set(m.id, m)
  }
  const seeds = [...seen.values()]
  console.log(`Seeds: ${MILESTONE_SEED.length} raw → ${seeds.length} unique`)

  // --- resolve countries -----------------------------------------------------
  const unresolvedCountries = new Set<string>()
  const ccOf = (name: string | undefined): string => {
    if (!name) return ''
    const cc = nameToAlpha2(name) || EXTRA_CC[name.trim().toLowerCase()] || ''
    if (!cc) unresolvedCountries.add(name)
    return cc
  }
  const codes = [...new Set(seeds.map((s) => ccOf(s.country)).filter(Boolean))]
  const countryRows = await sql(
    `select id, code, name from public.countries where code in (${codes.map((c) => `'${c}'`).join(',')})`
  )
  const countryByCode = new Map(countryRows.map((r) => [r.code as string, r]))

  // --- resolve cities (country-scoped) --------------------------------------
  const cityPairs = seeds
    .map((s) => ({ cc: ccOf(s.country), city: s.city?.trim() }))
    .filter((p): p is { cc: string; city: string } => !!p.cc && !!p.city && !!countryByCode.get(p.cc))
  const cityValues = [
    ...new Set(cityPairs.map((p) => `('${countryByCode.get(p.cc)!.id}'::uuid, ${jsonStr(p.city)})`)),
  ]
  const cityByKey = new Map<string, any>()
  if (cityValues.length) {
    const cityRows = await sql(`
      with want(country_id, cname) as (values ${cityValues.join(',')})
      select w.country_id, w.cname, c.id, c.name
      from want w
      join public.cities c
        on c.country_id = w.country_id
       and lower(extensions.unaccent(c.name)) = lower(extensions.unaccent(w.cname))
      where c.duplicate_of_id is null`)
    for (const r of cityRows) cityByKey.set(`${r.country_id}|${(r.cname as string).toLowerCase()}`, r)
  }

  // --- resolve personalities -------------------------------------------------
  const personSlugs = [...new Set(seeds.flatMap((s) => s.linked_persons.map((p) => p.slug)))]
  const personRows = personSlugs.length
    ? await sql(
        `select id, slug from public.personalities where duplicate_of_id is null and slug in (${personSlugs.map((s) => jsonStr(s)).join(',')})`
      )
    : []
  const personBySlug = new Map(personRows.map((r) => [r.slug as string, r.id as string]))

  // --- build rows ------------------------------------------------------------
  const unresolvedCities: string[] = []
  const unresolvedPersons: string[] = []
  const rows = seeds.flatMap((s) => {
    const d = parseDate(s.date)
    if (!d) {
      console.warn(`⚠ skipping ${s.id}: unparseable date '${s.date}'`)
      return []
    }
    const de = parseDate(s.date_end)
    const cc = ccOf(s.country)
    const country = cc ? countryByCode.get(cc) : undefined
    const cityKey = country && s.city ? `${country.id}|${s.city.trim().toLowerCase()}` : ''
    const city = cityKey ? cityByKey.get(cityKey) : undefined
    if (country && s.city && !city) unresolvedCities.push(`${s.city} (${s.country})`)
    const unresolved = s.linked_persons.filter((p) => !personBySlug.has(p.slug))
    for (const p of unresolved) unresolvedPersons.push(`${p.slug} @ ${s.id}`)
    const category = s.category ? (CATEGORY_MAP[s.category] ?? 'other') : null
    if (s.category && !CATEGORY_MAP[s.category])
      console.warn(`⚠ unknown category '${s.category}' on ${s.id} → other`)
    return [
      {
        slug: s.id,
        title: s.title,
        description: s.description || null,
        date: d.date,
        date_precision: d.precision,
        date_end: de?.date ?? null,
        date_end_precision: de?.precision ?? null,
        location: s.location || null,
        region: s.region || null,
        city_name: s.city || null,
        country_name: s.country || null,
        city_id: city?.id ?? null,
        country_id: country?.id ?? null,
        category,
        impact: s.impact,
        significance: s.significance,
        sources: s.sources,
        tags: [],
        status: 'published',
        review_status: s.checked ? 'approved' : 'pending',
        seo_indexable: s.checked,
        field_provenance: {
          source: 'person-db-tool-import-2026-07',
          ...(unresolved.length ? { unresolved_persons: unresolved } : {}),
        },
        _links: s.linked_persons
          .filter((p) => personBySlug.has(p.slug))
          .map((p, i) => ({ person_id: personBySlug.get(p.slug), role: p.role ?? null, sort_order: i })),
      },
    ]
  })

  console.log(`Prepared ${rows.length} rows; ${rows.filter((r) => r.country_id).length} with country_id, ${rows.filter((r) => r.city_id).length} with city_id, ${rows.reduce((n, r) => n + r._links.length, 0)} person links`)
  if (unresolvedCountries.size) console.warn(`⚠ unresolved countries: ${[...unresolvedCountries].join(', ')}`)
  if (unresolvedCities.length) console.warn(`⚠ unresolved cities:\n  ${[...new Set(unresolvedCities)].join('\n  ')}`)
  if (unresolvedPersons.length) console.warn(`⚠ unresolved persons:\n  ${unresolvedPersons.join('\n  ')}`)
  if (DRY) {
    console.log('[dry-run] no writes')
    return
  }

  // --- upsert milestones in batches -----------------------------------------
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map(({ _links, ...r }) => r)
    await sql(`
      insert into public.milestones
        (slug, title, description, date, date_precision, date_end, date_end_precision,
         location, region, city_name, country_name, city_id, country_id,
         category, impact, significance, sources, tags, status, review_status,
         seo_indexable, field_provenance)
      select x.slug, x.title, x.description, x.date, x.date_precision, x.date_end, x.date_end_precision,
             x.location, x.region, x.city_name, x.country_name, x.city_id, x.country_id,
             x.category, x.impact, x.significance, x.sources, coalesce(x.tags, '{}'), x.status, x.review_status,
             x.seo_indexable, x.field_provenance
      from jsonb_to_recordset(${jsonbLit(batch)}) as x(
        slug text, title text, description text, date date, date_precision text,
        date_end date, date_end_precision text, location text, region text,
        city_name text, country_name text, city_id uuid, country_id uuid,
        category text, impact text, significance smallint, sources jsonb,
        tags text[], status text, review_status text, seo_indexable boolean,
        field_provenance jsonb)
      on conflict (slug) do update set
        title = excluded.title, description = excluded.description,
        date = excluded.date, date_precision = excluded.date_precision,
        date_end = excluded.date_end, date_end_precision = excluded.date_end_precision,
        location = excluded.location, region = excluded.region,
        city_name = excluded.city_name, country_name = excluded.country_name,
        city_id = excluded.city_id, country_id = excluded.country_id,
        category = excluded.category, impact = excluded.impact,
        significance = excluded.significance, sources = excluded.sources,
        field_provenance = excluded.field_provenance`)
    console.log(`  upserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`)
  }

  // --- sync personality links (delete+reinsert, idempotent) ------------------
  const idRows = await sql(
    `select id, slug from public.milestones where slug in (${rows.map((r) => jsonStr(r.slug)).join(',')})`
  )
  const idBySlug = new Map(idRows.map((r) => [r.slug as string, r.id as string]))
  const linkRows = rows.flatMap((r) =>
    r._links.map((l) => ({
      milestone_id: idBySlug.get(r.slug),
      entity_type: 'personality',
      entity_id: l.person_id,
      role: l.role,
      sort_order: l.sort_order,
    }))
  )
  if (linkRows.length) {
    const milestoneIds = [...new Set(linkRows.map((l) => l.milestone_id))]
    await sql(`
      delete from public.milestone_links
      where entity_type = 'personality'
        and milestone_id in (${milestoneIds.map((id) => `'${id}'::uuid`).join(',')})`)
    await sql(`
      insert into public.milestone_links (milestone_id, entity_type, entity_id, role, sort_order)
      select milestone_id, entity_type, entity_id, role, sort_order
      from jsonb_to_recordset(${jsonbLit(linkRows)}) as x(
        milestone_id uuid, entity_type text, entity_id uuid, role text, sort_order smallint)
      on conflict (milestone_id, entity_type, entity_id) do update
        set role = excluded.role, sort_order = excluded.sort_order`)
    console.log(`Synced ${linkRows.length} personality links`)
  }

  // --- verify ----------------------------------------------------------------
  const [counts] = await sql(`
    select (select count(*) from public.milestones) as milestones,
           (select count(*) from public.milestones where safety_gated) as gated,
           (select count(*) from public.milestone_links) as links,
           (select count(*) from public.search_documents where entity_type='milestone') as search_docs`)
  console.log('Verification:', counts)
}

function jsonStr(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
