/**
 * applyAIResult — shared, validated apply logic for `cms-ai` outputs.
 * Extracted from AIAssistDrawer so the proactive QualityPanel and the manual
 * drawer apply suggestions the same way: respect `aiAssist.writableFields` and
 * re-validate each value through the field's Zod schema before writing.
 */

import { fieldToZod } from '@/lib/cms/zodFromFields';
import type { ContentTypeConfig, AIAssistOp } from '@/types/cms';

export interface ApplyResult {
  /** Number of fields actually written */
  applied: number;
  /** Names of fields written */
  fields: string[];
  /** Set when nothing could be applied */
  error?: string;
}

/**
 * Apply a single field suggestion. Returns false when the field is not in
 * `writableFields` or the value fails the field's Zod schema.
 * This is the per-suggestion path used by QualityPanel's "Fix" button and by
 * quality_review apply-all.
 */
export function applySuggestion(
  config: ContentTypeConfig,
  field: string,
  value: unknown,
  onApply: (field: string, value: unknown) => void,
): boolean {
  if (!field) return false;
  const writable = config.aiAssist?.writableFields ?? [];
  if (writable.length && !writable.includes(field)) return false;
  const fld = config.fields.find((f) => f.name === field);
  if (fld) {
    const parsed = fieldToZod(fld).safeParse(value);
    if (!parsed.success) return false;
  }
  onApply(field, value);
  return true;
}

/**
 * Apply the output of a `cms-ai` operation to the editor via `onApply`.
 * Semantics intentionally mirror the original AIAssistDrawer.apply behaviour
 * per-op (summarize/quality_review enforce writable + Zod; seo_draft/auto_tag/
 * alt_text apply directly as before).
 */
export function applyAIResult(
  config: ContentTypeConfig,
  op: AIAssistOp,
  output: unknown,
  onApply: (field: string, value: unknown) => void,
): ApplyResult {
  const fields: string[] = [];

  if (op === 'summarize') {
    const field = 'excerpt';
    const writable = config.aiAssist?.writableFields ?? [];
    if (writable.length && !writable.includes(field)) {
      return { applied: 0, fields, error: `Field "${field}" is not in writableFields for this type.` };
    }
    const target = config.fields.find((f) => f.name === field);
    if (target) {
      const parsed = fieldToZod(target).safeParse(output);
      if (!parsed.success) {
        return { applied: 0, fields, error: `Validation failed for ${field}: ${parsed.error.message}` };
      }
    }
    onApply(field, output);
    fields.push(field);
  } else if (op === 'alt_text') {
    onApply('image_alt', output);
    fields.push('image_alt');
  } else if (op === 'seo_draft' && output && typeof output === 'object') {
    const o = output as { meta_title?: string; meta_description?: string };
    if (o.meta_title) {
      onApply('meta_title', o.meta_title);
      fields.push('meta_title');
    }
    if (o.meta_description) {
      onApply('meta_description', o.meta_description);
      fields.push('meta_description');
    }
  } else if (op === 'auto_tag' && output && typeof output === 'object') {
    const tags = (output as { tags?: string[] }).tags ?? [];
    onApply('tags', tags);
    fields.push('tags');
  } else if (op === 'quality_review' && output && typeof output === 'object') {
    const suggestions =
      (output as { suggestions?: Array<{ field: string; value: unknown }> }).suggestions ?? [];
    for (const s of suggestions) {
      if (applySuggestion(config, s.field, s.value, onApply)) fields.push(s.field);
    }
    if (fields.length === 0) {
      return { applied: 0, fields, error: 'No suggestions were applicable to writable fields.' };
    }
  }

  return { applied: fields.length, fields };
}

/** Shape of the `quality_review` op output from the `cms-ai` edge function. */
export interface QualityReviewOutput {
  quality_score: number;
  issues: Array<{ field: string; severity: 'low' | 'medium' | 'high'; message: string }>;
  suggestions: Array<{ field: string; value: unknown; why?: string }>;
}
