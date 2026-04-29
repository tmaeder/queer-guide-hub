/**
 * translate-i18n-batch — Wave E of the Search Intelligence rollup.
 *
 * Batch-translates `name` / `title` / `description` columns into the
 * `*_i18n` JSONB columns introduced by #155 (unified_tags) and #172
 * (per-entity polish). Uses Anthropic Claude via the project's existing
 * anthropic-shim helper so prompts can carry LGBTQ+ domain context that
 * generic translators lose.
 *
 * Body:
 *   {
 *     table:        'unified_tags' | 'venues' | 'events' | 'news_articles'
 *                   | 'marketplace_listings' | 'personalities'
 *                   | 'queer_villages' | 'cities' | 'countries' | 'hotels',
 *     locale:       'de' | 'fr' | 'es' | ...,    // BCP-47
 *     field:        'name' | 'title' | 'description',
 *     batch_limit:  default 25,
 *     dry_run:      boolean (no DB writes)
 *   }
 *
 * Auth: admin OR webhook-secret (so a future cron can drive it).
 *
 * Output: { translated, skipped, errors[], dry_run, sample? }
 */

import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
  requireAdmin,
} from '../_shared/supabase-client.ts'
import { anthropicMessages } from '../_shared/anthropic-shim.ts'

interface BatchInput {
  table: string
  locale: string
  field?: 'name' | 'title' | 'description'
  batch_limit?: number
  dry_run?: boolean
}

const TABLE_FIELDS: Record<
  string,
  { id_field: string; sources: Array<'name' | 'title' | 'description'>; i18n_map: Record<string, string> }
> = {
  unified_tags: {
    id_field: 'id',
    sources: ['name', 'description'],
    i18n_map: { name: 'name_i18n', description: 'description_i18n' },
  },
  venues: {
    id_field: 'id',
    sources: ['name', 'description'],
    i18n_map: { name: 'name_i18n', description: 'description_i18n' },
  },
  personalities: {
    id_field: 'id',
    sources: ['name', 'description'],
    i18n_map: { name: 'name_i18n', description: 'description_i18n' },
  },
  queer_villages: {
    id_field: 'id',
    sources: ['name', 'description'],
    i18n_map: { name: 'name_i18n', description: 'description_i18n' },
  },
  cities: {
    id_field: 'id',
    sources: ['name'],
    i18n_map: { name: 'name_i18n' },
  },
  countries: {
    id_field: 'id',
    sources: ['name'],
    i18n_map: { name: 'name_i18n' },
  },
  hotels: {
    id_field: 'id',
    sources: ['name', 'description'],
    i18n_map: { name: 'name_i18n', description: 'description_i18n' },
  },
  events: {
    id_field: 'id',
    sources: ['title', 'description'],
    i18n_map: { title: 'title_i18n', description: 'description_i18n' },
  },
  news_articles: {
    id_field: 'id',
    sources: ['title'],
    i18n_map: { title: 'title_i18n' },
  },
  marketplace_listings: {
    id_field: 'id',
    sources: ['title', 'description'],
    i18n_map: { title: 'title_i18n', description: 'description_i18n' },
  },
}

const ALLOWED_LOCALES = new Set([
  'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'tr', 'uk', 'sv',
])

const SYSTEM_PROMPT = `You translate UI strings for queer.guide, an LGBTQ+ travel and community platform. Source language is English. Translations must:

- Preserve queer-specific terminology (Bear, Twink, Drag, Two-Spirit, BDSM, kink-friendly, etc.) using the target locale's queer-community-accepted forms.
- Keep proper nouns (city names, festival names, venue names) untranslated unless a different name is the canonical local form.
- Match the source register: tag names are short, headlines are punchy, descriptions are neutral-informative.
- Output ONLY the JSON object specified. No commentary.

Output format:
{ "<source_string>": "<translated_string>", ... }

If a source string can't be translated meaningfully (e.g. it is already in the target locale, or is a proper noun that should not change), return the source unchanged.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  try {
    const supabase = getServiceClient()

    // Webhook secret (for future cron) bypass; otherwise admin auth.
    const provided = req.headers.get('x-webhook-secret') ?? ''
    const expected =
      Deno.env.get('TRANSLATE_I18N_WEBHOOK_SECRET') ??
      Deno.env.get('WEBHOOK_SECRET') ??
      ''
    if (!provided || provided !== expected) {
      const auth = await requireAdmin(req, supabase)
      if (auth instanceof Response) return auth
    }

    const body: BatchInput = await req.json().catch(() => ({} as BatchInput))
    if (!body.table || !TABLE_FIELDS[body.table]) {
      return errorResponse(
        `table required: ${Object.keys(TABLE_FIELDS).join(', ')}`,
        400,
        req,
      )
    }
    if (!body.locale || !ALLOWED_LOCALES.has(body.locale)) {
      return errorResponse(
        `locale must be one of: ${[...ALLOWED_LOCALES].join(', ')}`,
        400,
        req,
      )
    }
    const cfg = TABLE_FIELDS[body.table]
    const field: 'name' | 'title' | 'description' =
      (body.field as 'name' | 'title' | 'description') ?? cfg.sources[0]
    if (!cfg.sources.includes(field)) {
      return errorResponse(
        `field must be one of ${cfg.sources.join(', ')} for table ${body.table}`,
        400,
        req,
      )
    }
    const i18nCol = cfg.i18n_map[field]
    const batchLimit = Math.min(body.batch_limit ?? 25, 50)
    const dryRun = body.dry_run === true

    // Fetch rows missing this locale.
    const { data: rows, error: fetchErr } = await supabase
      .from(body.table)
      .select(`${cfg.id_field}, ${field}, ${i18nCol}`)
      .order('updated_at', { ascending: true, nullsFirst: false })
      .limit(batchLimit * 4) // overscan; we filter in JS for "missing locale"
    if (fetchErr) return errorResponse(fetchErr.message, 500, req)

    type Row = Record<string, unknown>
    const pending = (rows ?? [])
      .filter((r: Row) => {
        const source = r[field]
        if (!source || typeof source !== 'string' || source.trim() === '') return false
        const i18n = (r[i18nCol] as Record<string, unknown> | null) ?? {}
        return !i18n[body.locale]
      })
      .slice(0, batchLimit)

    if (pending.length === 0) {
      return jsonResponse(
        { success: true, table: body.table, locale: body.locale, field, translated: 0, skipped: 0, errors: [], dry_run: dryRun },
        200,
        req,
      )
    }

    // Build the JSON-array prompt.
    const sources = pending.map((r: Row) => String(r[field]))
    const userMsg = `Locale target: ${body.locale}\n\nTranslate each of the following ${cfg.sources.includes('title') ? 'titles' : 'names'} (one per line, deduplicated):\n\n${JSON.stringify(sources)}`

    let translated: Record<string, string> = {}
    let llmError: string | null = null
    if (!dryRun) {
      try {
        const resp = await anthropicMessages({
          model: 'claude-sonnet-4-6',
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMsg }],
          temperature: 0.2,
          timeoutMs: 30000,
        })
        const text = resp.content?.[0]?.text ?? ''
        const json = extractJson(text)
        if (json && typeof json === 'object') {
          translated = json as Record<string, string>
        } else {
          llmError = 'LLM returned non-JSON output'
        }
      } catch (e) {
        llmError = e instanceof Error ? e.message : 'LLM error'
      }
    }

    if (llmError) {
      return errorResponse(`translate failed: ${llmError}`, 502, req)
    }

    let written = 0
    const errors: Array<{ id: string; error: string }> = []
    for (const row of pending as Row[]) {
      const id = row[cfg.id_field] as string
      const source = String(row[field])
      const t = translated[source]
      if (!t) {
        errors.push({ id, error: 'no translation in LLM response' })
        continue
      }
      if (dryRun) {
        written++
        continue
      }
      const i18n = (row[i18nCol] as Record<string, unknown> | null) ?? {}
      const next = { ...i18n, [body.locale]: t }
      const { error: upErr } = await supabase
        .from(body.table)
        .update({ [i18nCol]: next, updated_at: new Date().toISOString() })
        .eq(cfg.id_field, id)
      if (upErr) {
        errors.push({ id, error: upErr.message })
      } else {
        written++
      }
    }

    return jsonResponse(
      {
        success: true,
        table: body.table,
        locale: body.locale,
        field,
        translated: written,
        skipped: pending.length - written,
        errors,
        dry_run: dryRun,
        sample: dryRun ? pending.slice(0, 3).map((r: Row) => ({
          id: r[cfg.id_field],
          source: r[field],
          translation: translated[String(r[field])] ?? null,
        })) : undefined,
      },
      200,
      req,
    )
  } catch (err) {
    console.error('translate-i18n-batch:', err)
    return errorResponse((err as Error).message, 500, req)
  }
})

/**
 * Extract a JSON object from LLM text. Tolerates surrounding prose / code
 * fences. Returns null if nothing parsable.
 */
function extractJson(text: string): unknown | null {
  if (!text) return null
  // Try direct parse first.
  try {
    return JSON.parse(text)
  } catch {
    // fall through
  }
  // Find first '{' and matching '}' via brace counting.
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        const slice = text.slice(start, i + 1)
        try {
          return JSON.parse(slice)
        } catch {
          return null
        }
      }
    }
  }
  return null
}
