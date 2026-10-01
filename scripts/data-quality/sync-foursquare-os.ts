#!/usr/bin/env -S deno run --allow-env --allow-net --allow-read --allow-write

/**
 * Resumable FSQ OS Places sync.
 *
 * The Places Portal supplies the account-specific Iceberg/DuckDB connection
 * snippet. Export a geographically bounded query as newline-delimited JSON,
 * then run this command. It deliberately does not guess portal endpoints or
 * credentials that Foursquare only reveals inside the authenticated portal.
 *
 *   deno run --allow-env --allow-net --allow-read --allow-write \
 *     scripts/data-quality/sync-foursquare-os.ts \
 *     --stream snapshot --input /secure/fsq-places.ndjson \
 *     --release-id 2026-09 --dry-run
 *
 * Replace --dry-run with --write after reviewing the report. Categories use
 * the category dataset export; deltas accept the documented delta rows and an
 * optional nested `place` object for add/update/merge enrichment.
 */

import { matchFoursquarePlace, type FoursquarePlace, type MatchableVenue } from '../../supabase/functions/_shared/foursquare.ts'
import { TextLineStream } from 'jsr:@std/streams/text-line-stream'

type Stream = 'categories' | 'snapshot' | 'delta'

interface Options {
  stream: Stream
  input: string
  releaseId: string
  batchSize: number
  write: boolean
  checkpoint: string
  resetCheckpoint: boolean
}

interface Checkpoint {
  input: string
  stream: Stream
  release_id: string
  next_record: number
  completed: boolean
  updated_at: string
  totals: Record<string, number>
}

function usage(): never {
  console.error(`Usage:
  sync-foursquare-os.ts --stream <categories|snapshot|delta> --input <file.ndjson|file.json>
    --release-id <id> [--batch-size 1..500] [--checkpoint <path>]
    [--dry-run|--write] [--reset-checkpoint]

Required environment:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
Optional environment:
  INTERNAL_INVOKE_SECRET (recommended when the hosted function uses internal-call auth)`)
  Deno.exit(2)
}

function parseArgs(args: string[]): Options {
  const values = new Map<string, string>()
  const flags = new Set<string>()
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('--')) usage()
    if (['--write', '--dry-run', '--reset-checkpoint'].includes(arg)) flags.add(arg)
    else {
      const value = args[++i]
      if (!value) usage()
      values.set(arg, value)
    }
  }
  const stream = values.get('--stream') as Stream
  const input = values.get('--input') ?? ''
  const releaseId = values.get('--release-id') ?? ''
  if (!['categories', 'snapshot', 'delta'].includes(stream) || !input || !releaseId) usage()
  if (flags.has('--write') && flags.has('--dry-run')) usage()
  const batchSize = Number(values.get('--batch-size') ?? 250)
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) usage()
  const safeRelease = releaseId.replace(/[^a-zA-Z0-9._-]/g, '_')
  const write = flags.has('--write')
  return {
    stream,
    input,
    releaseId,
    batchSize,
    write,
    checkpoint: values.get('--checkpoint')
      ?? `.tmp/foursquare-os-${stream}-${safeRelease}-${write ? 'write' : 'dry-run'}.checkpoint.json`,
    resetCheckpoint: flags.has('--reset-checkpoint'),
  }
}

function env(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function restHeaders(serviceKey: string): HeadersInit {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }
}

function functionHeaders(serviceKey: string, internalSecret?: string): HeadersInit {
  return {
    ...restHeaders(serviceKey),
    ...(internalSecret ? { 'X-Internal-Secret': internalSecret } : {}),
  }
}

async function loadCheckpoint(options: Options): Promise<Checkpoint> {
  if (options.resetCheckpoint) {
    return freshCheckpoint(options)
  }
  try {
    const parsed = JSON.parse(await Deno.readTextFile(options.checkpoint)) as Checkpoint
    if (parsed.input !== options.input || parsed.stream !== options.stream || parsed.release_id !== options.releaseId) {
      throw new Error(`Checkpoint ${options.checkpoint} belongs to a different input/stream/release`)
    }
    return parsed
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return freshCheckpoint(options)
    throw error
  }
}

function freshCheckpoint(options: Options): Checkpoint {
  return {
    input: options.input,
    stream: options.stream,
    release_id: options.releaseId,
    next_record: 0,
    completed: false,
    updated_at: new Date().toISOString(),
    totals: {},
  }
}

async function saveCheckpoint(path: string, checkpoint: Checkpoint): Promise<void> {
  const slash = path.lastIndexOf('/')
  if (slash > 0) await Deno.mkdir(path.slice(0, slash), { recursive: true })
  const temp = `${path}.tmp`
  await Deno.writeTextFile(temp, `${JSON.stringify(checkpoint, null, 2)}\n`)
  await Deno.rename(temp, path)
}

async function* readRecords(path: string): AsyncGenerator<Record<string, unknown>> {
  if (path.endsWith('.json') && !path.endsWith('.ndjson')) {
    const rows = JSON.parse(await Deno.readTextFile(path))
    if (!Array.isArray(rows)) throw new Error('JSON input must be an array; use NDJSON for large extracts')
    for (const row of rows) if (row && typeof row === 'object') yield row as Record<string, unknown>
    return
  }

  const file = await Deno.open(path, { read: true })
  try {
    const lines = file.readable
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TextLineStream())
    for await (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const row = JSON.parse(trimmed)
      if (row && typeof row === 'object') yield row as Record<string, unknown>
    }
  } finally {
    try { file.close() } catch { /* readable may already own/close the resource */ }
  }
}

async function loadVenues(baseUrl: string, serviceKey: string): Promise<MatchableVenue[]> {
  const venues: MatchableVenue[] = []
  const pageSize = 1_000
  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(`${baseUrl}/rest/v1/venues`)
    url.searchParams.set('select', 'id,name,latitude,longitude,address,city,phone,email,website,foursquare_id,platform_ids')
    url.searchParams.set('duplicate_of_id', 'is.null')
    const response = await fetch(url, {
      headers: { ...restHeaders(serviceKey), Range: `${offset}-${offset + pageSize - 1}` },
    })
    if (!response.ok) throw new Error(`Load venues HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
    const page = await response.json() as MatchableVenue[]
    venues.push(...page)
    if (page.length < pageSize) break
  }
  return venues
}

const key = (value: unknown): string => String(value ?? '')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '')
const phoneKey = (value: unknown): string => String(value ?? '').replace(/\D/g, '')
const emailKey = (value: unknown): string => String(value ?? '').trim().toLowerCase()
const domainKey = (value: unknown): string => {
  try { return new URL(String(value ?? '')).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' }
}

function indexVenues(venues: MatchableVenue[]): Map<string, Set<number>> {
  const index = new Map<string, Set<number>>()
  const add = (prefix: string, value: string, position: number) => {
    if (!value) return
    const combined = `${prefix}:${value}`
    const bucket = index.get(combined) ?? new Set<number>()
    bucket.add(position)
    index.set(combined, bucket)
  }
  venues.forEach((venue, position) => {
    add('id', String(venue.foursquare_id ?? venue.platform_ids?.foursquare ?? ''), position)
    add('name', key(venue.name), position)
    add('phone', phoneKey(venue.phone), position)
    add('email', emailKey(venue.email), position)
    add('domain', domainKey(venue.website), position)
  })
  return index
}

function placeCandidates(
  place: FoursquarePlace,
  venues: MatchableVenue[],
  index: Map<string, Set<number>>,
): MatchableVenue[] {
  const positions = new Set<number>()
  const add = (combined: string) => index.get(combined)?.forEach((position) => positions.add(position))
  add(`id:${String(place.fsq_place_id ?? place.fsq_id ?? '')}`)
  add(`name:${key(place.name)}`)
  add(`phone:${phoneKey(place.tel)}`)
  add(`email:${emailKey(place.email)}`)
  add(`domain:${domainKey(place.website)}`)
  return [...positions].map((position) => venues[position])
}

function annotateRecord(
  record: Record<string, unknown>,
  stream: Stream,
  venues: MatchableVenue[],
  index: Map<string, Set<number>>,
): Record<string, unknown> {
  if (stream === 'categories') return record
  const container = stream === 'delta' && record.place && typeof record.place === 'object'
    ? record.place as FoursquarePlace
    : record as FoursquarePlace
  const candidates = placeCandidates(container, venues, index)
  const decision = matchFoursquarePlace(container, candidates)
  if (decision.disposition === 'auto_match' && decision.venueId) {
    const annotated = {
      ...container,
      _match_target_id: decision.venueId,
      _match_confidence: decision.confidence,
      _match_reasons: decision.reasons,
    }
    return stream === 'delta' ? { ...record, place: annotated } : annotated
  }
  return record
}

async function sendBatch(
  baseUrl: string,
  serviceKey: string,
  internalSecret: string | undefined,
  options: Options,
  records: Record<string, unknown>[],
  cursor: number,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl}/functions/v1/source-foursquare`, {
    method: 'POST',
    headers: functionHeaders(serviceKey, internalSecret),
    body: JSON.stringify({
      source: 'os',
      stream: options.stream,
      release_id: options.releaseId,
      dry_run: !options.write,
      cursor: { next_record: cursor },
      records,
    }),
  })
  const text = await response.text()
  let parsed: Record<string, unknown>
  try { parsed = JSON.parse(text) } catch { throw new Error(`Invalid source-foursquare response: ${text.slice(0, 500)}`) }
  if (!response.ok || parsed.success !== true) {
    throw new Error(`source-foursquare HTTP ${response.status}: ${JSON.stringify(parsed).slice(0, 1_000)}`)
  }
  return parsed
}

function addTotals(target: Record<string, number>, report: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(report)) {
    if (typeof value === 'number' && Number.isFinite(value)) target[name] = (target[name] ?? 0) + value
  }
}

async function main(): Promise<void> {
  const options = parseArgs(Deno.args)
  const baseUrl = env('SUPABASE_URL').replace(/\/$/, '')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const internalSecret = Deno.env.get('INTERNAL_INVOKE_SECRET')?.trim() || undefined
  const checkpoint = await loadCheckpoint(options)
  const needsMatching = options.stream !== 'categories'
  const venues = needsMatching ? await loadVenues(baseUrl, serviceKey) : []
  const venueIndex = indexVenues(venues)
  const batch: Record<string, unknown>[] = []
  let recordNumber = 0

  console.log(JSON.stringify({
    mode: options.write ? 'write' : 'dry-run',
    stream: options.stream,
    release_id: options.releaseId,
    resume_at: checkpoint.next_record,
    venue_candidates: venues.length,
  }))

  for await (const raw of readRecords(options.input)) {
    if (recordNumber++ < checkpoint.next_record) continue
    batch.push(annotateRecord(raw, options.stream, venues, venueIndex))
    if (batch.length < options.batchSize) continue
    const report = await sendBatch(baseUrl, serviceKey, internalSecret, options, batch, recordNumber)
    addTotals(checkpoint.totals, report)
    checkpoint.next_record = recordNumber
    checkpoint.updated_at = new Date().toISOString()
    await saveCheckpoint(options.checkpoint, checkpoint)
    console.log(JSON.stringify({ cursor: recordNumber, ...report }))
    batch.length = 0
  }

  if (batch.length) {
    const report = await sendBatch(baseUrl, serviceKey, internalSecret, options, batch, recordNumber)
    addTotals(checkpoint.totals, report)
    checkpoint.next_record = recordNumber
    console.log(JSON.stringify({ cursor: recordNumber, ...report }))
  }
  checkpoint.completed = true
  checkpoint.updated_at = new Date().toISOString()
  await saveCheckpoint(options.checkpoint, checkpoint)
  console.log(JSON.stringify({ completed: true, checkpoint: options.checkpoint, totals: checkpoint.totals }))
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    console.error((error as Error).stack ?? (error as Error).message)
    Deno.exit(1)
  }
}
