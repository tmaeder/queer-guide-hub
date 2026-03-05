/**
 * Geo Enricher — Links content to cities/countries using shared reference data.
 * Uses shared resolveCountry/resolveCity from automation-utils (no duplicate alias maps).
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import {
  fetchBatch, getContentName, resolveCountry, resolveCity,
  CONTENT_TYPE_CONFIG,
  type ModuleConfig, type SharedRefs, type ProposedChange, type AutomationRule,
} from '../../_shared/automation-utils.ts'

const GEO_FIELDS: Record<string, {
  countryTextField?: string
  cityTextField?: string
  countryIdField: string
  cityIdField: string
}> = {
  venues: { countryTextField: 'country', cityTextField: 'city', countryIdField: 'country_id', cityIdField: 'city_id' },
  events: { countryTextField: 'country', cityTextField: 'city', countryIdField: 'country_id', cityIdField: 'city_id' },
  personalities: { countryTextField: 'nationality', cityTextField: undefined, countryIdField: 'country_id', cityIdField: 'city_id' },
}

function processItem(
  item: Record<string, unknown>,
  contentType: string,
  contentName: string,
  rules: AutomationRule[],
  refs: SharedRefs,
): ProposedChange[] {
  const changes: ProposedChange[] = []
  const contentId = String(item.id)
  const geoConfig = GEO_FIELDS[contentType]
  if (!geoConfig) return changes

  for (const rule of rules) {
    if (rule.content_type !== contentType) continue
    const cfg = rule.rule_config as { source?: string }

    if (rule.rule_type === 'geo_match') {
      if (cfg.source === 'country' && geoConfig.countryTextField) {
        const existingCountryId = item[geoConfig.countryIdField]
        if (existingCountryId) continue

        const countryText = item[geoConfig.countryTextField] as string | null
        const resolved = resolveCountry(countryText, refs)

        if (resolved) {
          changes.push({
            content_type: contentType, content_id: contentId, content_name: contentName,
            field_name: geoConfig.countryIdField, old_value: null, new_value: resolved.id,
            change_type: 'enrich', confidence: 0.92,
            reasoning: `Matched country "${countryText}" → "${resolved.name}" (id: ${resolved.id})`,
            rule_id: rule.id,
          })
        } else if (countryText?.trim()) {
          changes.push({
            content_type: contentType, content_id: contentId, content_name: contentName,
            field_name: geoConfig.countryIdField, old_value: null, new_value: null,
            change_type: 'flag', confidence: 0.70,
            reasoning: `Could not resolve country text: "${countryText}"`,
            rule_id: rule.id,
          })
        }
      }

      if (cfg.source === 'city' && geoConfig.cityTextField) {
        const existingCityId = item[geoConfig.cityIdField]
        if (existingCityId) continue

        const cityText = item[geoConfig.cityTextField] as string | null
        const countryId = (item[geoConfig.countryIdField] as string | null) ?? null
        const resolved = resolveCity(cityText, countryId, refs)

        if (resolved) {
          changes.push({
            content_type: contentType, content_id: contentId, content_name: contentName,
            field_name: geoConfig.cityIdField, old_value: null, new_value: resolved.id,
            change_type: 'enrich', confidence: countryId ? 0.95 : 0.85,
            reasoning: `Matched city "${cityText}" → "${resolved.name}" (id: ${resolved.id})${countryId ? ' (country-scoped)' : ''}`,
            rule_id: rule.id,
          })
        }
      }

      // Personalities: nationality → country_id
      if (cfg.source === 'nationality' && contentType === 'personalities') {
        const existingCountryId = item.country_id
        if (existingCountryId) continue

        const nationality = item.nationality as string | null
        const resolved = resolveCountry(nationality, refs)

        if (resolved) {
          changes.push({
            content_type: contentType, content_id: contentId, content_name: contentName,
            field_name: 'country_id', old_value: null, new_value: resolved.id,
            change_type: 'enrich', confidence: 0.88,
            reasoning: `Matched nationality "${nationality}" → "${resolved.name}" (id: ${resolved.id})`,
            rule_id: rule.id,
          })
        }
      }
    }
  }

  return changes
}

export async function processGeoEnricher(
  supabase: SupabaseClient,
  config: ModuleConfig,
  refs: SharedRefs,
  opts: { dryRun: boolean; contentType?: string; contentId?: string; offset?: number },
): Promise<{ scanned: number; changes: ProposedChange[]; errors: number }> {
  const allChanges: ProposedChange[] = []
  let totalScanned = 0, totalErrors = 0

  const contentTypes = opts.contentType
    ? config.module.content_types.filter(ct => ct === opts.contentType)
    : config.module.content_types

  for (const contentType of contentTypes) {
    const ctConfig = CONTENT_TYPE_CONFIG[contentType]
    if (!ctConfig || !GEO_FIELDS[contentType]) continue

    const rulesForType = config.rules.filter(r => r.content_type === contentType)
    if (rulesForType.length === 0) continue

    const items = await fetchBatch(supabase, contentType, config.module.batch_size, {
      contentId: opts.contentId,
      filterUnlinkedGeo: true,
      offset: opts.offset,
    })

    for (const item of items) {
      totalScanned++
      try {
        const name = getContentName(item, ctConfig)
        allChanges.push(...processItem(item, contentType, name, rulesForType, refs))
      } catch (e) {
        console.error(`[geo-enricher] Error processing ${contentType}/${item.id}: ${e}`)
        totalErrors++
      }
    }
  }

  return { scanned: totalScanned, changes: allChanges, errors: totalErrors }
}
