/**
 * useCMSEditor - Core CMS editing hook
 * Handles loading, saving, dirty tracking, conflict detection, and auto-revision.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/integrations/api/client';
import { useAuth } from '@/hooks/useAuth';
import { getContentType } from '@/config/contentTypeRegistry';
import type { EditorState, CMSContentMetadata, WorkflowState, FieldGroup } from '@/types/cms';

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
  }, [itemId, contentType]);

  const loadContent = useCallback(async () => {
    if (!itemId || !config) return;

    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      // Fetch content from source table
      const { data, error } = await api
        .from(config.tableName as any)
        .select('*')
        .eq(config.primaryKey, itemId)
        .single();

      if (error) throw error;

      serverUpdatedAt.current = data.updated_at || null;

      // Fetch CMS metadata if exists
      const { data: meta } = await api
        .from('cms_content_metadata' as any)
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
        metadata: meta as CMSContentMetadata | undefined,
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
      return {
        ...prev,
        data: newData,
        isDirty: JSON.stringify(newData) !== JSON.stringify(prev.originalData),
      };
    });
  }, []);

  const setFields = useCallback((fields: Record<string, unknown>) => {
    setState((prev) => {
      const newData = { ...prev.data, ...fields };
      return {
        ...prev,
        data: newData,
        isDirty: JSON.stringify(newData) !== JSON.stringify(prev.originalData),
      };
    });
  }, []);

  // ── Save ───────────────────────────────────────────────────────

  const save = useCallback(async (): Promise<boolean> => {
    if (!config || !user) return false;

    // Run validation
    if (config.validate) {
      const result = config.validate(state.data);
      if (!result.isValid) {
        const errorMap: Record<string, string> = {};
        result.errors.forEach((e) => {
          errorMap[e.field] = e.message;
        });
        setState((prev) => ({ ...prev, errors: errorMap }));
        return false;
      }
    }

    setState((prev) => ({ ...prev, isSaving: true, errors: {} }));

    try {
      // Conflict detection: check updated_at hasn't changed
      if (itemId && serverUpdatedAt.current) {
        const { data: current } = await api
          .from(config.tableName as any)
          .select('updated_at')
          .eq(config.primaryKey, itemId)
          .single();

        if (current?.updated_at && current.updated_at !== serverUpdatedAt.current) {
          setState((prev) => ({
            ...prev,
            isSaving: false,
            errors: {
              _conflict: 'This item was modified by someone else. Please reload and try again.',
            },
          }));
          return false;
        }
      }

      // Prepare data (strip read-only and system fields)
      const readOnlyFields = new Set(config.fields.filter((f) => f.readOnly).map((f) => f.name));
      const systemFields = new Set(['id', 'created_at', 'created_by']);
      const saveData: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(state.data)) {
        if (!readOnlyFields.has(key) && !systemFields.has(key)) {
          saveData[key] = value;
        }
      }

      // Add updated_at
      saveData.updated_at = new Date().toISOString();

      let savedId = itemId;

      if (itemId) {
        // UPDATE
        const { error } = await api
          .from(config.tableName as any)
          .update(saveData)
          .eq(config.primaryKey, itemId);

        if (error) throw error;
      } else {
        // INSERT
        if (user) {
          saveData.created_by = user.id;
        }
        const { data: inserted, error } = await api
          .from(config.tableName as any)
          .insert(saveData)
          .select('id')
          .single();

        if (error) throw error;
        savedId = inserted.id;
      }

      // Ensure cms_content_metadata exists for ALL content types (workflow support)
      if (savedId && !metadata) {
        const { data: newMeta } = await api
          .from('cms_content_metadata' as any)
          .upsert(
            {
              source_table: config.tableName,
              source_id: savedId,
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

        if (newMeta) setMetadata(newMeta as CMSContentMetadata);
      }

      // Create revision snapshot
      if (savedId) {
        await createRevision(config.tableName, savedId, state.data, state.originalData);
      }

      // Write audit log
      if (savedId) {
        await writeAuditLog(config.tableName, savedId, itemId ? 'update' : 'create', user.id);
      }

      // Update server timestamp
      serverUpdatedAt.current = saveData.updated_at as string;

      setState((prev) => ({
        ...prev,
        itemId: savedId,
        originalData: { ...prev.data },
        isDirty: false,
        isSaving: false,
      }));

      return true;
    } catch (error) {
      console.error('Error saving content:', error);
      setState((prev) => ({
        ...prev,
        isSaving: false,
        errors: { _save: `Failed to save: ${(error as Error).message}` },
      }));
      return false;
    }
  }, [config, state.data, state.originalData, itemId, user]);

  // ── Reset ──────────────────────────────────────────────────────

  const reset = useCallback(() => {
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
          const { data, error } = await api
            .from('cms_content_metadata' as any)
            .update(metaData)
            .eq('id', metadata.id)
            .select()
            .single();

          if (error) throw error;
          setMetadata(data as CMSContentMetadata);
        } else {
          // Insert new
          const { data, error } = await api
            .from('cms_content_metadata' as any)
            .insert({
              ...metaData,
              created_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (error) throw error;
          setMetadata(data as CMSContentMetadata);
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
    const { data: lastRevision } = await api
      .from('cms_revisions' as any)
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
    } = await api.auth.getUser();

    await api.from('cms_revisions' as any).insert({
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
  try {
    await api.from('cms_audit_log' as any).insert({
      source_table: sourceTable,
      source_id: sourceId,
      action,
      actor_id: actorId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error writing audit log:', error);
  }
}
