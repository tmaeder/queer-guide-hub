import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging, MissingCredentialsError, skippedResponse } from '../_shared/source-adapter.ts'

// ============================================================
// Source: CSV File Upload — generic adapter for all entity types
// Replaces: import-*-csv functions
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const entityType = body.entityType || 'venue'
    const targetTable = body.targetTable || entityTypeToTable(entityType)

    const config: AdapterConfig = {
      batchSize: body.batch_size || 500,
      filters: { fileUrl: body.fileUrl, delimiter: body.delimiter, entityType },
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id, nodeId: body.node_id,
    }

    const rawItems = await csvUploadAdapter.fetch(config)

    // Inject entity type into each item
    for (const item of rawItems) {
      item.data._entity_type = entityType
    }

    if (config.dryRun) return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    const written = await writeToStaging(supabase, csvUploadAdapter, rawItems, { ...config, targetTable })
    return jsonResponse({ success: true, items: written, items_total: rawItems.length, items_processed: written, items_succeeded: written, items_failed: 0 }, 200, req)
  } catch (error) {
    if (error instanceof MissingCredentialsError) {
      return jsonResponse(skippedResponse('missing_credentials', error.missing), 200, req)
    }
    return errorResponse((error as Error).message, 500, req)
  }
})

function entityTypeToTable(type: string): string {
  const map: Record<string, string> = {
    venue: 'venues', event: 'events', personality: 'personalities',
    tag: 'unified_tags', adult_model: 'personalities', news: 'news_articles',
  }
  return map[type] || 'venues'
}
