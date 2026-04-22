import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { MissingCredentialsError, skippedResponse } from '../_shared/source-adapter.ts'

// Source: Tags Extract — extracts unique tags from venues/events/personalities
// and upserts directly into unified_tags (skips ingestion_staging).

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const dryRun = body.dry_run || false

    const tagSet = new Map<string, { name: string; slug: string; source: string }>()

    const tables = [
      { table: 'venues', col: 'tags' },
      { table: 'events', col: 'tags' },
      { table: 'personalities', col: 'tags' },
    ]

    for (const { table, col } of tables) {
      const { data } = await supabase
        .from(table)
        .select(col)
        .not(col, 'is', null)
        .limit(5000)

      if (!data) continue
      for (const row of data) {
        const tags = row[col as keyof typeof row]
        if (!Array.isArray(tags)) continue
        for (const tag of tags) {
          const name = String(tag).trim()
          if (!name) continue
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          if (slug && !tagSet.has(slug)) {
            tagSet.set(slug, { name, slug, source: table })
          }
        }
      }
    }

    if (tagSet.size === 0) {
      return jsonResponse({ success: true, items: 0, message: 'no tags found' }, 200, req)
    }

    if (dryRun) {
      return jsonResponse({ success: true, items: tagSet.size, dry_run: true }, 200, req)
    }

    // Upsert directly into unified_tags — skip ingestion_staging for tag data.
    const rows = Array.from(tagSet.values()).map(t => ({
      name: t.name,
      slug: t.slug,
      status: 'active',
    }))

    const CHUNK = 200
    let upserted = 0
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const { error, count } = await supabase
        .from('unified_tags')
        .upsert(chunk, { onConflict: 'slug', count: 'exact' })
      if (error) {
        console.error(`tags upsert chunk ${i}: ${error.message}`)
      } else {
        upserted += count ?? chunk.length
      }
    }

    return jsonResponse({
      success: true,
      items: upserted,
      items_total: tagSet.size,
      items_processed: upserted,
      items_succeeded: upserted,
      items_failed: tagSet.size - upserted,
    }, 200, req)
  } catch (error) {
    if (error instanceof MissingCredentialsError) {
      return jsonResponse(skippedResponse('missing_credentials', error.missing), 200, req)
    }
    return errorResponse((error as Error).message, 500, req)
  }
})
