/**
 * Content Validator — checks required fields, min-length, encoding issues,
 * placeholder text, whitespace normalization.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import {
  fetchBatch, getContentName, CONTENT_TYPE_CONFIG,
  type ModuleConfig, type SharedRefs, type ProposedChange, type AutomationRule,
} from '../../_shared/automation-utils.ts'

const HTML_ENTITY_RE = /&(?:amp|lt|gt|quot|apos|#\d{2,4}|#x[0-9a-fA-F]{2,4});/
const MOJIBAKE_RE = /[\u00C3][\u0080-\u00BF]|\u00C3[\u0080-\u00BF]|\u00E2\u0080[\u0099\u201C\u201D\u007C\u02DC\u0153\u009C\u009D]/

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

function processItem(
  item: Record<string, unknown>, contentType: string, contentName: string, rules: AutomationRule[],
): ProposedChange[] {
  const changes: ProposedChange[] = []
  const contentId = String(item.id)

  for (const rule of rules) {
    if (rule.content_type !== contentType) continue
    const value = item[rule.field_name]
    const strValue = value != null ? String(value) : ''

    switch (rule.rule_type) {
      case 'required':
        if (!strValue.trim()) {
          changes.push({ content_type: contentType, content_id: contentId, content_name: contentName,
            field_name: rule.field_name, old_value: value ?? null, new_value: value ?? null,
            change_type: 'flag', confidence: 1.0, reasoning: `${rule.field_name} is empty or missing`, rule_id: rule.id })
        }
        break

      case 'length': {
        const minLen = (rule.rule_config as { min?: number }).min ?? 0
        if (strValue.trim() && strValue.trim().length < minLen) {
          changes.push({ content_type: contentType, content_id: contentId, content_name: contentName,
            field_name: rule.field_name, old_value: strValue, new_value: strValue,
            change_type: 'flag', confidence: 0.80, reasoning: `${rule.field_name} is only ${strValue.trim().length} chars (min: ${minLen})`, rule_id: rule.id })
        }
        break
      }

      case 'sanitize': {
        const fix = (rule.rule_config as { fix?: string }).fix
        if (!strValue.trim()) break
        if (fix === 'html_entities' && HTML_ENTITY_RE.test(strValue)) {
          const cleaned = decodeHtmlEntities(strValue)
          if (cleaned !== strValue) {
            changes.push({ content_type: contentType, content_id: contentId, content_name: contentName,
              field_name: rule.field_name, old_value: strValue, new_value: cleaned,
              change_type: 'sanitize', confidence: 0.98, reasoning: 'Decoded HTML entities in plain text field', rule_id: rule.id })
          }
        }
        if (fix === 'encoding' && MOJIBAKE_RE.test(strValue)) {
          changes.push({ content_type: contentType, content_id: contentId, content_name: contentName,
            field_name: rule.field_name, old_value: strValue, new_value: strValue,
            change_type: 'flag', confidence: 0.90, reasoning: 'Detected potential mojibake/double-encoding', rule_id: rule.id })
        }
        break
      }

      case 'regex': {
        const cfg = rule.rule_config as { pattern?: string; flag?: boolean }
        if (!strValue.trim() || !cfg.pattern) break
        const re = new RegExp(cfg.pattern, 'i')
        if (re.test(strValue)) {
          changes.push({ content_type: contentType, content_id: contentId, content_name: contentName,
            field_name: rule.field_name, old_value: strValue, new_value: strValue,
            change_type: cfg.flag ? 'flag' : 'sanitize', confidence: 0.85, reasoning: `Matched pattern: ${cfg.pattern}`, rule_id: rule.id })
        }
        break
      }

      case 'normalize': {
        const fix = (rule.rule_config as { fix?: string }).fix
        if (!strValue.trim()) break
        if (fix === 'trim' || fix === 'whitespace') {
          const cleaned = strValue.replace(/\s+/g, ' ').trim()
          if (cleaned !== strValue) {
            changes.push({ content_type: contentType, content_id: contentId, content_name: contentName,
              field_name: rule.field_name, old_value: strValue, new_value: cleaned,
              change_type: 'normalize', confidence: 0.99, reasoning: 'Cleaned excessive whitespace', rule_id: rule.id })
          }
        }
        break
      }
    }
  }
  return changes
}

export async function processContentValidator(
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
        console.error(`[content-validator] Error processing ${contentType}/${item.id}: ${e}`)
        totalErrors++
      }
    }
  }
  return { scanned: totalScanned, changes: allChanges, errors: totalErrors }
}
