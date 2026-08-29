import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { MissingCredentialsError, skippedResponse } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Source: Tags Extract — extracts unique tags from venues/events/personalities
// and upserts directly into unified_tags (skips ingestion_staging).

Deno.serve(withErrorReporting('source-tags-extract', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
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

    // Insert directly into unified_tags — skip ingestion_staging for tag data.
    //
    // INSERT-ONLY, deliberately. This ran as an upsert carrying an explicit
    // status:'active', so ON CONFLICT DO UPDATE wrote status back to 'active' on
    // every existing row it re-derived — while leaving deprecated_at set. That
    // resurrected 297 tags the 2026-06-05 audit had deprecated into a state where
    // fetchTagWithCategories (reads status) served a live page and
    // search_documents_index_tags (reads deprecated_at) refused to index it, so
    // `lgbtiq`, `sauna` and `kink` were unreachable by site search for three
    // months. Repaired in 20261007100000, which also adds a CHECK making that
    // state unrepresentable — this upsert would now fail loudly instead.
    //
    // The status column is omitted rather than pinned: it defaults to 'active',
    // so new tags are unaffected, and a row that already exists must not be
    // reanimated by a scraped free-text string. Reviving a deprecated tag is
    // restore_deprecated_tag()'s job — it clears deprecated_at and the reason
    // together, which is the whole difference. `name` is omitted from the
    // conflict path for the same reason: this node mints vocabulary from
    // user-entered arrays and must never overwrite a curated name with one.
    const rows = Array.from(tagSet.values()).map(t => ({
      name: t.name,
      slug: t.slug,
    }))

    const CHUNK = 200
    let upserted = 0
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const { error, count } = await supabase
        .from('unified_tags')
        .upsert(chunk, { onConflict: 'slug', ignoreDuplicates: true, count: 'exact' })
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
}))
