#!/usr/bin/env node
// Audit the Twenty CRM workspace schema against what twenty-sync sends.
//
// The 2026-07-16 TEXT→typed field migration (docs/integrations/twenty-crm-field-types.md)
// was found stalled: typed fields still exist under temporary `*V2` names with no data,
// legacy TEXT fields still hold the data, and some V2 LINKS fields have metadata but no
// backing DB column (list queries on the object error). This script reports, per object:
//   field / type / active / probeOk (column really exists) / hasValue (any record non-null)
// so twenty-schema-repair.mjs can be driven from facts, not the doc.
//
// Read-only. Auth: TWENTY_API_URL + TWENTY_API_KEY env (same values as the edge secrets).
//
// Usage:
//   TWENTY_API_URL=https://crm.queer.guide TWENTY_API_KEY=... \
//     node scripts/data-quality/twenty-schema-audit.mjs [--object companies] [--json]

const API_URL = (process.env.TWENTY_API_URL ?? '').replace(/\/+$/, '')
const API_KEY = process.env.TWENTY_API_KEY ?? ''
if (!API_URL || !API_KEY) {
  console.error('Set TWENTY_API_URL and TWENTY_API_KEY')
  process.exit(1)
}

const args = process.argv.slice(2)
const AS_JSON = args.includes('--json')
const ONLY_OBJECT = args[args.indexOf('--object') + 1] && !args[args.indexOf('--object') + 1].startsWith('--')
  ? args[args.indexOf('--object') + 1] : null

// Objects twenty-sync writes to (plural API names).
const SYNCED_OBJECTS = [
  'companies', 'people', 'venues', 'qgEvents', 'qgCities', 'qgCountries',
  'hotels', 'villages', 'newsArticles', 'products',
]

// Composite types → subfield used for a NOT_NULL probe filter.
const PROBE_SUBFIELD = {
  LINKS: 'primaryLinkUrl',
  EMAILS: 'primaryEmail',
  PHONES: 'primaryPhoneNumber',
  CURRENCY: 'amountMicros',
  FULL_NAME: 'firstName',
}
// Types we can't meaningfully probe with a NOT_NULL filter — report schema only.
const SKIP_PROBE = new Set(['RELATION', 'ACTOR', 'RICH_TEXT_V2', 'TS_VECTOR', 'POSITION'])

async function twenty(path, init = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* non-JSON error body */ }
  return { ok: res.ok, status: res.status, json, text: text.slice(0, 300) }
}

async function fetchAllObjects() {
  const out = []
  let cursor = null
  for (let i = 0; i < 50; i++) {
    const q = `/rest/metadata/objects?limit=100${cursor ? `&starting_after=${cursor}` : ''}`
    const { ok, json, status, text } = await twenty(q)
    if (!ok) throw new Error(`metadata/objects → ${status} ${text}`)
    const rows = json?.data?.objects ?? []
    out.push(...rows)
    const pi = json?.pageInfo
    if (pi?.hasNextPage && rows.length) cursor = pi.endCursor
    else break
  }
  return out
}

// Probe: does the column actually exist, and does any record hold a value?
// A filter on a metadata-only field (no DB column) errors → probeOk=false.
async function probeField(objPlural, field) {
  if (SKIP_PROBE.has(field.type)) return { probeOk: null, hasValue: null }
  const sub = PROBE_SUBFIELD[field.type]
  const target = sub ? `${field.name}.${sub}` : field.name
  const { ok, status, text, json } = await twenty(
    `/rest/${objPlural}?limit=1&filter=${encodeURIComponent(`${target}[is]:NOT_NULL`)}`,
  )
  if (!ok) return { probeOk: false, hasValue: null, error: `${status} ${text.replace(/\s+/g, ' ')}` }
  const rows = json?.data?.[objPlural] ?? []
  let hasValue = rows.length > 0
  // TEXT columns store '' rather than NULL — treat '' as empty.
  if (hasValue && field.type === 'TEXT') {
    const v = rows[0]?.[field.name]
    if (v === '' ) {
      const r2 = await twenty(`/rest/${objPlural}?limit=1&filter=${encodeURIComponent(`${field.name}[gt]:`)}`)
      hasValue = (r2.json?.data?.[objPlural] ?? []).length > 0
    }
  }
  return { probeOk: true, hasValue }
}

const objects = await fetchAllObjects()
const report = []
for (const obj of objects) {
  const plural = obj.namePlural
  if (!SYNCED_OBJECTS.includes(plural)) continue
  if (ONLY_OBJECT && plural !== ONLY_OBJECT) continue
  const fields = (obj.fields ?? []).filter((f) => f.isCustom || f.name === 'externalId')
  const rows = []
  for (const f of fields) {
    const probe = await probeField(plural, f)
    rows.push({
      field: f.name, id: f.id, type: f.type, active: f.isActive,
      probeOk: probe.probeOk, hasValue: probe.hasValue, error: probe.error,
    })
  }
  report.push({ object: plural, objectId: obj.id, fields: rows })
}

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2))
} else {
  for (const o of report) {
    console.log(`\n== ${o.object} ==`)
    const pad = (s, n) => String(s ?? '').padEnd(n)
    console.log(pad('field', 28) + pad('type', 14) + pad('active', 8) + pad('probeOk', 9) + 'hasValue')
    for (const f of o.fields) {
      const flag = f.probeOk === false ? '  ← BROKEN (no column?)' : ''
      console.log(pad(f.field, 28) + pad(f.type, 14) + pad(f.active, 8) + pad(f.probeOk, 9) + `${f.hasValue}${flag}`)
      if (f.error) console.log(`  error: ${f.error}`)
    }
  }
  const broken = report.flatMap((o) => o.fields.filter((f) => f.probeOk === false).map((f) => `${o.object}.${f.field}`))
  const v2 = report.flatMap((o) => o.fields.filter((f) => /V2$/.test(f.field)).map((f) => `${o.object}.${f.field}`))
  console.log(`\nBroken fields (metadata without column): ${broken.length ? broken.join(', ') : 'none'}`)
  console.log(`Fields still carrying a V2 suffix (rename pending): ${v2.length ? v2.join(', ') : 'none'}`)
}
