/**
 * Logo Enricher — Enriches venues and events with logos from logo.dev.
 * Finds records with a website but no logo_url, and sets the logo.dev CDN URL.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { CONTENT_TYPE_CONFIG,
  type ModuleConfig, type SharedRefs, type ProposedChange,
} from '../../_shared/automation-utils.ts'
import { logoUrlFromWebsite } from '../../_shared/logo-enrichment.ts'

const LOGO_CONTENT_TYPES = ['venues', 'events'] as const

export async function processLogoEnricher(
  supabase: SupabaseClient,
  config: ModuleConfig,
  _refs: SharedRefs,
  opts: { dryRun: boolean; contentType?: string; contentId?: string; offset?: number },
): Promise<{ scanned: number; changes: ProposedChange[]; errors: number }> {
  const allChanges: ProposedChange[] = []
  let totalScanned = 0
  let totalErrors = 0

  const contentTypes = opts.contentType
    ? LOGO_CONTENT_TYPES.filter(ct => ct === opts.contentType)
    : [...LOGO_CONTENT_TYPES]

  for (const contentType of contentTypes) {
    const ctConfig = CONTENT_TYPE_CONFIG[contentType]
    if (!ctConfig) continue

    // Fetch items missing logo_url that have a website
    let query = supabase
      .from(ctConfig.table)
      .select('id, ' + (contentType === 'events' ? 'title' : 'name') + ', website, logo_url, logo_fetched_at')
      .is('logo_url', null)
      .not('website', 'is', null)

    if (opts.contentId) {
      query = query.eq('id', opts.contentId)
    }

    const offset = opts.offset ?? 0
    const batchSize = config.module.batch_size || 100
    const { data: items, error } = await query.range(offset, offset + batchSize - 1)

    if (error) {
      console.error(`[logo-enricher] Error fetching ${contentType}: ${error.message}`)
      totalErrors++
      continue
    }
    if (!items) continue

    for (const item of items) {
      totalScanned++
      try {
        const website = item.website as string
        const logoUrl = logoUrlFromWebsite(website)
        if (!logoUrl) continue

        const name = String(item.title || item.name || 'Unknown').slice(0, 100)

        allChanges.push({
          content_type: contentType,
          content_id: String(item.id),
          content_name: name,
          field_name: 'logo_url',
          old_value: null,
          new_value: logoUrl,
          change_type: 'enrich',
          confidence: 0.95,
          reasoning: `Logo from logo.dev for website "${website}"`,
        })
      } catch (e) {
        console.error(`[logo-enricher] Error processing ${contentType}/${item.id}: ${e}`)
        totalErrors++
      }
    }
  }

  return { scanned: totalScanned, changes: allChanges, errors: totalErrors }
}
