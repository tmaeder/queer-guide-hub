/**
 * AI Enhancer — AI-powered content improvement using OpenAI.
 *
 * Three modes (configured per rule via rule_config.mode):
 *   generate — create descriptions for items missing them entirely
 *   expand   — expand thin descriptions (< rule_config.max_length chars)
 *   cleanup  — replace broken/garbage descriptions (search:ta:*, single words, nonsense)
 *
 * DB-side filtering ensures only items needing work are fetched.
 * Content-type-specific prompts leverage all available metadata.
 * All changes go to review queue (auto_approve_threshold = 1.01).
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import {
  getContentName, delay, CONTENT_TYPE_CONFIG,
  type ModuleConfig, type SharedRefs, type ProposedChange,
} from '../../_shared/automation-utils.ts'

// ── AI call (Cloudflare Workers AI) ──────────────────────────────────────────

const CF_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID') ?? ''
const CF_CHAT_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/v1/chat/completions`
const CF_CHAT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

async function callAI(
  apiToken: string,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const res = await fetch(CF_CHAT_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CF_CHAT_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  })

  if (!res.ok) {
    if (res.status === 429) throw new Error('RATE_LIMIT')
    const body = await res.text().catch(() => '')
    throw new Error(`CF AI ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? data.result?.response ?? ''
}

// ── System prompt ────────────────────────────────────────────────────────────

const SYSTEM = `You are a content editor for queer.guide, an LGBTQ+ travel and community platform.
Write informative, inclusive, and engaging descriptions.
Respectful, positive tone. Inclusive language.
Never speculate or add unverified claims — only use facts from the provided context.
Return ONLY the text. No markdown, no surrounding quotes, no labels like "Description:".`

// ── Broken description detection ─────────────────────────────────────────────

const GARBAGE_PATTERNS = [
  /^search:ta:/,                  // Foursquare/TripAdvisor import artifacts
  /^search:/,                     // Any search: prefix
  /^[0-9a-f-]{20,}$/i,           // UUIDs or hex IDs
  /^\d{4,}$/,                     // Numeric-only strings
  /^\{.*\}$/,                     // JSON objects
  /^\[.*\]$/,                     // JSON arrays
  /^https?:\/\//,                 // Raw URLs
  /^<[a-z]/i,                     // HTML tags
]

function isBrokenDescription(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  // Matches known garbage patterns
  if (GARBAGE_PATTERNS.some(p => p.test(trimmed))) return true

  // Too short to be a real description (< 20 chars) and no sentence structure
  if (trimmed.length < 20 && !trimmed.includes('. ')) return true

  return false
}

// ── Content-type-specific prompts ────────────────────────────────────────────

function buildPrompt(
  item: Record<string, unknown>,
  contentType: string,
  fieldName: string,
  mode: string,
  refs: SharedRefs,
): string | null {
  const current = ((item[fieldName] as string) ?? '').trim() || null

  if (mode === 'generate' && current) return null
  if (mode === 'expand' && !current) return null
  if (mode === 'cleanup') {
    if (!current || !isBrokenDescription(current)) return null
    // cleanup treats the item as if it has no description — generate fresh
  }

  const name = String(item.name || item.title || 'Unknown')
  const ctx = (...parts: (string | null | false | undefined | 0)[]) =>
    parts.filter(Boolean).join('\n')

  // For cleanup mode, use the same prompt as generate (the old value is garbage)
  const effectiveMode = mode === 'cleanup' ? 'generate' : mode

  if (contentType === 'venues') {
    const info = ctx(
      `Venue: ${name}`,
      item.category && `Category: ${item.category}`,
      item.city && `City: ${item.city}`,
      item.country && `Country: ${item.country}`,
      item.address && `Address: ${item.address}`,
    )
    return effectiveMode === 'generate'
      ? `Write a 2-3 sentence description for this LGBTQ+ venue.\n\n${info}\n\nFocus on what makes this venue relevant to LGBTQ+ visitors. Be factual.`
      : `Expand this brief venue description into 2-3 informative sentences.\n\n${info}\nCurrent description: "${current}"\n\nKeep existing facts, add useful context.`
  }

  if (contentType === 'events') {
    const info = ctx(
      `Event: ${name}`,
      item.event_type && `Type: ${item.event_type}`,
      item.venue_name && `Venue: ${item.venue_name}`,
      item.city && `City: ${item.city}`,
      item.country && `Country: ${item.country}`,
      item.start_date && `Date: ${item.start_date}`,
    )
    return effectiveMode === 'generate'
      ? `Write a 2-3 sentence description for this LGBTQ+ event.\n\n${info}\n\nFocus on what attendees can expect. Be factual and welcoming.`
      : `Expand this brief event description into 2-3 sentences.\n\n${info}\nCurrent description: "${current}"\n\nKeep existing facts, add useful context.`
  }

  if (contentType === 'personalities') {
    if (!item.profession && !item.lgbti_connection) return null

    const info = ctx(
      `Name: ${name}`,
      item.profession && `Profession: ${item.profession}`,
      item.lgbti_connection && `LGBTQ+ significance: ${item.lgbti_connection}`,
      item.nationality && `Nationality: ${item.nationality}`,
      item.birth_place && `Birth place: ${item.birth_place}`,
    )
    return effectiveMode === 'generate'
      ? `Write a 2-3 sentence biography for this LGBTQ+ personality.\n\n${info}\n\nFocus on their significance to the LGBTQ+ community. Be factual — do not invent details.`
      : `Expand this brief biography into 2-3 sentences.\n\n${info}\nCurrent bio: "${current}"\n\nKeep existing facts, add context.`
  }

  if (contentType === 'cities') {
    const countryRef = item.country_id ? refs.countryById.get(String(item.country_id)) : null
    const country = countryRef ? `, ${countryRef.name}` : ''
    return effectiveMode === 'generate'
      ? `Write a 2-3 sentence description of ${name}${country} from an LGBTQ+ travel perspective.\n\nFocus on what LGBTQ+ travelers should know about this destination. Be factual and welcoming.`
      : `Expand this brief city description into 2-3 sentences.\n\nCity: ${name}${country}\nCurrent description: "${current}"\n\nFocus on LGBTQ+ travel perspective.`
  }

  return null
}

// ── Fetch candidates with DB-side filtering ──────────────────────────────────

async function fetchCandidates(
  supabase: SupabaseClient,
  moduleId: string,
  contentType: string,
  fieldName: string,
  mode: string,
  maxLength: number,
  limit: number,
  startOffset: number,
): Promise<Record<string, unknown>[]> {
  const ctConfig = CONTENT_TYPE_CONFIG[contentType]
  if (!ctConfig) return []

  // Get ALL IDs already processed — paginate to avoid PostgREST 1000-row cap
  const processedIds = new Set<string>()
  let pidOffset = 0
  const PID_PAGE = 1000
  while (true) {
    const { data: page } = await supabase
      .from('content_changes')
      .select('content_id')
      .eq('module_id', moduleId)
      .eq('content_type', contentType)
      .eq('field_name', fieldName)
      .in('status', ['pending', 'auto_approved', 'applied'])
      .range(pidOffset, pidOffset + PID_PAGE - 1)
    if (!page || page.length === 0) break
    for (const r of page) processedIds.add(r.content_id)
    if (page.length < PID_PAGE) break
    pidOffset += PID_PAGE
  }

  // Build a fresh query for each page (Supabase client is stateful per chain)
  const buildQuery = () => {
    let q = supabase.from(ctConfig.table).select(ctConfig.selectFields)
    if (mode === 'generate') q = q.or(`${fieldName}.is.null,${fieldName}.eq.`)
    if (mode === 'cleanup') q = q.not(fieldName, 'is', null).neq(fieldName, '')
    if (contentType === 'venues') q = q.order('is_featured', { ascending: false, nullsFirst: false })
    q = q.order(ctConfig.nameField)
    return q
  }

  const PAGE_SIZE = 1000
  let offset = startOffset
  const collected: Record<string, unknown>[] = []

  // Auto-paginate: as processedIds grows, early pages are all filtered out.
  // Keep paging until we collect enough candidates or exhaust the table.
  while (collected.length < limit) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1)
    if (error) {
      console.error(`[ai-enhancer] Fetch ${contentType}.${fieldName} (${mode}) offset=${offset}: ${error.message}`)
      break
    }
    if (!data || data.length === 0) break

    let items = data as Record<string, unknown>[]

    // Exclude already-processed items
    if (processedIds.size > 0) {
      items = items.filter(i => !processedIds.has(String(i.id)))
    }

    if (mode === 'expand') {
      items = items.filter(i => {
        const val = ((i[fieldName] as string) ?? '').trim()
        return val.length > 0 && val.length < maxLength
      })
    }
    if (mode === 'cleanup') {
      items = items.filter(i => {
        const val = ((i[fieldName] as string) ?? '').trim()
        return val.length > 0 && isBrokenDescription(val)
      })
    }

    collected.push(...items)
    offset += data.length

    // If fewer than PAGE_SIZE returned, no more pages
    if (data.length < PAGE_SIZE) break
  }

  return collected.slice(0, limit)
}

// ── Clean AI output ──────────────────────────────────────────────────────────

function cleanOutput(text: string): string | null {
  if (!text) return null
  let cleaned = text.trim()

  // Strip all leading/trailing quote characters (straight + curly) in one pass
  // deno-lint-ignore no-control-regex
  cleaned = cleaned.replace(/^[\u0022\u0027\u201c\u201d\u2018\u2019]+|[\u0022\u0027\u201c\u201d\u2018\u2019]+$/g, '').trim()

  // Remove label prefixes
  cleaned = cleaned.replace(/^(Description|Bio|Biography|Summary):\s*/i, '').trim()

  return cleaned || null
}

// ── Main processor ───────────────────────────────────────────────────────────

export async function processAiEnhancer(
  supabase: SupabaseClient,
  config: ModuleConfig,
  refs: SharedRefs,
  opts: { dryRun: boolean; contentType?: string; contentId?: string; offset?: number },
): Promise<{ scanned: number; changes: ProposedChange[]; errors: number }> {
  const apiToken = Deno.env.get('CLOUDFLARE_API_TOKEN')
  if (!apiToken) {
    console.error('[ai-enhancer] CLOUDFLARE_API_TOKEN not configured')
    return { scanned: 0, changes: [], errors: 1 }
  }

  const mc = config.module.config as { max_tokens?: number }
  const maxTokens = mc.max_tokens ?? 500

  // Parse rules into tasks
  const tasks = config.rules
    .filter(r => r.rule_type === 'ai_enhance')
    .filter(r => !opts.contentType || r.content_type === opts.contentType)
    .map(rule => {
      const rc = rule.rule_config as { mode?: string; max_length?: number }
      return { rule, mode: rc.mode ?? 'generate', maxLength: rc.max_length ?? 80 }
    })

  if (tasks.length === 0) {
    console.log('[ai-enhancer] No enabled ai_enhance rules found')
    return { scanned: 0, changes: [], errors: 0 }
  }

  const changes: ProposedChange[] = []
  let scanned = 0
  let errors = 0
  let firstError = ''
  let budget = config.module.batch_size // limits total AI calls (cost control)
  let rateLimited = false
  const debugTasks: string[] = []

  for (const task of tasks) {
    if (budget <= 0 || rateLimited) break

    const ctConfig = CONTENT_TYPE_CONFIG[task.rule.content_type]
    if (!ctConfig) continue

    // Single-item mode (from CMS UI)
    if (opts.contentId) {
      const { data } = await supabase
        .from(ctConfig.table)
        .select(ctConfig.selectFields)
        .eq('id', opts.contentId)
        .single()
      if (!data) continue

      const item = data as Record<string, unknown>
      scanned++
      const prompt = buildPrompt(item, task.rule.content_type, task.rule.field_name, task.mode, refs)
      if (!prompt) continue

      try {
        const raw = await callAI(apiToken, SYSTEM, prompt, maxTokens)
        const cleaned = cleanOutput(raw)
        if (!cleaned) continue

        const oldValue = ((item[task.rule.field_name] as string) ?? '').trim() || null
        if (oldValue && cleaned.toLowerCase() === oldValue.toLowerCase()) continue

        budget--
        const reasoning = task.mode === 'cleanup'
          ? `Replaced broken ${task.rule.field_name} "${(oldValue ?? '').slice(0, 40)}" with AI-generated text (${cleaned.length} chars)`
          : oldValue
            ? `AI-expanded ${task.rule.field_name} (${oldValue.length} → ${cleaned.length} chars)`
            : `AI-generated ${task.rule.field_name} (${cleaned.length} chars) from metadata`

        changes.push({
          content_type: task.rule.content_type,
          content_id: String(item.id),
          content_name: getContentName(item, ctConfig),
          field_name: task.rule.field_name,
          old_value: oldValue,
          new_value: cleaned,
          change_type: 'ai_enhance',
          confidence: 0.75,
          reasoning,
          rule_id: task.rule.id,
        })
      } catch (e) {
        const msg = (e as Error).message ?? String(e)
        if (!firstError) firstError = msg
        if ((e as Error).message === 'RATE_LIMIT') { rateLimited = true } else { errors++ }
      }
      continue
    }

    // Batch mode
    const items = await fetchCandidates(
      supabase, config.module.id, task.rule.content_type, task.rule.field_name,
      task.mode, task.maxLength, budget, opts.offset ?? 0,
    )

    debugTasks.push(`${task.rule.content_type}.${task.rule.field_name}(${task.mode}): ${items.length} items, budget=${budget}`)
    console.log(`[ai-enhancer] ${task.rule.content_type}.${task.rule.field_name} (${task.mode}): ${items.length} candidates`)

    for (const item of items) {
      if (budget <= 0 || rateLimited) break
      scanned++

      const prompt = buildPrompt(item, task.rule.content_type, task.rule.field_name, task.mode, refs)
      if (!prompt) {
        if (scanned <= 3) {
          const fv = (item[task.rule.field_name] as string) ?? '<null>'
          console.log(`[ai-enhancer] SKIP ${item.name || item.id}: mode=${task.mode} field=${task.rule.field_name} val="${fv.slice(0, 30)}" prof="${(item.profession as string ?? '<null>').slice(0, 30)}" lgbti="${(item.lgbti_connection as string ?? '<null>').slice(0, 30)}"`)
        }
        continue
      }

      try {
        const raw = await callAI(apiToken, SYSTEM, prompt, maxTokens)
        budget--

        const cleaned = cleanOutput(raw)
        if (!cleaned) continue

        const oldValue = ((item[task.rule.field_name] as string) ?? '').trim() || null
        if (oldValue && cleaned.toLowerCase() === oldValue.toLowerCase()) continue

        const reasoning = task.mode === 'cleanup'
          ? `Replaced broken ${task.rule.field_name} "${(oldValue ?? '').slice(0, 40)}" with AI-generated text (${cleaned.length} chars)`
          : oldValue
            ? `AI-expanded ${task.rule.field_name} (${oldValue.length} → ${cleaned.length} chars)`
            : `AI-generated ${task.rule.field_name} (${cleaned.length} chars) from metadata`

        changes.push({
          content_type: task.rule.content_type,
          content_id: String(item.id),
          content_name: getContentName(item, ctConfig),
          field_name: task.rule.field_name,
          old_value: oldValue,
          new_value: cleaned,
          change_type: 'ai_enhance',
          confidence: 0.75,
          reasoning,
          rule_id: task.rule.id,
        })

        // Brief pause between AI calls (CF AI latency ~5s provides natural throttling)
        if (budget > 0) await delay(100)
      } catch (e) {
        if ((e as Error).message === 'RATE_LIMIT') {
          console.warn(`[ai-enhancer] Rate limit hit, stopping ${task.rule.content_type} batch`)
          rateLimited = true
        } else {
          const msg = (e as Error).message ?? String(e)
          if (!firstError) firstError = msg
          if (errors < 3) console.error(`[ai-enhancer] Error ${task.rule.content_type}/${item.id}: ${msg}`)
          errors++
        }
      }
    }
  }

  console.log(`[ai-enhancer] Done: scanned=${scanned} changes=${changes.length} errors=${errors} budget_remaining=${budget}${firstError ? ` firstError=${firstError}` : ''}`)
  return { scanned, changes, errors, firstError: firstError || undefined, debugTasks }
}
