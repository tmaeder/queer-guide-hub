# Personality Data Flywheel — Phase 1 (Backbone + Loop A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a self-prioritizing refresh loop that continuously fills blank/stale personality fields from Wikidata + Wikipedia, with full provenance, never clobbering curated data.

**Architecture:** A SQL view (`personality_data_health`) scores every personality by data-debt × staleness × traffic. A new `personality-refresh` edge function pulls the top-N worst records, fetches multi-source facts, fills only blank columns, writes a `personality_sources` provenance row, stamps `last_refreshed_at`, and recomputes `quality_score`. A pg_cron job invokes it on a schedule. No staging round-trip — this heals *existing* records in place (the existing staging pipeline remains the path for *new* ingestion).

**Tech Stack:** Supabase Postgres (SQL migration + pg_cron + pg_net via existing `invoke_edge_function`), Deno edge function, Deno test for pure helpers.

**Scope note:** Phase 1 is backend-only and purely additive — it creates new files and one new edge function, and does not modify the existing staging pipeline functions. Loops B/C/D and the admin review surface are later phases.

**Reused, do not modify:**
- `public.invoke_edge_function(TEXT, JSONB)` — cron → edge function (defined in `20260414290000_pipeline_cron_schedules.sql`)
- `personality_sources` table — provenance (cols: `personality_id, source_slug, source_entity_id, source_url, raw, payload_hash, confidence, is_primary, first_seen_at, last_seen_at`; UNIQUE on `(source_slug, source_entity_id) WHERE source_entity_id IS NOT NULL`)
- Wikidata fetch logic pattern from `supabase/functions/pipeline-enrich-personality/index.ts` (`wdSearch`, `wdEntity`, `claimValue`, `formatDate`, `imageOk`, `WD_EXT`, `UA`)
- `_shared/supabase-client.ts` (`getServiceClient`, `jsonResponse`, `errorResponse`, `corsResponse`), `_shared/report-api-error.ts` (`withErrorReporting`)

---

## File Structure

- **Create** `supabase/functions/_shared/personality-enrich-core.ts` — pure, testable helpers: Wikidata fetchers (moved/shared), Wikipedia REST summary parse, `fillBlanks`, `refreshTtlDays`, `isStale`.
- **Create** `supabase/functions/_shared/personality-quality.ts` — the quality-score rubric as one reusable pure function (single source of truth going forward).
- **Create** `supabase/functions/_tests/personality-enrich-core.test.ts` — Deno tests for the pure helpers.
- **Create** `supabase/functions/_tests/personality-quality.test.ts` — Deno tests for the rubric.
- **Create** `supabase/functions/personality-refresh/index.ts` — the refresh edge function.
- **Create** `supabase/migrations/<ts>_personality_data_health.sql` — `personality_data_health` view + supporting index.
- **Create** `supabase/migrations/<ts>_personality_refresh_cron.sql` — pg_cron schedule invoking `personality-refresh`.

> Use a real UTC timestamp for `<ts>` at authoring time, after the latest existing migration prefix. Check with: `ls supabase/migrations | tail -3`. Two migrations must sort: data_health BEFORE refresh_cron.

---

## Task 1: Quality rubric helper (pure, single source of truth)

**Files:**
- Create: `supabase/functions/_shared/personality-quality.ts`
- Test: `supabase/functions/_tests/personality-quality.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// supabase/functions/_tests/personality-quality.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { personalityQualityScore } from '../_shared/personality-quality.ts'

Deno.test('empty record scores 0', () => {
  assertEquals(personalityQualityScore({}), 0)
})

Deno.test('name only scores 5', () => {
  assertEquals(personalityQualityScore({ name: 'Marsha P. Johnson' }), 5)
})

Deno.test('full record caps at 100', () => {
  const r = {
    name: 'Marsha P. Johnson',
    image_url: 'https://x/i.jpg',
    description: 'A'.repeat(120),
    lgbti_connection: 'activist',
    birth_date: '1945-08-24',
    profession: 'activist',
    nationality: 'American',
    wikidata_qid: 'Q464699',
    fields: ['LGBT rights'],
  }
  assertEquals(personalityQualityScore(r), 100)
})

Deno.test('partial: image+desc>80+qid = 15+20+15 = 50', () => {
  assertEquals(personalityQualityScore({
    name: 'X', image_url: 'u', description: 'A'.repeat(90), wikidata_qid: 'Q1',
  }), 5 + 15 + 20 + 15)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/_tests/personality-quality.test.ts`
Expected: FAIL — module `../_shared/personality-quality.ts` not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// supabase/functions/_shared/personality-quality.ts
// Single source of truth for the personality quality rubric (max 100).
// Mirrors the rubric historically inlined in pipeline-quality-score.

export interface QualityInput {
  name?: unknown
  image_url?: unknown
  description?: unknown
  lgbti_connection?: unknown
  birth_date?: unknown
  profession?: unknown
  nationality?: unknown
  wikidata_qid?: unknown
  fields?: unknown
}

function nonEmptyStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

export function personalityQualityScore(r: QualityInput): number {
  let s = 0
  if (nonEmptyStr(r.name)) s += 5
  if (nonEmptyStr(r.image_url)) s += 15
  const desc = nonEmptyStr(r.description)
  if (desc) s += 10
  if (desc && desc.length > 80) s += 10
  const lc = nonEmptyStr(r.lgbti_connection)
  if (lc && lc !== 'unclear' && lc !== 'none_known') s += 20
  if (nonEmptyStr(r.birth_date)) s += 10
  if (nonEmptyStr(r.profession)) s += 10
  if (nonEmptyStr(r.nationality)) s += 10
  if (nonEmptyStr(r.wikidata_qid)) s += 15
  if (Array.isArray(r.fields) && r.fields.length > 0) s += 5
  return Math.min(100, s)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/_tests/personality-quality.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/personality-quality.ts supabase/functions/_tests/personality-quality.test.ts
git commit -m "feat(personalities): extract quality rubric to reusable pure helper"
```

---

## Task 2: Enrich-core pure helpers (fill-blanks, TTL, Wikipedia parse)

**Files:**
- Create: `supabase/functions/_shared/personality-enrich-core.ts`
- Test: `supabase/functions/_tests/personality-enrich-core.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// supabase/functions/_tests/personality-enrich-core.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { fillBlanks, refreshTtlDays, isStale, parseWikipediaSummary } from '../_shared/personality-enrich-core.ts'

Deno.test('fillBlanks only fills null/empty, never clobbers curated', () => {
  const existing = { description: 'Curated bio', birth_date: null, nationality: '' }
  const incoming = { description: 'Wiki desc', birth_date: '1945-08-24', nationality: 'American', profession: 'activist' }
  assertEquals(fillBlanks(existing, incoming), {
    birth_date: '1945-08-24',
    nationality: 'American',
    profession: 'activist',
  })
})

Deno.test('fillBlanks ignores null/undefined incoming values', () => {
  const existing = { image_url: null }
  const incoming = { image_url: null, profession: undefined }
  assertEquals(fillBlanks(existing, incoming), {})
})

Deno.test('refreshTtlDays: living=90, recently deceased=7, default=365', () => {
  assertEquals(refreshTtlDays({ is_living: true }), 90)
  assertEquals(refreshTtlDays({ is_living: false, death_date: '2026-05-01' }, '2026-05-30'), 7)
  assertEquals(refreshTtlDays({ is_living: false, death_date: '1992-07-06' }, '2026-05-30'), 365)
})

Deno.test('isStale compares last_refreshed_at against ttl', () => {
  assertEquals(isStale({ is_living: true, last_refreshed_at: '2026-01-01' }, '2026-05-30'), true)
  assertEquals(isStale({ is_living: true, last_refreshed_at: '2026-05-25' }, '2026-05-30'), false)
  assertEquals(isStale({ is_living: true, last_refreshed_at: null }, '2026-05-30'), true)
})

Deno.test('parseWikipediaSummary extracts text + thumbnail', () => {
  const json = { extract: 'Marsha was an activist.', thumbnail: { source: 'https://x/t.jpg' }, content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Marsha' } } }
  assertEquals(parseWikipediaSummary(json), {
    extract: 'Marsha was an activist.',
    image_url: 'https://x/t.jpg',
    source_url: 'https://en.wikipedia.org/wiki/Marsha',
  })
})

Deno.test('parseWikipediaSummary tolerates missing fields', () => {
  assertEquals(parseWikipediaSummary({}), { extract: null, image_url: null, source_url: null })
  assertEquals(parseWikipediaSummary({ type: 'disambiguation', extract: 'x' }), { extract: null, image_url: null, source_url: null })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/_tests/personality-enrich-core.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// supabase/functions/_shared/personality-enrich-core.ts
// Pure helpers for the personality refresh loop. No I/O here — fetch lives in index.ts.

type Rec = Record<string, unknown>

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}

/** Returns only the keys whose existing value is blank AND incoming value is non-blank. Never clobbers. */
export function fillBlanks(existing: Rec, incoming: Rec): Rec {
  const out: Rec = {}
  for (const [k, v] of Object.entries(incoming)) {
    if (isBlank(v)) continue
    if (isBlank(existing[k])) out[k] = v
  }
  return out
}

function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso), b = Date.parse(bIso)
  return Math.floor((b - a) / 86_400_000)
}

/** Refresh cadence: living people often, recently-deceased very often (catch obituary updates), rest yearly. */
export function refreshTtlDays(r: Rec, nowIso = new Date().toISOString()): number {
  if (r.is_living === true) return 90
  const dd = typeof r.death_date === 'string' ? r.death_date : null
  if (dd && daysBetween(dd, nowIso) <= 90) return 7
  return 365
}

export function isStale(r: Rec, nowIso = new Date().toISOString()): boolean {
  const last = typeof r.last_refreshed_at === 'string' ? r.last_refreshed_at : null
  if (!last) return true
  return daysBetween(last, nowIso) >= refreshTtlDays(r, nowIso)
}

export interface WikiSummary { extract: string | null; image_url: string | null; source_url: string | null }

/** Parses a Wikipedia REST /page/summary response. Rejects disambiguation pages. */
export function parseWikipediaSummary(json: Rec): WikiSummary {
  const blank: WikiSummary = { extract: null, image_url: null, source_url: null }
  if (json?.type === 'disambiguation') return blank
  const extract = typeof json?.extract === 'string' && json.extract.trim() ? json.extract.trim() : null
  const thumb = (json?.thumbnail as Rec | undefined)?.source
  const image_url = typeof thumb === 'string' ? thumb : null
  const page = ((json?.content_urls as Rec | undefined)?.desktop as Rec | undefined)?.page
  const source_url = typeof page === 'string' ? page : null
  return { extract, image_url, source_url }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/_tests/personality-enrich-core.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/personality-enrich-core.ts supabase/functions/_tests/personality-enrich-core.test.ts
git commit -m "feat(personalities): pure helpers for refresh loop (fillBlanks, TTL, wiki parse)"
```

---

## Task 3: `personality_data_health` view (the scheduler brain)

**Files:**
- Create: `supabase/migrations/<ts>_personality_data_health.sql`
- Test: `supabase/tests/personality_data_health.sql`

- [ ] **Step 1: Write the failing test**

```sql
-- supabase/tests/personality_data_health.sql
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/personality_data_health.sql
BEGIN;

-- view exists and returns one row per personality
DO $$
DECLARE v_personalities int; v_health int;
BEGIN
  SELECT count(*) INTO v_personalities FROM public.personalities;
  SELECT count(*) INTO v_health FROM public.personality_data_health;
  ASSERT v_personalities = v_health, format('row count mismatch: personalities=%s health=%s', v_personalities, v_health);
END $$;

-- debt_score is higher for an emptier record
DO $$
DECLARE v_empty numeric; v_full numeric;
BEGIN
  SELECT max(debt_score) INTO v_empty
    FROM public.personality_data_health
    WHERE wikidata_qid_missing AND image_missing AND description_missing;
  SELECT min(debt_score) INTO v_full
    FROM public.personality_data_health
    WHERE NOT wikidata_qid_missing AND NOT image_missing AND NOT description_missing;
  ASSERT v_empty IS NULL OR v_full IS NULL OR v_empty >= v_full, 'emptier records must not score lower debt';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/personality_data_health.sql`
Expected: FAIL — `relation "public.personality_data_health" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/<ts>_personality_data_health.sql
-- Scheduler brain for the personality refresh loop. Per-record data-debt
-- vector + staleness + priority. Worst + highest-traffic records float to top.
-- Refresh cadence mirrors _shared/personality-enrich-core.ts: living=90d,
-- recently-deceased (<=90d)=7d, else 365d.

CREATE OR REPLACE VIEW public.personality_data_health AS
SELECT
  p.id,
  p.name,
  p.is_living,
  p.death_date,
  p.last_refreshed_at,
  p.view_count,
  p.quality_score,
  -- per-field debt flags
  (p.wikidata_qid IS NULL)                                   AS wikidata_qid_missing,
  (p.image_url IS NULL)                                      AS image_missing,
  (p.description IS NULL OR length(p.description) <= 80)     AS description_missing,
  (p.birth_date IS NULL)                                     AS birth_date_missing,
  (p.profession IS NULL)                                     AS profession_missing,
  (p.nationality IS NULL)                                    AS nationality_missing,
  -- refresh cadence (days)
  CASE
    WHEN p.is_living THEN 90
    WHEN p.death_date IS NOT NULL AND p.death_date >= (now()::date - 90) THEN 7
    ELSE 365
  END                                                        AS ttl_days,
  -- stale = never refreshed OR older than ttl
  (p.last_refreshed_at IS NULL
    OR p.last_refreshed_at < now() - (
      CASE
        WHEN p.is_living THEN interval '90 days'
        WHEN p.death_date IS NOT NULL AND p.death_date >= (now()::date - 90) THEN interval '7 days'
        ELSE interval '365 days'
      END
    ))                                                       AS is_stale,
  -- debt_score: weighted sum of missing fields (max 80, matches rubric weights minus name/fields)
  ( (CASE WHEN p.wikidata_qid IS NULL THEN 15 ELSE 0 END)
  + (CASE WHEN p.image_url IS NULL THEN 15 ELSE 0 END)
  + (CASE WHEN p.description IS NULL OR length(p.description) <= 80 THEN 20 ELSE 0 END)
  + (CASE WHEN p.birth_date IS NULL THEN 10 ELSE 0 END)
  + (CASE WHEN p.profession IS NULL THEN 10 ELSE 0 END)
  + (CASE WHEN p.nationality IS NULL THEN 10 ELSE 0 END)
  )::numeric                                                 AS debt_score,
  -- priority: debt × log(traffic+2). Higher = enrich sooner.
  ( ( (CASE WHEN p.wikidata_qid IS NULL THEN 15 ELSE 0 END)
    + (CASE WHEN p.image_url IS NULL THEN 15 ELSE 0 END)
    + (CASE WHEN p.description IS NULL OR length(p.description) <= 80 THEN 20 ELSE 0 END)
    + (CASE WHEN p.birth_date IS NULL THEN 10 ELSE 0 END)
    + (CASE WHEN p.profession IS NULL THEN 10 ELSE 0 END)
    + (CASE WHEN p.nationality IS NULL THEN 10 ELSE 0 END)
    )::numeric * ln(COALESCE(p.view_count, 0) + 2)
  )                                                          AS priority
FROM public.personalities p
WHERE COALESCE(p.visibility, 'public') <> 'private'
  AND p.duplicate_of_id IS NULL;

COMMENT ON VIEW public.personality_data_health IS
  'Per-personality data-debt + staleness + priority for the refresh loop. priority = debt_score × ln(view_count+2). Consumed by personality-refresh edge function.';

GRANT SELECT ON public.personality_data_health TO service_role;

-- Supports the refresh function''s "stale and high-priority first" scan.
CREATE INDEX IF NOT EXISTS idx_personalities_refresh_scan
  ON public.personalities (last_refreshed_at NULLS FIRST)
  WHERE duplicate_of_id IS NULL;
```

- [ ] **Step 4: Apply migration and run test to verify it passes**

Run: `supabase db push` (or apply via Supabase MCP `apply_migration`), then
`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/personality_data_health.sql`
Expected: PASS (no assertion errors; `ROLLBACK` at end leaves DB unchanged).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_personality_data_health.sql supabase/tests/personality_data_health.sql
git commit -m "feat(personalities): data-debt health view for refresh scheduler"
```

---

## Task 4: `personality-refresh` edge function (Loop A)

**Files:**
- Create: `supabase/functions/personality-refresh/index.ts`
- Reference: `supabase/functions/pipeline-enrich-personality/index.ts` (copy `UA`, `WD_EXT`, `wdSearch`, `wdEntity`, `claimValue`, `formatDate`, `imageOk`)

- [ ] **Step 1: Write the edge function**

```typescript
// supabase/functions/personality-refresh/index.ts
// Loop A — continuous refresh of EXISTING personalities.
// Pulls the highest-priority stale/incomplete records from
// personality_data_health, fetches Wikidata + Wikipedia, fills ONLY blank
// columns (never clobbers curated data), writes a personality_sources
// provenance row, stamps last_refreshed_at, recomputes quality_score.

import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { fillBlanks, parseWikipediaSummary } from '../_shared/personality-enrich-core.ts'
import { personalityQualityScore } from '../_shared/personality-quality.ts'

const UA = 'QueerGuide/1.0 (https://queer.guide; contact@queer.guide)'
const WD_EXT: Record<string, string> = {
  P345: 'imdb_id', P214: 'viaf', P213: 'isni', P434: 'musicbrainz_id',
  P646: 'freebase_id', P2002: 'twitter', P2003: 'instagram', P2013: 'facebook',
}

async function wdSearch(name: string): Promise<{ id: string; description?: string } | null> {
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&limit=1`
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    const data = await res.json()
    return data.search?.[0] ?? null
  } catch { return null }
}
async function wdEntity(qid: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, { headers: { 'User-Agent': UA } })
    const data = await res.json()
    return data.entities?.[qid] ?? null
  } catch { return null }
}
function claimValue(entity: Record<string, unknown>, prop: string): string | null {
  const claims = (entity.claims as Record<string, unknown>)?.[prop] as Array<Record<string, unknown>> | undefined
  if (!claims?.length) return null
  const main = (claims[0].mainsnak as Record<string, unknown>)?.datavalue as Record<string, unknown> | undefined
  if (!main) return null
  const v = main.value
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v !== null) {
    const vv = v as Record<string, unknown>
    return (vv.id as string) ?? (vv.time as string) ?? (vv.text as string) ?? null
  }
  return null
}
function formatDate(v: string | null): string | null {
  if (!v) return null
  const m = v.match(/^\+?(-?\d{4})-(\d{2})-(\d{2})/)
  if (!m || m[1].startsWith('-')) return null
  const mm = m[2] === '00' ? '01' : m[2]
  const dd = m[3] === '00' ? '01' : m[3]
  return `${m[1].padStart(4, '0')}-${mm}-${dd}`
}
async function imageOk(url: string | null): Promise<boolean> {
  if (!url || !/^https?:\/\//i.test(url)) return false
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' })
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')
  } catch { return false }
}
async function wikiSitelinkTitle(entity: Record<string, unknown>): Promise<string | null> {
  const sl = (entity.sitelinks as Record<string, { title?: string }> | undefined)?.enwiki
  return sl?.title ?? null
}
async function fetchWikipedia(title: string) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { headers: { 'User-Agent': UA } })
    if (!res.ok) return parseWikipediaSummary({})
    return parseWikipediaSummary(await res.json())
  } catch { return parseWikipediaSummary({}) }
}

type Row = Record<string, unknown>

Deno.serve(withErrorReporting('personality-refresh', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const batchSize = Math.min((body.batch_size as number) || 25, 100)
    const dryRun = body.dry_run === true

    // Highest-priority stale/incomplete records first.
    const { data: targets, error: tErr } = await supabase
      .from('personality_data_health')
      .select('id, name')
      .eq('is_stale', true)
      .gt('debt_score', 0)
      .order('priority', { ascending: false })
      .limit(batchSize)
    if (tErr) return errorResponse(`scan: ${tErr.message}`, 500, req)
    if (!targets?.length) return jsonResponse({ success: true, items: 0, message: 'nothing stale' }, 200, req)

    let updated = 0
    const results: Row[] = []
    for (const t of targets) {
      const id = t.id as string
      const { data: p } = await supabase.from('personalities').select('*').eq('id', id).single()
      if (!p) continue

      const incoming: Row = {}
      let qid = p.wikidata_qid as string | null
      let entity: Record<string, unknown> | null = null
      let wdUrl: string | null = null

      if (!qid && p.name) {
        const hit = await wdSearch(String(p.name))
        if (hit?.id) { qid = hit.id; if (hit.description) incoming.description = hit.description }
      }
      if (qid) {
        incoming.wikidata_qid = qid
        wdUrl = `https://www.wikidata.org/wiki/${qid}`
        entity = await wdEntity(qid)
        if (entity) {
          const birth = formatDate(claimValue(entity, 'P569'))
          const death = formatDate(claimValue(entity, 'P570'))
          const image = claimValue(entity, 'P18')
          if (birth) incoming.birth_date = birth
          if (death) incoming.death_date = death
          if (image) incoming.image_url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}`
          const ext: Record<string, string> = { ...((p.external_ids as Record<string, string>) ?? {}) }
          let extChanged = false
          for (const [prop, key] of Object.entries(WD_EXT)) {
            const v = claimValue(entity, prop)
            if (v && !ext[key]) { ext[key] = v; extChanged = true }
          }
          if (extChanged) incoming.external_ids = ext
        }
      }

      // Wikipedia summary → richer description/bio + image fallback.
      let wikiUrl: string | null = null
      const title = entity ? await wikiSitelinkTitle(entity) : null
      if (title || p.name) {
        const wiki = await fetchWikipedia(title ?? String(p.name))
        wikiUrl = wiki.source_url
        if (wiki.extract) {
          incoming.description = incoming.description ?? wiki.extract.slice(0, 280)
          incoming.bio = wiki.extract
        }
        if (wiki.image_url && !incoming.image_url) incoming.image_url = wiki.image_url
      }

      // Validate any candidate image before it lands.
      const candidateImg = (incoming.image_url as string) ?? null
      if (candidateImg && !(await imageOk(candidateImg))) delete incoming.image_url

      // Fill ONLY blank columns on the live record.
      const patch = fillBlanks(p as Row, incoming)
      // external_ids is a merge, not blank-fill — keep it if we added keys.
      if (incoming.external_ids) patch.external_ids = incoming.external_ids

      const merged = { ...p, ...patch }
      const newScore = personalityQualityScore(merged as Row)

      results.push({ id, name: p.name, changed_keys: Object.keys(patch), new_quality: newScore })
      if (dryRun) continue

      const { error: uErr } = await supabase.from('personalities').update({
        ...patch,
        quality_score: newScore,
        last_refreshed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (uErr) { results[results.length - 1].error = uErr.message; continue }

      // Provenance: one row per source touched.
      if (qid) {
        await supabase.from('personality_sources').upsert({
          personality_id: id, source_slug: 'wikidata', source_entity_id: qid,
          source_url: wdUrl, confidence: 1.0, is_primary: true, last_seen_at: new Date().toISOString(),
          raw: { refreshed_keys: Object.keys(patch) },
        }, { onConflict: 'source_slug,source_entity_id' })
      }
      if (wikiUrl) {
        await supabase.from('personality_sources').upsert({
          personality_id: id, source_slug: 'wikipedia', source_entity_id: wikiUrl,
          source_url: wikiUrl, confidence: 0.9, is_primary: false, last_seen_at: new Date().toISOString(),
          raw: { refreshed_keys: Object.keys(patch) },
        }, { onConflict: 'source_slug,source_entity_id' })
      }
      updated++
    }

    return jsonResponse({ success: true, items: updated, dry_run: dryRun, results }, 200, req)
  } catch (error) {
    console.error('personality-refresh:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
```

- [ ] **Step 2: Type-check the function**

Run: `deno check supabase/functions/personality-refresh/index.ts`
Expected: no type errors. (Fix import paths/signatures if `deno check` complains.)

- [ ] **Step 3: Deploy**

Run: `supabase functions deploy personality-refresh`
Expected: deploy succeeds.

- [ ] **Step 4: Smoke test with dry run (no mutation)**

Run:
```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/personality-refresh" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"batch_size":3,"dry_run":true}' | jq
```
Expected: JSON with `success:true`, `dry_run:true`, and a `results` array of up to 3 entries each showing `changed_keys` and `new_quality`. Verify no rows changed:
`psql "$DATABASE_URL" -c "SELECT count(*) FROM personalities WHERE last_refreshed_at > now() - interval '2 minutes';"` → expect 0.

- [ ] **Step 5: Live test on a tiny batch, then verify provenance + no clobber**

Run:
```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/personality-refresh" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"batch_size":3,"dry_run":false}' | jq
```
Then verify:
```bash
psql "$DATABASE_URL" -c "SELECT personality_id, source_slug, confidence FROM personality_sources ORDER BY last_seen_at DESC LIMIT 6;"
psql "$DATABASE_URL" -c "SELECT id, quality_score, last_refreshed_at FROM personalities WHERE last_refreshed_at > now() - interval '2 minutes';"
```
Expected: provenance rows exist; refreshed personalities have a fresh `last_refreshed_at` and recomputed `quality_score`. Spot-check one record on https://queer.guide to confirm curated fields were not overwritten.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/personality-refresh/index.ts
git commit -m "feat(personalities): personality-refresh edge function (Loop A multi-source enrich)"
```

---

## Task 5: Schedule the refresh loop (continuity)

**Files:**
- Create: `supabase/migrations/<ts>_personality_refresh_cron.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/<ts>_personality_refresh_cron.sql
-- Continuous refresh: invoke personality-refresh every 30 min.
-- Uses pg_net net.http_post — same pattern as 20260414290000_pipeline_cron_schedules.sql.
-- Batch of 25/run × 48 runs/day ≈ 1,200 records/day → full 12.6k corpus
-- cycled ~every 10 days, then re-prioritised by staleness.
--
-- NOTE: v_auth uses the project anon bearer (same token the existing pipeline
-- crons use). personality-refresh runs getServiceClient() internally, so the
-- bearer only needs to satisfy the gateway. If the function is deployed with
-- verify_jwt enabled and rejects anon, deploy it with --no-verify-jwt
-- (`supabase functions deploy personality-refresh --no-verify-jwt`) — match
-- whatever the other pipeline-* cron-invoked functions use.

DO $$
DECLARE
  v_url     TEXT := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1';
  v_auth    TEXT := 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';
  v_headers TEXT;
BEGIN
  v_headers := jsonb_build_object('Content-Type','application/json','Authorization',v_auth)::text;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'personality-refresh';
  PERFORM cron.schedule('personality-refresh', '*/30 * * * *', format($f$
    SELECT net.http_post(url:=%L, headers:=%L::jsonb, body:='{"batch_size":25}'::jsonb);
  $f$, v_url || '/personality-refresh', v_headers));
END $$;
```

> Before writing this migration, confirm the exact anon bearer is still current:
> `grep -m1 "Bearer eyJ" supabase/migrations/20260414290000_pipeline_cron_schedules.sql` and reuse that literal.

- [ ] **Step 2: Apply migration**

Run: `supabase db push` (or Supabase MCP `apply_migration`).
Expected: success.

- [ ] **Step 3: Verify the cron is registered**

Run: `psql "$DATABASE_URL" -c "SELECT jobname, schedule, active FROM cron.job WHERE jobname='personality-refresh';"`
Expected: one row, `schedule = */30 * * * *`, `active = t`.

- [ ] **Step 4: Verify an invocation fires (wait for next tick or trigger manually)**

Trigger the same HTTP call the cron makes (reuse the smoke-test curl from Task 4 Step 4, or run the `net.http_post(...)` body from the migration via psql). Then check refreshed rows climbed:
`psql "$DATABASE_URL" -c "SELECT count(*) FROM personalities WHERE last_refreshed_at > now() - interval '5 minutes';"` → expect > 0.
Also confirm pg_net delivery: `psql "$DATABASE_URL" -c "SELECT status_code FROM net._http_response ORDER BY created DESC LIMIT 3;"` → expect 200.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_personality_refresh_cron.sql
git commit -m "feat(personalities): schedule personality-refresh loop every 30min"
```

---

## Final verification (Phase 1 done)

- [ ] All Deno tests pass: `deno test supabase/functions/_tests/personality-quality.test.ts supabase/functions/_tests/personality-enrich-core.test.ts`
- [ ] SQL view test passes: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/personality_data_health.sql`
- [ ] Cron is active and a manual invoke refreshes records with provenance + recomputed quality.
- [ ] On https://queer.guide, a previously-thin personality page now shows enriched data after a refresh cycle, and no curated field was overwritten.
- [ ] Re-check corpus stats vs the design baseline (description>80, birth_date, wikidata_qid, image, last_refreshed_at coverage should all climb over the first cycle).

---

## Self-Review

**Spec coverage (Phase 1 = Backbone + Loop A):**
- Data-debt scheduler/brain → Task 3 (`personality_data_health` view with `debt_score`/`priority`/`is_stale`). ✓
- Multi-source factual enrichment (Wikidata + Wikipedia + Commons image) → Task 4. ✓
- Corroboration/provenance → Task 4 writes `personality_sources` rows per source. ✓
- Refresh TTL loop (living/recently-deceased/default cadence) → Tasks 2 + 3 (TTL logic mirrored in helper and view) + Task 5 (cron). ✓
- Never-clobber-curated → Task 2 `fillBlanks` + Task 4 verification step 5. ✓
- Quality re-score → Task 1 rubric + Task 4 recompute. ✓
- Cost: Loop A is HTTP+SQL only, no LLM. ✓ (LLM is Loop B / Phase 3, out of scope.)

**Deferred (not Phase 1, by design):** geo-linking, auto-tagging, entity cross-links (Loop C / Phase 2); LGBTQ+ significance narrative (Loop B / Phase 3); net-new discovery (Loop D / Phase 4); admin review surface for low-confidence changes (Phase 3). Phase 1 fills *blanks* only — it never overwrites existing values, so a human review gate is not yet required.

**Placeholder scan:** none — every code/SQL step is complete.

**Type consistency:** `personalityQualityScore` (Task 1) consumed in Task 4; `fillBlanks`/`parseWikipediaSummary` (Task 2) consumed in Task 4; view column names (`is_stale`, `debt_score`, `priority`) defined in Task 3 and queried in Task 4. Consistent.
