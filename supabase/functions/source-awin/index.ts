import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging, MissingCredentialsError, skippedResponse } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { parseCsv } from '../_shared/csv.ts'

// ============================================================
// Source: AWIN Affiliate Product Feed
// Replaces: import-awin-products
// ============================================================

// Default Awin datafeed URL (gzip CSV) built from the API credentials —
// mirrors the URL the retired import-awin-products fetcher constructed, so
// the admin import keeps working without an explicit AWIN_FEED_URL.
function defaultAwinFeedUrl(): string | undefined {
  const token = Deno.env.get('AWIN_API_TOKEN')
  const advertiserId = Deno.env.get('AWIN_ADVERTISER_ID')
  if (!token || !advertiserId) return undefined
  const columns = [
    'aw_deep_link', 'product_name', 'aw_product_id', 'merchant_product_id',
    'merchant_image_url', 'description', 'merchant_category', 'search_price',
    'merchant_name', 'merchant_id', 'category_name', 'category_id',
    'aw_image_url', 'currency', 'store_price', 'delivery_cost',
    'merchant_deep_link', 'language', 'last_updated', 'display_price',
    'data_feed_id', 'brand_name', 'brand_id', 'colour',
    'product_short_description', 'specifications', 'condition',
    'product_model', 'model_number', 'dimensions', 'keywords',
    'promotional_text', 'product_type', 'rrp_price',
  ].join(',')
  return `https://productdata.awin.com/datafeed/download/apikey/${token}/language/en/cid/${advertiserId}/hasEnhancedFeeds/0/columns/${columns}/format/csv/delimiter/%2C/compression/gzip/adultcontent/1/`
}

// Awin's datafeed download is a gzip FILE (not Content-Encoding), so fetch
// does not auto-decompress it. Sniff the magic bytes and inflate if needed.
async function readFeedText(res: Response): Promise<string> {
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))
    return await new Response(stream).text()
  }
  return new TextDecoder().decode(buf)
}

const awinAdapter: SourceAdapter = {
  name: 'awin',
  entityType: 'marketplace',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const feedUrl = (config.filters?.feedUrl as string) || Deno.env.get('AWIN_FEED_URL') || defaultAwinFeedUrl()
    if (!feedUrl) throw new MissingCredentialsError('AWIN_FEED_URL')

    const supabase = getServiceClient()
    const limit = config.batchSize || 100
    const offset = config.offset || 0

    const csvText = await withCircuitBreaker(supabase, 'awin', async () => {
      const res = await fetch(feedUrl)
      if (!res.ok) throw new Error(`AWIN feed ${res.status}`)
      return await readFeedText(res)
    })

    const rows = parseCsv(csvText)
    const items: RawItem[] = []

    for (const row of rows.slice(offset, offset + limit)) {
      // Content-addressed fallback: use title+merchant hash instead of row index
      const fallbackId = row.aw_product_id || row.product_id
        || `awin-${String(row.product_name ?? '').slice(0, 50)}-${String(row.merchant_name ?? '')}`
      items.push({
        sourceId: String(fallbackId),
        data: row,
      })
    }

    return items
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data as Record<string, unknown>
    return {
      entityType: 'marketplace',
      sourceId: raw.sourceId,
      sourceName: 'awin',
      name: String(d.product_name || d.title || ''),
      description: String(d.description || d.product_short_description || ''),
      // Prefer the clean merchant URL for external_url; the Awin cread link
      // reaches affiliate_url via metadata.aw_deep_link (commit RPC mapping).
      urls: d.merchant_deep_link ? [String(d.merchant_deep_link)] : d.aw_deep_link ? [String(d.aw_deep_link)] : [],
      images: d.aw_image_url ? [String(d.aw_image_url)] : d.merchant_image_url ? [String(d.merchant_image_url)] : [],
      tags: d.category_name ? [String(d.category_name).toLowerCase()] : [],
      metadata: {
        awin_product_id: raw.sourceId,
        merchant_name: d.merchant_name,
        price: d.search_price || d.rrp_price,
        currency: d.currency,
        category: d.category_name,
        brand: d.brand_name,
        in_stock: d.in_stock !== '0',
        aw_deep_link: d.aw_deep_link || null,
        merchant_deep_link: d.merchant_deep_link || null,
        product_url: d.merchant_deep_link || null,
      },
    }
  },
  getSourceId(raw: RawItem): string { return raw.sourceId },
}

Deno.serve(withErrorReporting('source-awin', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.limit || body.batch_size || 100,
      offset: body.offset,
      filters: { feedUrl: body.feedUrl },
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id, nodeId: body.node_id,
    }
    const rawItems = await awinAdapter.fetch(config)
    if (config.dryRun) return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    // sourceType: admin imports tag rows 'import-awin' for source_type continuity.
    const written = await writeToStaging(supabase, awinAdapter, rawItems, { ...config, targetTable: 'marketplace_listings', sourceType: body.sourceType })
    return jsonResponse({ success: true, items: written, items_total: rawItems.length, items_processed: written, items_succeeded: written, items_failed: 0 }, 200, req)
  } catch (error) {
    if (error instanceof MissingCredentialsError) {
      return jsonResponse(skippedResponse('missing_credentials', error.missing), 200, req)
    }
    return errorResponse((error as Error).message, 500, req)
  }
}))
