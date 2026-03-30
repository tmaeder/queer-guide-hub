/**
 * Data Normalizer — normalizes emails, whitespace, country names, phone formats.
 * Uses shared COUNTRY_ALIASES from automation-utils.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import {
  fetchBatch, getContentName, CONTENT_TYPE_CONFIG, COUNTRY_ALIASES,
  type ModuleConfig, type SharedRefs, type ProposedChange, type AutomationRule,
} from '../../_shared/automation-utils.ts'

function normalizeEmail(email: string): { value: string; changed: boolean; reason: string } {
  const trimmed = email.trim()
  const lower = trimmed.toLowerCase()
  return lower !== trimmed
    ? { value: lower, changed: true, reason: 'Lowercased email address' }
    : { value: trimmed, changed: false, reason: '' }
}

function normalizeWhitespace(text: string): { value: string; changed: boolean; reason: string } {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  return cleaned !== text
    ? { value: cleaned, changed: true, reason: 'Cleaned excessive whitespace' }
    : { value: text, changed: false, reason: '' }
}

function normalizeCountryName(name: string): { value: string; changed: boolean; reason: string } {
  const lookup = name.trim().toLowerCase()
  const canonical = COUNTRY_ALIASES[lookup]
  return canonical && canonical !== name.trim()
    ? { value: canonical, changed: true, reason: `Standardized country name: "${name.trim()}" → "${canonical}"` }
    : { value: name.trim(), changed: false, reason: '' }
}

function processItem(
  item: Record<string, unknown>, contentType: string, contentName: string, rules: AutomationRule[],
): ProposedChange[] {
  const changes: ProposedChange[] = []
  const contentId = String(item.id)

  for (const rule of rules) {
    if (rule.content_type !== contentType) continue
    const value = item[rule.field_name]
    if (value == null || typeof value !== 'string' || !value.trim()) continue

    const fix = (rule.rule_config as { fix?: string }).fix

    if (rule.rule_type === 'normalize') {
      let result: { value: string; changed: boolean; reason: string }
      switch (fix) {
        case 'lowercase': result = normalizeEmail(value); break
        case 'whitespace': case 'trim': result = normalizeWhitespace(value); break
        case 'country_name': result = normalizeCountryName(value); break
        default: continue
      }
      if (result.changed) {
        changes.push({ content_type: contentType, content_id: contentId, content_name: contentName,
          field_name: rule.field_name, old_value: value, new_value: result.value,
          change_type: 'normalize', confidence: fix === 'country_name' ? 0.95 : 0.99,
          reasoning: result.reason, rule_id: rule.id })
      }
    }

    if (rule.rule_type === 'format') {
      const pattern = (rule.rule_config as { pattern?: string }).pattern
      if (pattern === 'phone') {
        const digitsOnly = value.replace(/[\s\-().+]/g, '')
        if (digitsOnly.length > 0 && (digitsOnly.length < 7 || /[a-zA-Z]/.test(digitsOnly))) {
          changes.push({ content_type: contentType, content_id: contentId, content_name: contentName,
            field_name: rule.field_name, old_value: value, new_value: value,
            change_type: 'flag', confidence: 0.80,
            reasoning: `Potentially invalid phone number: "${value}" (${digitsOnly.length} digits)`, rule_id: rule.id })
        }
      }
    }
  }
  return changes
}

export async function processDataNormalizer(
  supabase: SupabaseClient,
  config: ModuleConfig,
  _refs: SharedRefs,
  opts: { dryRun: boolean; contentType?: string; contentId?: string; offset?: number },
): Promise<{ scanned: number; changes: ProposedChange[]; errors: number }> {
  const allChanges: ProposedChange[] = []
  let totalScanned = 0, totalErrors = 0

  const contentTypes = opts.contentType
    ? config.module.content_types.filter(ct => ct === opts.contentType)
    : config.module.content_types

  for (const contentType of contentTypes) {
    const ctConfig = CONTENT_TYPE_CONFIG[contentType]
    if (!ctConfig) continue
    const rulesForType = config.rules.filter(r => r.content_type === contentType)
    if (rulesForType.length === 0) continue

    const items = await fetchBatch(supabase, contentType, config.module.batch_size, { contentId: opts.contentId, offset: opts.offset })

    for (const item of items) {
      totalScanned++
      try {
        const name = getContentName(item, ctConfig)
        allChanges.push(...processItem(item, contentType, name, rulesForType))
      } catch (e) {
        console.error(`[data-normalizer] Error processing ${contentType}/${item.id}: ${e}`)
        totalErrors++
      }
    }
  }
  return { scanned: totalScanned, changes: allChanges, errors: totalErrors }
}
