#!/usr/bin/env node
// enrich-organizations.mjs — Phase 2c contact & core-field enrichment for
// organizations (~300 rows). Three passes:
//
//   cities   city_id backfill: organizations with a primary_venue_id and NULL
//            city_id get venues.city_id (pure lookup, always safe).
//   contacts email/phone from the org's own website (homepage + /contact):
//            mailto:/tel: hrefs and a conservative regex, email domains
//            MX-gated via node:dns. Only unambiguous on-site hits write
//            directly (with field_provenance merge); anything fuzzy prints as
//            CSV for manual review — organizations have no *_review_queue.
//   logos    report-only: orgs with a website but no logo_url. The logo.dev
//            token is a server-side secret and stored logos are mirrored to
//            R2 (see supabase/functions/enrich-logos), so this script never
//            composes token URLs — it prints the domain list and recommends
//            running the enrich-logos edge fn (extended to organizations).
//
// Auth: Supabase PAT (keychain on macOS, or SUPABASE_PAT env).
// Default DRY-RUN; pass --apply to write.
//
// Usage:
//   node scripts/data-quality/enrich-organizations.mjs                 # dry-run, all passes
//   node scripts/data-quality/enrich-organizations.mjs --apply
//   node scripts/data-quality/enrich-organizations.mjs --pass contacts --limit 50 --apply

import { execFileSync } from 'node:child_process'
import { resolveMx } from 'node:dns/promises'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const ONLY_PASS = args[args.indexOf('--pass') + 1] && !args[args.indexOf('--pass') + 1].startsWith('--')
  ? args[args.indexOf('--pass') + 1] : null
const LIMIT = Number(args[args.indexOf('--limit') + 1]) || 100

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' }).trim()
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8')
}
const TOKEN = token()

async function sql(query, attempt = 0) {
  let res
  try {
    res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
  } catch (e) {
    if (attempt < 4) { await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)); return sql(query, attempt + 1) }
    throw e
  }
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
    return sql(query, attempt + 1)
  }
  if (!res.ok) throw new Error(`SQL ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

const esc = (s) => String(s).replace(/'/g, "''")
const rows = (res) => (Array.isArray(res) ? res : (res.result ?? []))

async function fetchPage(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide)' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('text/html')) throw new Error(`non-html ${ct}`)
  return (await res.text()).slice(0, 400_000)
}

async function hasMx(domain) {
  try {
    const records = await Promise.race([
      resolveMx(domain),
      new Promise((_, rej) => setTimeout(() => rej(new Error('dns timeout')), 4000)),
    ])
    return Array.isArray(records) && records.length > 0
  } catch { return false }
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
const EMAIL_JUNK = /\.(png|jpe?g|gif|webp|svg|css|js)$|@(example\.|sentry\.|wixpress\.com)/i

function extractEmails(html) {
  const out = new Set()
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    const e = decodeURIComponent(m[1]).trim().toLowerCase()
    if (e.includes('@')) out.add(e)
  }
  for (const m of html.replace(/<[^>]+>/g, ' ').matchAll(EMAIL_RE)) out.add(m[0].toLowerCase())
  return [...out].filter((e) => !EMAIL_JUNK.test(e))
}

function extractPhones(html) {
  const out = new Set()
  for (const m of html.matchAll(/tel:([^"'?\s>]+)/gi)) {
    const digits = decodeURIComponent(m[1]).replace(/\D/g, '')
    if (digits.length >= 7 && digits.length <= 15) out.add(`+${digits}`)
  }
  return [...out]
}

function extractDomain(url) {
  if (!url) return null
  try {
    const withProtocol = /^https?:\/\//.test(url.trim()) ? url.trim() : `https://${url.trim()}`
    const host = new URL(withProtocol).hostname.toLowerCase()
    if (!host || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null
    return host.replace(/^www\./, '')
  } catch { return null }
}

// ---- pass: cities -----------------------------------------------------------
async function passCities() {
  const pending = rows(await sql(`
    select count(*)::int as n
    from public.organizations o join public.venues v on v.id = o.primary_venue_id
    where o.city_id is null and v.city_id is not null
  `))[0]?.n ?? 0
  if (!APPLY) {
    console.log(`cities: ${pending} organizations would get city_id from primary venue (dry-run)`)
    return
  }
  const updated = rows(await sql(`
    update public.organizations o
    set city_id = v.city_id
    from public.venues v
    where v.id = o.primary_venue_id and o.city_id is null and v.city_id is not null
    returning o.id
  `)).length
  console.log(`cities: backfilled city_id on ${updated} organizations`)
}

// ---- pass: contacts ---------------------------------------------------------
async function passContacts() {
  const list = rows(await sql(`
    select id, name, website, email, phone
    from public.organizations
    where website is not null and website <> ''
      and (email is null or phone is null)
      and status = 'active'
    order by trust_score desc nulls last
    limit ${LIMIT}
  `))
  let scanned = 0, wrote = 0
  const manual = []
  for (const org of list) {
    scanned++
    const base = /^https?:\/\//.test(org.website) ? org.website : `https://${org.website}`
    let html = ''
    for (const path of ['', '/contact']) {
      try { html += ` ${await fetchPage(new URL(path || '/', base).toString())}` } catch { /* try next */ }
    }
    if (!html.trim()) continue

    const emails = org.email == null ? extractEmails(html) : []
    const phones = org.phone == null ? extractPhones(html) : []
    const at = new Date().toISOString()
    const sets = []
    const prov = {}

    // High confidence = exactly ONE on-site candidate whose domain has MX.
    if (emails.length === 1 && await hasMx(emails[0].split('@')[1] ?? '')) {
      sets.push(`email = '${esc(emails[0])}'`)
      prov.email = { value: emails[0], confidence: 0.95, sources: [base], source: 'crawl', at }
    } else if (emails.length > 1) {
      manual.push([org.id, org.name, 'email', emails.slice(0, 5).join(' | '), base])
    }
    if (phones.length === 1) {
      sets.push(`phone = '${esc(phones[0])}'`)
      prov.phone = { value: phones[0], confidence: 0.95, sources: [base], source: 'crawl', at }
    } else if (phones.length > 1) {
      manual.push([org.id, org.name, 'phone', phones.slice(0, 5).join(' | '), base])
    }
    if (!sets.length) continue

    if (!APPLY) {
      console.log(`  [dry] ${org.name} (${org.id}) -> ${sets.join(', ')}`)
      wrote++
      continue
    }
    await sql(`
      update public.organizations
      set ${sets.join(', ')},
          field_provenance = field_provenance || '${esc(JSON.stringify(prov))}'::jsonb
      where id = '${esc(org.id)}'
    `)
    wrote++
  }
  console.log(`contacts: scanned ${scanned}, ${APPLY ? 'wrote' : 'would write'} ${wrote}`)
  if (manual.length) {
    console.log('\ncontacts: ambiguous hits for manual review (CSV):')
    console.log('org_id,name,field,candidates,url')
    for (const m of manual) console.log(m.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
  }
}

// ---- pass: logos (report only) ----------------------------------------------
async function passLogos() {
  const list = rows(await sql(`
    select id, name, website
    from public.organizations
    where logo_url is null and website is not null and website <> ''
    order by trust_score desc nulls last
    limit ${LIMIT}
  `))
  const domains = list
    .map((o) => ({ ...o, domain: extractDomain(o.website) }))
    .filter((o) => o.domain)
  console.log(`logos: ${domains.length} organizations missing logo_url (report only)`)
  for (const o of domains) console.log(`  ${o.domain}  (${o.name})`)
  if (domains.length) {
    console.log('\nlogos: do NOT set img.logo.dev URLs directly — the token is a server-side')
    console.log('secret and logos are mirrored to R2. Extend/invoke the enrich-logos edge fn')
    console.log('(supabase/functions/enrich-logos) with table:"organizations" instead.')
  }
}

const PASSES = { cities: passCities, contacts: passContacts, logos: passLogos }
const names = ONLY_PASS ? [ONLY_PASS] : Object.keys(PASSES)
console.log(`enrich-organizations — mode: ${APPLY ? 'APPLY' : 'dry-run'}, passes: ${names.join(', ')}, limit ${LIMIT}`)
for (const n of names) {
  if (!PASSES[n]) { console.error(`unknown pass ${n}`); continue }
  try { await PASSES[n]() } catch (e) { console.error(`${n}: aborted — ${e?.message ?? e}`) }
}
console.log('done.')
