/**
 * expand-recurring-events — Generates event instances from recurring templates.
 *
 * Reads events where is_recurring=true and recurrence_rule IS NOT NULL,
 * then creates child instances (parent_event_id set) for the next N weeks.
 * Idempotent: unique index on (parent_event_id, start_date) prevents duplicates.
 *
 * Supports: daily, weekly, biweekly, monthly frequencies.
 * Handles: exception dates, end dates, day-of-week selection.
 *
 * Usage:
 *   POST /functions/v1/expand-recurring-events
 *     { "event_id": "uuid",  "weeks_ahead": 12, "dry_run": false }
 *   GET  /functions/v1/expand-recurring-events?weeks_ahead=12  (for cron)
 */

import { getCorsHeaders, getServiceClient } from '../_shared/supabase-client.ts'

const supabase = getServiceClient()

interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'biweekly' | 'monthly'
  interval?: number    // default 1
  byDay?: number[]     // 0=Sun, 1=Mon, ..., 6=Sat
  until?: string       // ISO date
  exceptions?: string[] // ISO dates to skip
  count?: number       // max number of instances
}

interface ExpandResult {
  parent_id: string
  parent_title: string
  instances_created: number
  instances_skipped: number
  errors: string[]
}

const COPY_FIELDS = [
  'title', 'description', 'event_type', 'venue_id', 'city_id', 'country_id',
  'queer_village_id', 'address', 'latitude', 'longitude', 'timezone',
  'organizer_name', 'organizer_contact', 'organizer_email', 'website',
  'ticket_url', 'is_free', 'price_min', 'price_max', 'currency',
  'max_attendees', 'accessibility_attributes', 'accessibility_notes',
  'target_groups', 'age_restriction', 'images', 'tags', 'festival_id',
  'data_source', 'status', 'featured', 'lgbti_relevance_score',
  'sensitivity_flags', 'content_warnings',
] as const

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  try {
    let eventId: string | null = null
    let weeksAhead = 12
    let dryRun = false

    if (req.method === 'POST') {
      const body = await req.json()
      eventId = body.event_id ?? null
      weeksAhead = body.weeks_ahead ?? 12
      dryRun = body.dry_run ?? false
    } else {
      const url = new URL(req.url)
      weeksAhead = parseInt(url.searchParams.get('weeks_ahead') || '12', 10)
    }

    // Fetch recurring templates
    let query = supabase
      .from('events')
      .select('*')
      .eq('is_recurring', true)
      .not('recurrence_rule', 'is', null)
      .is('parent_event_id', null) // only templates, not instances

    if (eventId) {
      query = query.eq('id', eventId)
    }

    const { data: templates, error: fetchErr } = await query.limit(200)
    if (fetchErr) throw new Error(`Fetch templates: ${fetchErr.message}`)

    const results: ExpandResult[] = []
    const horizon = new Date()
    horizon.setDate(horizon.getDate() + weeksAhead * 7)

    for (const template of templates || []) {
      const result = await expandTemplate(template, horizon, dryRun)
      results.push(result)
    }

    const totalCreated = results.reduce((s, r) => s + r.instances_created, 0)
    const totalSkipped = results.reduce((s, r) => s + r.instances_skipped, 0)

    return new Response(JSON.stringify({
      ok: true,
      templates_processed: results.length,
      instances_created: totalCreated,
      instances_skipped: totalSkipped,
      dry_run: dryRun,
      details: results,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[expand-recurring-events]', err)
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})

async function expandTemplate(
  template: Record<string, unknown>,
  horizon: Date,
  dryRun: boolean,
): Promise<ExpandResult> {
  const result: ExpandResult = {
    parent_id: String(template.id),
    parent_title: String(template.title || 'Untitled'),
    instances_created: 0,
    instances_skipped: 0,
    errors: [],
  }

  const rule = template.recurrence_rule as RecurrenceRule | null
  if (!rule?.freq) {
    result.errors.push('Missing or invalid recurrence_rule.freq')
    return result
  }

  const templateStart = new Date(String(template.start_date))
  const templateEnd = template.end_date ? new Date(String(template.end_date)) : null
  const durationMs = templateEnd ? templateEnd.getTime() - templateStart.getTime() : 0

  const until = rule.until ? new Date(rule.until) : horizon
  const effectiveHorizon = until < horizon ? until : horizon
  const exceptions = new Set((rule.exceptions || []).map(d => d.slice(0, 10)))
  const interval = rule.interval || 1
  const maxCount = rule.count || 1000

  const dates = generateDates(templateStart, rule.freq, interval, rule.byDay, effectiveHorizon, maxCount)

  // Build base row from template
  const baseRow: Record<string, unknown> = {
    parent_event_id: template.id,
    is_recurring: false,
    recurrence_rule: null,
    recurrence_pattern: null,
    created_by: template.created_by,
  }
  for (const field of COPY_FIELDS) {
    if (field in template) baseRow[field] = template[field]
  }

  for (const date of dates) {
    const dateStr = date.toISOString().slice(0, 10)

    // Skip exception dates
    if (exceptions.has(dateStr)) {
      result.instances_skipped++
      continue
    }

    // Skip past dates
    if (date < new Date()) {
      result.instances_skipped++
      continue
    }

    const instanceRow = {
      ...baseRow,
      start_date: date.toISOString(),
      end_date: durationMs > 0
        ? new Date(date.getTime() + durationMs).toISOString()
        : date.toISOString(),
    }

    if (dryRun) {
      result.instances_created++
      continue
    }

    const { error: insertErr } = await supabase.from('events').insert(instanceRow)
    if (insertErr) {
      // Unique constraint violation = already exists, just skip
      if (insertErr.code === '23505') {
        result.instances_skipped++
      } else {
        result.errors.push(`${dateStr}: ${insertErr.message}`)
      }
    } else {
      result.instances_created++
    }
  }

  return result
}

function generateDates(
  start: Date,
  freq: RecurrenceRule['freq'],
  interval: number,
  byDay: number[] | undefined,
  horizon: Date,
  maxCount: number,
): Date[] {
  const dates: Date[] = []
  const current = new Date(start)

  for (let i = 0; i < maxCount && current <= horizon; i++) {
    if (freq === 'daily') {
      dates.push(new Date(current))
      current.setDate(current.getDate() + interval)
    } else if (freq === 'weekly' || freq === 'biweekly') {
      const step = freq === 'biweekly' ? 2 * interval : interval
      if (byDay && byDay.length > 0) {
        // Generate dates for each specified day within the week
        const weekStart = new Date(current)
        for (const day of byDay) {
          const d = new Date(weekStart)
          const diff = day - d.getDay()
          d.setDate(d.getDate() + (diff >= 0 ? diff : diff + 7))
          if (d <= horizon && d >= start) {
            dates.push(new Date(d))
          }
        }
        current.setDate(current.getDate() + step * 7)
      } else {
        dates.push(new Date(current))
        current.setDate(current.getDate() + step * 7)
      }
    } else if (freq === 'monthly') {
      dates.push(new Date(current))
      current.setMonth(current.getMonth() + interval)
    }
  }

  // Sort and deduplicate by date string
  const seen = new Set<string>()
  return dates
    .sort((a, b) => a.getTime() - b.getTime())
    .filter(d => {
      const key = d.toISOString().slice(0, 10)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}
