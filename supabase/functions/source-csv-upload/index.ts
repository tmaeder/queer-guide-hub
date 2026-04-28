import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging, MissingCredentialsError, skippedResponse } from '../_shared/source-adapter.ts'
import {
  entityTypeToTable,
  routeRows,
  type EntityType,
} from '../_shared/entity-type-classifier.ts'

// ============================================================
// Source: CSV File Upload — generic adapter for all entity types.
//
// Replaces: import-*-csv functions.
//
// Per-row routing (Issue #113): a previous CSV upload routed 10k
// venues/glossary/junk into target_table=personalities because
// target_table was a job-level constant and the AI validator only
// checked field presence. Now each row is classified
// (explicit _entity_type column → markers → linguistic heuristics);
// rows are grouped by classified type and writeToStaging is called
// once per group with the matching entity_type + target_table.
// 'unknown' rows fall back to the job-level type so the caller
// can still bulk-import without per-row hints.
// ============================================================

const csvUploadAdapter: SourceAdapter = {
  name: 'csv-upload',
  entityType: 'any',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const fileUrl = config.filters?.fileUrl as string
    if (!fileUrl) throw new MissingCredentialsError('CSV_FILE_URL')

    const supabase = getServiceClient()

    // Download CSV from Supabase storage or URL
    let csvText: string
    if (fileUrl.startsWith('http')) {
      const res = await fetch(fileUrl)
      if (!res.ok) throw new Error(`Failed to download CSV: ${res.status}`)
      csvText = await res.text()
    } else {
      // Assume Supabase storage path (bucket/path)
      const parts = fileUrl.split('/')
      const bucket = parts[0]
      const path = parts.slice(1).join('/')
      const { data, error } = await supabase.storage.from(bucket).download(path)
      if (error) throw new Error(`Storage download failed: ${error.message}`)
      csvText = await data.text()
    }

    const delimiter = (config.filters?.delimiter as string) || ','
    return parseCsv(csvText, delimiter)
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data
    return {
      entityType: String(d._entity_type || 'unknown'),
      sourceId: raw.sourceId,
      sourceName: 'csv-upload',
      name: String(d.name || d.title || d.Name || d.Title || ''),
      description: String(d.description || d.bio || d.content || d.Description || ''),
      location: {
        address: String(d.address || d.Address || ''),
        city: String(d.city || d.City || ''),
        country: String(d.country || d.Country || ''),
        lat: d.latitude ? Number(d.latitude) : d.lat ? Number(d.lat) : undefined,
        lng: d.longitude ? Number(d.longitude) : d.lng ? Number(d.lng) : undefined,
      },
      urls: d.url || d.website ? [String(d.url || d.website)] : [],
      tags: d.tags ? String(d.tags).split(',').map(t => t.trim()) : [],
      metadata: { ...d },
    }
  },
  getSourceId(raw: RawItem): string { return raw.sourceId },
}

function parseCsv(text: string, delimiter: string): RawItem[] {
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''))
  const items: RawItem[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i], delimiter)
    if (values.length !== headers.length) continue

    const row: Record<string, unknown> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j]
    }

    items.push({
      sourceId: String(row.id || row.external_id || `csv-row-${i}`),
      data: row,
    })
  }

  return items
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === delimiter && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  values.push(current.trim())
  return values
}

function routeRawItems(
  rawItems: RawItem[],
  fallback: { entityType: string; targetTable: string },
) {
  return routeRows(
    rawItems,
    raw => ({ row: raw.data, sourceId: raw.sourceId }),
    fallback,
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const entityType = body.entityType || 'venue'
    const targetTable = body.targetTable || entityTypeToTable(entityType) || 'venues'
    // Caller can disable per-row routing if they really want every row to go
    // to one bucket (legacy behaviour). Default: per-row routing on.
    const perRowRouting = body.per_row_routing !== false

    const config: AdapterConfig = {
      batchSize: body.batch_size || 500,
      filters: { fileUrl: body.fileUrl, delimiter: body.delimiter, entityType },
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id, nodeId: body.node_id,
    }

    const rawItems = await csvUploadAdapter.fetch(config)

    if (config.dryRun) {
      const groups = perRowRouting
        ? routeRawItems(rawItems, { entityType, targetTable })
        : [{
          entityType: entityType as EntityType,
          targetTable,
          items: rawItems,
          sampleReasons: [],
        }]
      return jsonResponse({
        success: true,
        items: rawItems.length,
        dry_run: true,
        routing: groups.map(g => ({
          entity_type: g.entityType === 'fallback' ? entityType : g.entityType,
          target_table: g.targetTable,
          fallback: g.entityType === 'fallback',
          count: g.items.length,
          sample_reasons: g.sampleReasons,
        })),
      }, 200, req)
    }

    if (!perRowRouting) {
      // Legacy single-bucket path: stamp all rows with the job-level type.
      for (const item of rawItems) item.data._entity_type = entityType
      const written = await writeToStaging(supabase, csvUploadAdapter, rawItems, {
        ...config, targetTable, entityType,
      })
      return jsonResponse({
        success: true,
        items: written, items_total: rawItems.length,
        items_processed: written, items_succeeded: written, items_failed: 0,
      }, 200, req)
    }

    const groups = routeRawItems(rawItems, { entityType, targetTable })
    let totalWritten = 0
    const routing: Record<string, unknown>[] = []
    for (const group of groups) {
      const groupEntityType = group.entityType === 'fallback' ? entityType : group.entityType
      // Stamp _entity_type so the downstream NormalizedItem.entityType reflects
      // the per-row routing decision (used by some commit branches).
      for (const item of group.items) item.data._entity_type = groupEntityType
      const written = await writeToStaging(supabase, csvUploadAdapter, group.items, {
        ...config,
        targetTable: group.targetTable,
        entityType: groupEntityType,
      })
      totalWritten += written
      routing.push({
        entity_type: groupEntityType,
        target_table: group.targetTable,
        fallback: group.entityType === 'fallback',
        count: group.items.length,
        written,
        sample_reasons: group.sampleReasons,
      })
    }

    return jsonResponse({
      success: true,
      items: totalWritten,
      items_total: rawItems.length,
      items_processed: totalWritten,
      items_succeeded: totalWritten,
      items_failed: rawItems.length - totalWritten,
      routing,
    }, 200, req)
  } catch (error) {
    if (error instanceof MissingCredentialsError) {
      return jsonResponse(skippedResponse('missing_credentials', error.missing), 200, req)
    }
    return errorResponse((error as Error).message, 500, req)
  }
})
