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
import { applySuggestion, insertSuggestion } from '../_shared/ai-suggestions.ts'

interface BatchInput {
  table: string
  locale: string
  field?: 'name' | 'title' | 'description'
  batch_limit?: number
  dry_run?: boolean
  /** Only translate unified_tags whose quality_score >= this (avoids spending
   *  LLM budget on stub/low-value glossary entries). Ignored for other tables. */
  min_quality?: number
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

// Must match the frontend's non-English SUPPORTED_LOCALES (src/i18n/languages.ts)
// so we only translate into locales the UI can actually display, and cover all
// of them. English is the base column, never a translation target.
const ALLOWED_LOCALES = new Set([
  'es', 'fr', 'de', 'pt', 'it', 'ru', 'zh', 'ja', 'ko', 'ar',
])

const SYSTEM_PROMPT = `You translate UI strings for queer.guide, an LGBTQ+ travel and community platform. Source language is English. Translations must:

- Preserve queer-specific terminology (Bear, Twink, Drag, Two-Spirit, BDSM, kink-friendly, etc.) using the target locale's queer-community-accepted forms.
- Keep proper nouns (city names, festival names, venue names) untranslated unless a different name is the canonical local form.
- Match the source register: tag names are short, headlines are punchy, descriptions are neutral-informative.
- Output ONLY the JSON object specified. No commentary.

Output format: a JSON ARRAY of translated strings, in the SAME ORDER and with the SAME COUNT as the input array. Do NOT echo the source text as keys and do NOT return an object — return only the array of translations, e.g. ["Übersetzung eins","Übersetzung zwei"].

If a source string can't be translated meaningfully (e.g. it is already in the target locale, or is a proper noun that should not change), return the source unchanged in its position.`

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
    // Long-text (description) batches can need >30s on CF Workers AI under load;
    // give them more headroom before the LLM call self-aborts. Short name/title
    // batches stay tight so a stuck call fails fast and retries next run.
    const llmTimeoutMs = field === 'description' ? 50000 : 30000

    // Optional quality gate (unified_tags only): translate good content first.
    const qualityGated = body.table === 'unified_tags' && typeof body.min_quality === 'number'
    const selectCols = qualityGated
      ? `${cfg.id_field}, ${field}, ${i18nCol}, quality_score`
      : `${cfg.id_field}, ${field}, ${i18nCol}`

    // Fetch rows missing this locale. When quality-gated, prefer the best tags.
    let query = supabase.from(body.table).select(selectCols)
    query = qualityGated
      ? query.order('quality_score', { ascending: false, nullsFirst: false })
      : query.order('updated_at', { ascending: true, nullsFirst: false })
    const { data: rows, error: fetchErr } = await query.limit(batchLimit * 4) // overscan; filter in JS
    if (fetchErr) return errorResponse(fetchErr.message, 500, req)

    type Row = Record<string, unknown>
    const candidates = (rows ?? []).filter((r: Row) => {
      const source = r[field]
      if (!source || typeof source !== 'string' || source.trim() === '') return false
      if (qualityGated && Number(r['quality_score'] ?? 0) < (body.min_quality as number)) return false
      const i18n = (r[i18nCol] as Record<string, unknown> | null) ?? {}
      return !i18n[body.locale]
    })

    // Skip items that already have a non-terminal translation suggestion for
    // this (locale, field). Avoids burning LLM tokens on items the reviewer
    // hasn't touched yet (also enforced at DB level by the partial unique
    // index from migration 20260429270000).
    let pending: Row[] = candidates
    if (candidates.length > 0) {
      const ids = candidates.map((r: Row) => r[cfg.id_field] as string)
      const { data: existing } = await supabase
        .from('ai_suggestions')
        .select('entity_id')
        .eq('suggestion_type', 'translation')
        .eq('entity_type', body.table)
        .eq('locale', body.locale)
        .eq('proposed_value->>field', field)
        .in('entity_id', ids)
        .in('status', ['pending', 'approved'])
      const skipIds = new Set((existing ?? []).map(r => r.entity_id))
      pending = candidates.filter((r: Row) => !skipIds.has(r[cfg.id_field] as string)).slice(0, batchLimit)
    }

    if (pending.length === 0) {
      return jsonResponse(
        { success: true, table: body.table, locale: body.locale, field, translated: 0, skipped: 0, errors: [], dry_run: dryRun },
        200,
        req,
      )
    }

    // Build the prompt. The LLM returns a JSON ARRAY of translations matched
    // back to inputs BY INDEX — never by source-string key, which is fragile
    // for long multi-sentence descriptions the model can't echo verbatim.
    const sources = pending.map((r: Row) => String(r[field]))
    const userMsg = `Locale target: ${body.locale}\n\nTranslate each string in the following JSON array into ${body.locale}. Return a JSON array of exactly ${sources.length} translated strings, in the SAME ORDER as the input. Output ONLY the array.\n\n${JSON.stringify(sources)}`

    // translatedByIndex[i] is the translation for pending[i].
    let translatedByIndex: string[] = []
    let llmError: string | null = null
    if (!dryRun) {
      try {
        const resp = await anthropicMessages({
          model: 'claude-sonnet-4-6',
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMsg }],
          temperature: 0.2,
          timeoutMs: llmTimeoutMs,
        })
        const text = resp.content?.[0]?.text ?? ''
        const json = extractJson(text)
        if (Array.isArray(json)) {
          translatedByIndex = json.map((x) => (typeof x === 'string' ? x : ''))
        } else if (json && typeof json === 'object') {
          // Back-compat: model returned an object keyed by source string.
          const obj = json as Record<string, unknown>
          translatedByIndex = sources.map((s) => (typeof obj[s] === 'string' ? (obj[s] as string) : ''))
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
    const sourceRunId = crypto.randomUUID()
    for (let i = 0; i < (pending as Row[]).length; i++) {
      const row = (pending as Row[])[i]
      const id = row[cfg.id_field] as string
      const source = String(row[field])
      const t = (translatedByIndex[i] ?? '').trim()
      if (!t) {
        errors.push({ id, error: 'no translation in LLM response' })
        continue
      }
      if (dryRun) {
        written++
        continue
      }

      // Route through ai_suggestions (PR 7 cutover). High-confidence rows
      // auto-apply via the shared applySuggestion helper, which performs the
      // JSONB merge into <table>.<field>_i18n. The merge preserves locales
      // we didn't touch — only the target locale's slot is set.
      let inserted
      try {
        inserted = await insertSuggestion(supabase, {
          suggestion_type: 'translation',
          entity_type: body.table,
          entity_id: id,
          locale: body.locale,
          proposed_value: { field, value: t },
          current_value: { value: source },
          source: 'anthropic',
          source_model: 'claude-sonnet-4-6',
          source_run_id: sourceRunId,
          confidence: 0.9,
          status: 'approved',
          approved_at: new Date().toISOString(),
        })
      } catch (e) {
        // 23505 from the partial unique index = a concurrent run already
        // inserted a non-terminal row for this tuple. Skip silently.
        const msg = e instanceof Error ? e.message : 'unknown insert error'
        if (msg.includes('ai_suggestions_translation_idempotency_idx')) continue
        errors.push({ id, error: msg })
        continue
      }

      try {
        const ok = await applySuggestion(supabase, inserted)
        if (ok) {
          await supabase
            .from('ai_suggestions')
            .update({ status: 'applied', applied_at: new Date().toISOString() })
            .eq('id', inserted.id)
          written++
        } else {
          errors.push({ id, error: 'translation apply unsupported' })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown apply error'
        await supabase
          .from('ai_suggestions')
          .update({ review_notes: `auto-apply failed: ${msg}` })
          .eq('id', inserted.id)
        errors.push({ id, error: msg })
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
  // Find the first '[' or '{' and its matching closer via depth counting
  // (string-aware, so brackets inside string values don't throw it off).
  const objStart = text.indexOf('{')
  const arrStart = text.indexOf('[')
  const start =
    arrStart >= 0 && (objStart < 0 || arrStart < objStart) ? arrStart : objStart
  if (start < 0) return null
  const open = text[start]
  const close = open === '[' ? ']' : '}'
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}
