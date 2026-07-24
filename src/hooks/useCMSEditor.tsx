/**
 * useCMSEditor - Core CMS editing hook
 * Handles loading, saving, dirty tracking, conflict detection, and auto-revision.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getContentType } from '@/config/contentTypeRegistry';
import { validateAgainstRegistry } from '@/lib/cms/zodFromFields';
import type { EditorState, CMSContentMetadata, FieldGroup } from '@/types/cms';

interface UseCMSEditorOptions {
  contentType: string;
  itemId: string | null;
  /** Auto-save interval in ms (0 = disabled) */
  autoSaveInterval?: number;
}

interface UseCMSEditorReturn {
  state: EditorState;
  /** Update a single field */
  setField: (name: string, value: unknown) => void;
  /** Update multiple fields at once */
  setFields: (fields: Record<string, unknown>) => void;
  /** Save changes to the database */
  save: () => Promise<boolean>;
  /** Reset form to original data */
  reset: () => void;
  /** Set the active field group tab */
  setActiveGroup: (group: FieldGroup) => void;
  /** Metadata for CMS features */
  metadata: CMSContentMetadata | null;
  /** Update CMS metadata (workflow, SEO, etc.) */
  updateMetadata: (updates: Partial<CMSContentMetadata>) => Promise<void>;
}

export function useCMSEditor({
  contentType,
  itemId,
  autoSaveInterval = 0,
}: UseCMSEditorOptions): UseCMSEditorReturn {
  const { user } = useAuth();
  const config = getContentType(contentType);
  const autoSaveTimer = useRef<ReturnType<typeof setInterval>>();
  const serverUpdatedAt = useRef<string | null>(null);
  // Per-field dirty tracking — updated on every setField/setFields with a
  // single-field compare, replacing full-record JSON.stringify per keystroke.
  // Also the source of the UPDATE delta: only these fields are submitted.
  const dirtyFieldsRef = useRef<Set<string>>(new Set());

  const [state, setState] = useState<EditorState>({
    contentType,
    itemId,
    data: config?.defaults ? { ...config.defaults } : {},
    originalData: {},
    isDirty: false,
    isSaving: false,
    isLoading: !!itemId,
    errors: {},
    activeGroup: config?.fieldGroupOrder?.[0] ?? 'basic',
    metadata: undefined,
  });

  const [metadata, setMetadata] = useState<CMSContentMetadata | null>(null);

  // ── Load content ───────────────────────────────────────────────

  useEffect(() => {
    if (!itemId || !config) return;
    loadContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- config/loadContent derived from contentType, re-run on itemId/contentType change
  }, [itemId, contentType]);

  const loadContent = useCallback(async () => {
    if (!itemId || !config) return;

    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      // Fetch content from source table
      const { data, error } = await supabase
        .from(config.tableName as 'venues')
        .select('*')
        .eq(config.primaryKey, itemId)
        .single();

      if (error) throw error;

      serverUpdatedAt.current = data.updated_at || null;
      dirtyFieldsRef.current = new Set();

      // Fetch CMS metadata if exists
      const { data: meta } = await supabase
        .from('cms_content_metadata' as 'venues')
        .select('*')
        .eq('source_table', config.tableName)
        .eq('source_id', itemId)
        .maybeSingle();

      setMetadata(meta as CMSContentMetadata | null);

      setState((prev) => ({
        ...prev,
        data: { ...data },
        originalData: { ...data },
        isDirty: false,
        isLoading: false,
        errors: {},
        metadata: meta as unknown as CMSContentMetadata | undefined,
      }));
    } catch (error) {
      console.error('Error loading content:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        errors: { _load: 'Failed to load content' },
      }));
    }
  }, [itemId, config]);

  // ── Field updates ──────────────────────────────────────────────

  const setField = useCallback((name: string, value: unknown) => {
    setState((prev) => {
      const newData = { ...prev.data, [name]: value };
      if (JSON.stringify(value) === JSON.stringify(prev.originalData[name])) {
        dirtyFieldsRef.current.delete(name);
      } else {
        dirtyFieldsRef.current.add(name);
      }
      return {
        ...prev,
        data: newData,
        isDirty: dirtyFieldsRef.current.size > 0,
      };
    });
  }, []);

  const setFields = useCallback((fields: Record<string, unknown>) => {
    setState((prev) => {
      const newData = { ...prev.data, ...fields };
      for (const [name, value] of Object.entries(fields)) {
        if (JSON.stringify(value) === JSON.stringify(prev.originalData[name])) {
          dirtyFieldsRef.current.delete(name);
        } else {
          dirtyFieldsRef.current.add(name);
        }
      }
      return {
        ...prev,
        data: newData,
        isDirty: dirtyFieldsRef.current.size > 0,
      };
    });
  }, []);

  // ── Save ───────────────────────────────────────────────────────

  const save = useCallback(async (): Promise<boolean> => {
    if (!config || !user) return false;

    // Run validation — Zod schema (registry-derived) + legacy custom validate
    const errorMap: Record<string, string> = {};
    const zodResult = validateAgainstRegistry(config, state.data);
    if (!zodResult.ok) {
      for (const issue of zodResult.issues) {
        if (!errorMap[issue.field]) errorMap[issue.field] = issue.message;
      }
    }
    if (config.validate) {
      const result = config.validate(state.data);
      if (!result.isValid) {
        result.errors.forEach((e) => {
          errorMap[e.field] = e.message;
        });
      }
    }
    if (Object.keys(errorMap).length > 0) {
      setState((prev) => ({ ...prev, errors: errorMap }));
      return false;
    }

    setState((prev) => ({ ...prev, isSaving: true, errors: {} }));

    try {
      // Prepare data (strip read-only and system fields). UPDATEs submit only
      // the dirty-field delta — smaller payloads, fewer trigger side effects.
      const readOnlyFields = new Set(config.fields.filter((f) => f.readOnly).map((f) => f.name));
      const systemFields = new Set(['id', 'created_at', 'created_by']);
      const saveData: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(state.data)) {
        if (readOnlyFields.has(key) || systemFields.has(key)) continue;
        if (itemId && !dirtyFieldsRef.current.has(key)) continue;
        saveData[key] = value;
      }

      if (itemId && Object.keys(saveData).length === 0) {
        // Nothing editable changed — no write needed.
        setState((prev) => ({ ...prev, isDirty: false, isSaving: false }));
        return true;
      }

      // Add updated_at
      saveData.updated_at = new Date().toISOString();

      let savedId = itemId;
      let serverRow: Record<string, unknown> | null = null;

      if (itemId) {
        // UPDATE with optimistic concurrency: the row must still carry the
        // updated_at we loaded — zero rows back means someone else saved in
        // between (or the row is gone). Replaces the old pre-save SELECT
        // round-trip. Selecting the row back also surfaces any DB-side
        // mutation (e.g. BEFORE triggers like sanitize_website_field).
        let update = supabase
          .from(config.tableName as 'venues')
          .update(saveData)
          .eq(config.primaryKey, itemId);
        if (serverUpdatedAt.current) {
          update = update.eq('updated_at', serverUpdatedAt.current);
        }
        const { data: updatedRows, error } = await update.select('*');

        if (error) throw error;
        if (!updatedRows || updatedRows.length === 0) {
          setState((prev) => ({
            ...prev,
            isSaving: false,
            errors: {
              _conflict: 'This item was modified by someone else. Please reload and try again.',
            },
          }));
          return false;
        }
        serverRow = updatedRows[0] as unknown as Record<string, unknown>;
      } else {
        // INSERT
        if (user) {
          saveData.created_by = user.id;
        }
        const { data: inserted, error } = await supabase
          .from(config.tableName as 'venues')
          .insert(saveData)
          .select('*')
          .single();

        if (error) throw error;
        savedId = (inserted as { id: string }).id;
        serverRow = inserted as unknown as Record<string, unknown>;
      }

      // Detect silently-dropped fields (e.g. sanitize_website_field nulls
      // blocked-domain URLs). Warn the user instead of pretending the save
      // wrote what they typed.
      const droppedFields: string[] = [];
      if (serverRow) {
        for (const [key, submitted] of Object.entries(saveData)) {
          if (key === 'updated_at' || key === 'created_by') continue;
          const server = serverRow[key];
          const wasNonEmpty =
            submitted !== null && submitted !== undefined && submitted !== '';
          const isNullOnServer = server === null || server === undefined;
          if (wasNonEmpty && isNullOnServer) {
            droppedFields.push(key);
          }
        }
      }

      // Bookkeeping (metadata upsert, revision snapshot, audit log) is
      // fire-and-forget: each call swallows its own errors and none of it
      // should sit between the user and the "Saved" state.
      if (savedId) {
        const bookkeepingId = savedId;
        const snapshotData = state.data;
        const snapshotOriginal = state.originalData;
        void (async () => {
          if (!metadata) {
            const { data: newMeta } = await supabase
              .from('cms_content_metadata' as 'venues')
              .upsert(
                {
                  source_table: config.tableName,
                  source_id: bookkeepingId,
                  workflow_state: 'draft',
                  visibility_level: 'public',
                  last_edited_by: user.id,
                  last_edited_at: new Date().toISOString(),
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'source_table,source_id' },
              )
              .select()
              .maybeSingle();

            if (newMeta) setMetadata(newMeta as unknown as CMSContentMetadata);
          }
          await createRevision(config.tableName, bookkeepingId, snapshotData, snapshotOriginal);
          await writeAuditLog(config.tableName, bookkeepingId, itemId ? 'update' : 'create', user.id);
        })();
      }

      // Update server timestamp from the row we got back, falling back
      // to what we sent if the select didn't return updated_at.
      const serverUpdatedAtNext =
        (serverRow?.updated_at as string | undefined) ??
        (saveData.updated_at as string);
      serverUpdatedAt.current = serverUpdatedAtNext;

      // Reconcile UI with what the database actually stored. If a BEFORE
      // trigger silently rewrote a field, the user must see that.
      const reconciledData = serverRow ? { ...serverRow } : { ...state.data };

      const dropErrors: Record<string, string> = {};
      if (droppedFields.length > 0) {
        for (const f of droppedFields) {
          dropErrors[f] = 'Value was rejected by the server (e.g. blocked URL) and not saved';
        }
        dropErrors._save = `These fields were not saved: ${droppedFields.join(', ')}`;
      }

      dirtyFieldsRef.current = new Set();
      setState((prev) => ({
        ...prev,
        itemId: savedId,
        data: reconciledData,
        originalData: { ...reconciledData },
        isDirty: false,
        isSaving: false,
        errors: dropErrors,
      }));

      return droppedFields.length === 0;
    } catch (error) {
      console.error('Error saving content:', error);
      setState((prev) => ({
        ...prev,
        isSaving: false,
        errors: { _save: `Failed to save: ${(error as Error).message}` },
      }));
      return false;
    }
  }, [config, state.data, state.originalData, itemId, user, metadata]);

  // ── Reset ──────────────────────────────────────────────────────

  const reset = useCallback(() => {
    dirtyFieldsRef.current = new Set();
    setState((prev) => ({
      ...prev,
      data: { ...prev.originalData },
      isDirty: false,
      errors: {},
    }));
  }, []);

  // ── Group navigation ───────────────────────────────────────────

  const setActiveGroup = useCallback((group: FieldGroup) => {
    setState((prev) => ({ ...prev, activeGroup: group }));
  }, []);

  // ── Metadata management ────────────────────────────────────────

  const updateMetadata = useCallback(
    async (updates: Partial<CMSContentMetadata>) => {
      if (!itemId || !config) return;

      try {
        const metaData = {
          source_table: config.tableName,
          source_id: itemId,
          ...updates,
          last_edited_by: user?.id,
          last_edited_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (metadata) {
          // Update existing
          const { data, error } = await supabase
            .from('cms_content_metadata' as 'venues')
            .update(metaData)
            .eq('id', metadata.id)
            .select()
            .single();

          if (error) throw error;
          setMetadata(data as unknown as CMSContentMetadata);
        } else {
          // Insert new
          const { data, error } = await supabase
            .from('cms_content_metadata' as 'venues')
            .insert({
              ...metaData,
              created_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (error) throw error;
          setMetadata(data as unknown as CMSContentMetadata);
        }
      } catch (error) {
        console.error('Error updating metadata:', error);
      }
    },
    [itemId, config, metadata, user],
  );

  // ── Auto-save ──────────────────────────────────────────────────

  useEffect(() => {
    if (autoSaveInterval <= 0 || !state.isDirty) return;

    autoSaveTimer.current = setInterval(() => {
      if (state.isDirty && !state.isSaving) {
        save();
      }
    }, autoSaveInterval);

    return () => {
      if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
    };
  }, [autoSaveInterval, state.isDirty, state.isSaving, save]);

  return {
    state,
    setField,
    setFields,
    save,
    reset,
    setActiveGroup,
    metadata,
    updateMetadata,
  };
}

// ── Internal helpers ───────────────────────────────────────────────

async function createRevision(
  sourceTable: string,
  sourceId: string,
  currentData: Record<string, unknown>,
  previousData: Record<string, unknown>,
) {
  try {
    // Get next revision number
    const { data: lastRevision } = await supabase
      .from('cms_revisions' as 'venues')
      .select('revision_number')
      .eq('source_table', sourceTable)
      .eq('source_id', sourceId)
      .order('revision_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextNumber = (lastRevision?.revision_number ?? 0) + 1;

    // Compute changes
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    for (const key of Object.keys(currentData)) {
      if (JSON.stringify(currentData[key]) !== JSON.stringify(previousData[key])) {
        changes[key] = { old: previousData[key], new: currentData[key] };
      }
    }

    const changedFields = Object.keys(changes);
    const summary =
      changedFields.length > 0
        ? `Updated ${changedFields.slice(0, 3).join(', ')}${changedFields.length > 3 ? ` and ${changedFields.length - 3} more` : ''}`
        : 'No changes';

    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from('cms_revisions' as 'venues').insert({
      source_table: sourceTable,
      source_id: sourceId,
      revision_number: nextNumber,
      snapshot: currentData,
      changes,
      change_summary: summary,
      created_by: user?.id,
    });
  } catch (error) {
    console.error('Error creating revision:', error);
  }
}

async function writeAuditLog(
  sourceTable: string,
  sourceId: string,
  action: string,
  actorId: string,
) {
  // supabase-js does not throw on non-2xx responses; check {error} explicitly
  // so we fail quietly without spamming the console for known RLS denials.
  const { error } = await supabase.from('cms_audit_log' as 'venues').insert({
    source_table: sourceTable,
    source_id: sourceId,
    action,
    actor_id: actorId,
    timestamp: new Date().toISOString(),
  });
  if (error) {
    console.warn('cms_audit_log insert skipped:', error.message);
  }
}
