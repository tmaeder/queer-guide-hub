import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getContentType } from '@/config/contentTypes';
import { isWebsiteField, matchBlockedDomain } from '@/lib/sanitizeWebsiteBlocklist';
import type { FieldConfig } from '@/types/cms';

interface SaveArgs {
  field: FieldConfig;
  value: unknown;
}

interface SaveResult {
  success: boolean;
  error?: string;
}

/**
 * Per-field inline save for any registered content type.
 *
 * - Validates the value against the FieldConfig (required, length, range).
 * - Preflights the `sanitize_website_field` Postgres trigger so a URL
 *   on the blocklist fails loudly in the UI instead of silently NULL.
 * - Writes directly to the source table (RLS gates the admin role).
 *
 * The audit trail is NOT written here. This used to insert into
 * `admin_edit_log` inside a bare `catch {}`, and that table held 0 rows for
 * its entire life: RLS was enabled with a SELECT-only policy and no INSERT
 * policy, so every write was denied and the denial swallowed. The alt-click
 * inline edit — the path an admin actually uses on a public page — recorded
 * nothing, and nothing said so. A database trigger writes the trail now.
 */
export function useInlineSave(contentType: string, recordId: string) {
  const [saving, setSaving] = useState(false);
  const config = getContentType(contentType);

  const save = useCallback(
    async ({ field, value }: SaveArgs): Promise<SaveResult> => {
      if (!config) return { success: false, error: `Unknown content type: ${contentType}` };
      if (field.readOnly) return { success: false, error: 'Field is read-only' };
      // Defence in depth behind Editable's guard: a virtual field has no column,
      // so this would UPDATE a name PostgREST does not know.
      if (field.virtual) return { success: false, error: 'Field is not stored on this table' };

      const validation = validateValue(field, value);
      if (!validation.ok) {
        toast.error(validation.error);
        return { success: false, error: validation.error };
      }

      const normalized = normalizeValue(field, value);

      if (isWebsiteField(config.tableName, field.name) && typeof normalized === 'string') {
        const blocked = matchBlockedDomain(normalized, config.tableName);
        if (blocked) {
          const msg = `URL would be removed server-side (blocklisted: ${blocked}). Use a different source.`;
          toast.error(msg);
          return { success: false, error: msg };
        }
      }

      setSaving(true);
      try {
        const table = config.tableName as 'venues';
        // No pre-save SELECT: it existed only to fill the audit row that was
        // never actually written, so it was a round-trip per keystroke-save
        // for nothing. The trigger captures the before-image server-side,
        // where it cannot race with a concurrent write.
        const { data: after, error } = await supabase
          .from(table)
          .update({ [field.name]: normalized })
          .eq('id', recordId)
          .select()
          .maybeSingle();

        if (error) {
          toast.error(`Save failed: ${error.message}`);
          return { success: false, error: error.message };
        }

        // Detect silent trigger blanking (defensive: blocklist preflight
        // should already catch this for URL fields, but other BEFORE
        // triggers may also null things).
        const persisted = (after as Record<string, unknown> | null)?.[field.name];
        if (normalized != null && normalized !== '' && (persisted == null || persisted === '')) {
          toast.error(
            'Server rejected the value silently (a trigger nulled it). Check format / blocklist.',
          );
          return { success: false, error: 'Silent server rejection' };
        }

        toast.success(`Saved ${field.label}`);
        return { success: true };
      } finally {
        setSaving(false);
      }
    },
    [config, contentType, recordId],
  );

  return { save, saving };
}

function validateValue(
  field: FieldConfig,
  value: unknown,
): { ok: true } | { ok: false; error: string } {
  const isEmpty =
    value == null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0);

  if (field.required && isEmpty) {
    return { ok: false, error: `${field.label} is required` };
  }

  if (typeof value === 'string') {
    if (field.minLength && value.length < field.minLength) {
      return { ok: false, error: `${field.label} must be at least ${field.minLength} chars` };
    }
    if (field.maxLength && value.length > field.maxLength) {
      return { ok: false, error: `${field.label} must be at most ${field.maxLength} chars` };
    }
  }

  if (typeof value === 'number') {
    if (field.min != null && value < field.min) {
      return { ok: false, error: `${field.label} must be ≥ ${field.min}` };
    }
    if (field.max != null && value > field.max) {
      return { ok: false, error: `${field.label} must be ≤ ${field.max}` };
    }
  }

  return { ok: true };
}

function normalizeValue(field: FieldConfig, value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    return trimmed;
  }
  return value;
}
