#!/usr/bin/env node
// Complete the stalled Twenty TEXT→typed field migration (see
// docs/integrations/twenty-crm-field-types.md and twenty-schema-audit.mjs).
//
// Per object, for each field listed in MIGRATION:
//   1. If the typed `<field>V2` is BROKEN (metadata without a DB column — filter probe
//      errors): deactivate + delete its metadata. It holds no data, so nothing is lost.
//   2. Rename legacy `<field>` (TEXT, has the data) → `<field>Legacy`, deactivate (archive).
//   3. Rename intact `<field>V2` → `<field>` — or, if it was deleted in step 1, recreate
//      `<field>` with the correct type (LINKS etc.).
//   4. Probe the final field to confirm the column answers queries.
// Data is NOT copied: Supabase is the source of truth, a full twenty-sync re-push
// repopulates every typed field (docs/integrations/twenty-crm-sync.md backfill loop).
//
// Also ensures companies has a plain-TEXT `qgDomain` (normalized domain for
// filtering/grouping — deliberately NOT Twenty's auto-merging `domainName`).
//
// DRY-RUN by default. Run with --apply to execute. Take a Twenty DB backup first.
// Test a single field first, e.g.:
//   node scripts/data-quality/twenty-schema-repair.mjs --object villages --field qgWebsite --apply
//
// Auth: TWENTY_API_URL + TWENTY_API_KEY env.

const API_URL = (process.env.TWENTY_API_URL ?? '').replace(/\/+$/, '')
const API_KEY = process.env.TWENTY_API_KEY ?? ''
if (!API_URL || !API_KEY) {
  console.error('Set TWENTY_API_URL and TWENTY_API_KEY')
  process.exit(1)
}

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const argAfter = (flag) => {
  const v = args[args.indexOf(flag) + 1]
  return args.includes(flag) && v && !v.startsWith('--') ? v : null
}
const ONLY_OBJECT = argAfter('--object')
const ONLY_FIELD = argAfter('--field')

// object (plural) → final field name → target type (+ options for SELECT/MULTI_SELECT,
// used only if the typed field must be recreated). Mirrors twenty-crm-field-types.md.
const OPT = (vals) => vals.map((v, i) => ({ label: v.replace(/_/g, ' '), value: v, position: i, color: 'sky' }))
const MIGRATION = {
  companies: {
    qgStatus: { type: 'SELECT', options: OPT(['ACTIVE', 'INACTIVE', 'PENDING']) },
    qgClaimStatus: { type: 'SELECT', options: OPT(['UNCLAIMED', 'CLAIMED', 'PENDING']) },
    qgSource: { type: 'SELECT', options: OPT(['ORGANIZATION', 'MERCHANT']) },
    qgProvider: { type: 'SELECT', options: OPT(['SHOPIFY_PUBLIC', 'WOOCOMMERCE_PUBLIC', 'CRAWL']) },
    qgLastSyncStatus: { type: 'SELECT', options: OPT(['OK', 'ERROR']) },
    qgRoles: { type: 'MULTI_SELECT', options: OPT(['VENUE', 'SUPPORT', 'SELLER', 'PUBLISHER']) },
    qgEmail: { type: 'EMAILS' }, qgPhone: { type: 'PHONES' },
    qgWebsite: { type: 'LINKS' }, qgLogoUrl: { type: 'LINKS' },
  },
  people: {
    qgSource: { type: 'SELECT', options: OPT(['PERSONALITY', 'USER', 'CONTACT']) },
    qgBirthDate: { type: 'DATE' }, qgDeathDate: { type: 'DATE' },
    qgWebsite: { type: 'LINKS' }, qgImageUrl: { type: 'LINKS' },
  },
  hotels: {
    qgType: { type: 'SELECT', options: OPT(['BNB', 'APARTMENT', 'HOTEL', 'RESORT']) },
    qgEmail: { type: 'EMAILS' }, qgPhone: { type: 'PHONES' },
    qgWebsite: { type: 'LINKS' }, qgBookingUrl: { type: 'LINKS' },
  },
  qgEvents: {
    qgStartDate: { type: 'DATE_TIME' }, qgEndDate: { type: 'DATE_TIME' },
    qgType: { type: 'SELECT', options: OPT(['CONCERT', 'PRIDE', 'DRAG', 'PARTY', 'FILM', 'FETISH', 'PROTEST', 'FUNDRAISER', 'THEATER', 'SPORTS', 'SOCIAL', 'ART', 'WORKSHOP', 'FESTIVAL', 'CONFERENCE', 'FAIR', 'COMMUNITY', 'MEETUP', 'OTHER']) },
    qgStatus: { type: 'SELECT', options: OPT(['ACTIVE', 'COMPLETED', 'CANCELLED', 'POSTPONED']) },
    qgLiveness: { type: 'SELECT', options: OPT(['LIVE', 'CANCELLED', 'UNKNOWN']) },
    qgWebsite: { type: 'LINKS' }, qgTicketUrl: { type: 'LINKS' },
  },
  venues: {
    qgCategory: { type: 'SELECT', options: OPT(['BAR', 'CLUB', 'SAUNA', 'CAFE', 'RESTAURANT', 'OUTDOOR', 'HOTEL', 'SHOP', 'COMMUNITY_CENTER', 'EVENT_VENUE', 'CRUISING', 'THEATER', 'SALON', 'GALLERY', 'ORGANIZATION', 'GYM', 'OTHER']) },
    qgSubtype: { type: 'SELECT', options: OPT(['NUDE_BEACH', 'NATURIST_RESORT', 'HOT_SPRING', 'BNB', 'OTHER']) },
    qgClosedAt: { type: 'DATE' },
    qgEmail: { type: 'EMAILS' }, qgPhone: { type: 'PHONES' },
    qgWebsite: { type: 'LINKS' }, qgBookingUrl: { type: 'LINKS' }, qgInstagram: { type: 'LINKS' },
  },
  newsArticles: {
    qgPublishedAt: { type: 'DATE_TIME' },
    qgSentiment: { type: 'SELECT', options: OPT(['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED']) },
    qgMediaType: { type: 'SELECT', options: OPT(['ARTICLE', 'PODCAST']) },
    qgCategory: { type: 'SELECT', options: OPT(['GENERAL', 'POLITICS', 'CULTURE', 'SPORTS', 'TRANSGENDER', 'LEGISLATION', 'ADVOCACY', 'HUMAN_RIGHTS', 'HEALTH', 'EDUCATION', 'LIFESTYLE', 'RIGHTS', 'NEWS']) },
    qgLanguage: { type: 'SELECT', options: OPT(['EN', 'DE', 'IT', 'FR', 'ES', 'PT', 'NL']) },
    qgUrl: { type: 'LINKS' }, qgCanonicalUrl: { type: 'LINKS' }, qgImageUrl: { type: 'LINKS' },
  },
  products: {
    qgAvailability: { type: 'SELECT', options: OPT(['IN_STOCK', 'OUT_OF_STOCK', 'UNKNOWN']) },
    qgPriceType: { type: 'SELECT', options: OPT(['FIXED', 'STARTING_AT']) },
    qgContentRating: { type: 'SELECT', options: OPT(['SFW', 'ADULT', 'EXPLICIT', 'SUGGESTIVE']) },
    qgDepartment: { type: 'SELECT', options: OPT(['APPAREL', 'UNDERWEAR', 'SWIMWEAR', 'INTIMACY', 'BDSM_FETISH', 'HYGIENE', 'JEWELRY', 'BOOKS_ART', 'SERVICES', 'OTHER']) },
    qgCurrency: { type: 'SELECT', options: OPT(['EUR', 'USD', 'GBP', 'AUD', 'CAD', 'SEK', 'CHF', 'NOK', 'DKK', 'JPY']) },
    qgOwnershipTags: { type: 'MULTI_SELECT', options: OPT(['QUEER_OWNED', 'TRANS_OWNED', 'WOMEN_OWNED', 'BLACK_OWNED']) },
    qgUrl: { type: 'LINKS' },
  },
  qgCities: { qgOfficialWebsite: { type: 'LINKS' }, qgImageUrl: { type: 'LINKS' } },
  qgCountries: { qgImageUrl: { type: 'LINKS' } },
  villages: { qgWebsite: { type: 'LINKS' }, qgImageUrl: { type: 'LINKS' } },
}

const PROBE_SUBFIELD = { LINKS: 'primaryLinkUrl', EMAILS: 'primaryEmail', PHONES: 'primaryPhoneNumber', CURRENCY: 'amountMicros' }

async function twenty(path, init = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, json, text: text.slice(0, 300) }
}

async function fetchObjects() {
  const out = []
  let cursor = null
  for (let i = 0; i < 50; i++) {
    const { ok, json, status, text } = await twenty(`/rest/metadata/objects?limit=100${cursor ? `&starting_after=${cursor}` : ''}`)
    if (!ok) throw new Error(`metadata/objects → ${status} ${text}`)
    const rows = json?.data?.objects ?? []
    out.push(...rows)
    const pi = json?.pageInfo
    if (pi?.hasNextPage && rows.length) cursor = pi.endCursor
    else break
  }
  return out
}

async function probeOk(plural, name, type) {
  const sub = PROBE_SUBFIELD[type]
  const target = sub ? `${name}.${sub}` : name
  const r = await twenty(`/rest/${plural}?limit=1&filter=${encodeURIComponent(`${target}[is]:NOT_NULL`)}`)
  return r.ok
}

const act = async (desc, fn) => {
  console.log(`${APPLY ? '→' : '[dry-run]'} ${desc}`)
  if (!APPLY) return { ok: true, dryRun: true }
  const r = await fn()
  if (!r.ok) console.error(`  FAILED: ${r.status} ${r.text}`)
  return r
}
const patchField = (id, body) => twenty(`/rest/metadata/fields/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
const deleteField = (id) => twenty(`/rest/metadata/fields/${id}`, { method: 'DELETE' })
const createField = (body) => twenty(`/rest/metadata/fields`, { method: 'POST', body: JSON.stringify(body) })

const objects = await fetchObjects()
let failures = 0

for (const [plural, fields] of Object.entries(MIGRATION)) {
  if (ONLY_OBJECT && plural !== ONLY_OBJECT) continue
  const obj = objects.find((o) => o.namePlural === plural)
  if (!obj) { console.error(`object ${plural} not found — skipping`); failures++; continue }
  const byName = new Map((obj.fields ?? []).map((f) => [f.name, f]))
  console.log(`\n== ${plural} ==`)

  for (const [finalName, spec] of Object.entries(fields)) {
    if (ONLY_FIELD && finalName !== ONLY_FIELD) continue
    const legacy = byName.get(finalName)
    const v2 = byName.get(`${finalName}V2`)
    const legacyArchived = byName.get(`${finalName}Legacy`)

    // Already migrated (final name has the right type, no V2 remnant)?
    if (legacy && legacy.type === spec.type && !v2) { console.log(`✓ ${finalName} already ${spec.type}`); continue }
    if (!legacy && !v2 && legacyArchived) { console.log(`? ${finalName}: only ${finalName}Legacy present — needs recreate`) }

    // 1. Broken V2 (metadata without column) → delete metadata (holds no data).
    let v2Usable = false
    if (v2) {
      v2Usable = await probeOk(plural, v2.name, v2.type)
      if (!v2Usable) {
        const r = await act(`${plural}.${v2.name} BROKEN (no column) — deactivate + delete metadata`, async () => {
          await patchField(v2.id, { isActive: false })
          return deleteField(v2.id)
        })
        if (!r.ok) { failures++; continue }
      }
    }

    // 2. Archive legacy TEXT under <field>Legacy.
    if (legacy && legacy.type === 'TEXT') {
      const r = await act(`${plural}.${finalName} (TEXT, legacy) — rename → ${finalName}Legacy + deactivate`, () =>
        patchField(legacy.id, { name: `${finalName}Legacy`, label: `${legacy.label} (legacy)`, isActive: false }))
      if (!r.ok) { failures++; continue }
    } else if (legacy && legacy.type !== spec.type) {
      console.error(`! ${plural}.${finalName} exists with unexpected type ${legacy.type} (want ${spec.type}) — manual check`)
      failures++
      continue
    }

    // 3. Promote intact V2 → final name, or recreate the field fresh.
    if (v2 && v2Usable) {
      const r = await act(`${plural}.${v2.name} → rename → ${finalName}`, () =>
        patchField(v2.id, { name: finalName, label: (v2.label ?? finalName).replace(/\s*V2$/i, '') }))
      if (!r.ok) { failures++; continue }
    } else {
      const body = {
        objectMetadataId: obj.id, name: finalName, label: finalName.replace(/^qg/, 'QG '),
        type: spec.type, ...(spec.options ? { options: spec.options } : {}),
      }
      const r = await act(`${plural}.${finalName} — create ${spec.type}`, () => createField(body))
      if (!r.ok) { failures++; continue }
    }

    // 4. Verify the final field answers queries.
    if (APPLY) {
      const ok = await probeOk(plural, finalName, spec.type)
      console.log(ok ? `✓ ${plural}.${finalName} probe OK` : `✗ ${plural}.${finalName} probe FAILED after repair`)
      if (!ok) failures++
    }
  }
}

// companies.qgDomain — plain TEXT domain for filtering (never the auto-merging domainName).
if (!ONLY_OBJECT || ONLY_OBJECT === 'companies') {
  const companies = objects.find((o) => o.namePlural === 'companies')
  if (companies && !(companies.fields ?? []).some((f) => f.name === 'qgDomain')) {
    const r = await act('companies.qgDomain — create TEXT', () =>
      createField({ objectMetadataId: companies.id, name: 'qgDomain', label: 'QG Domain', type: 'TEXT' }))
    if (!r.ok) failures++
  }
}

// Phase 5 quality-score fields on the 7 content objects (create if missing).
// twenty-sync maps these from the source scores (organizations already push them
// on companies); this MUST run before the next twenty-sync deploy or its upserts
// fail with unknown-field errors.
const SCORE_OBJECTS = ['venues', 'qgEvents', 'hotels', 'qgCities', 'qgCountries', 'villages', 'products']
const SCORE_FIELDS = {
  qgCompletenessScore: { type: 'NUMBER', label: 'QG Completeness Score' },
  qgTrustScore: { type: 'NUMBER', label: 'QG Trust Score' },
  qgNeedsAttention: { type: 'BOOLEAN', label: 'QG Needs Attention' },
}
for (const plural of SCORE_OBJECTS) {
  if (ONLY_OBJECT && plural !== ONLY_OBJECT) continue
  const obj = objects.find((o) => o.namePlural === plural)
  if (!obj) { console.error(`object ${plural} not found — skipping score fields`); failures++; continue }
  const byName = new Map((obj.fields ?? []).map((f) => [f.name, f]))
  for (const [name, spec] of Object.entries(SCORE_FIELDS)) {
    if (ONLY_FIELD && name !== ONLY_FIELD) continue
    const existing = byName.get(name)
    if (existing) {
      if (existing.type !== spec.type) { console.error(`! ${plural}.${name} exists as ${existing.type} (want ${spec.type}) — manual check`); failures++ }
      else console.log(`✓ ${plural}.${name} already ${spec.type}`)
      continue
    }
    const r = await act(`${plural}.${name} — create ${spec.type}`, () =>
      createField({ objectMetadataId: obj.id, name, label: spec.label, type: spec.type }))
    if (!r.ok) failures++
  }
}

console.log(`\n${APPLY ? 'Applied.' : 'Dry-run complete.'} Failures: ${failures}`)
console.log('Next: re-run twenty-schema-audit.mjs, then full re-push (twenty-crm-sync.md backfill loop).')
process.exit(failures ? 1 : 0)
