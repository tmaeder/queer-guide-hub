/**
 * useCMSRevisions - Revision history hook
 * Provides CRUD for revision snapshots, diff computation, and restore.
 */

import { useState, useCallback } from 'react';
import { api } from '@/integrations/api/client';
import type { CMSRevision } from '@/types/cms';

interface UseCMSRevisionsReturn {
  revisions: CMSRevision[];
  loading: boolean;
  error: string | null;
  /** Load revisions for a content item */
  loadRevisions: (sourceTable: string, sourceId: string) => Promise<void>;
  /** Get a single revision by ID */
  getRevision: (revisionId: string) => Promise<CMSRevision | null>;
  /** Restore a revision: overwrite the source table row with revision snapshot */
  restoreRevision: (revision: CMSRevision) => Promise<boolean>;
  /** Compute field-level diff between two revisions */
  diffRevisions: (revA: CMSRevision, revB: CMSRevision) => FieldDiff[];
}

export interface FieldDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  type: 'added' | 'removed' | 'changed' | 'unchanged';
}

export function useCMSRevisions(): UseCMSRevisionsReturn {
  const [revisions, setRevisions] = useState<CMSRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRevisions = useCallback(async (sourceTable: string, sourceId: string) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('cms_revisions' as any)
        .select('*')
        .eq('source_table', sourceTable)
        .eq('source_id', sourceId)
        .order('revision_number', { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;

      // Fetch author info for each revision
      const revisionsWithAuthors = await Promise.all(
        (data || []).map(async (rev: any) => {
          let author;
          if (rev.created_by) {
            const { data: profile } = await supabase
              .from('profiles' as any)
              .select('display_name, email')
              .eq('id', rev.created_by)
              .maybeSingle();
            author = profile ? { display_name: profile.display_name, email: profile.email } : undefined;
          }
          return { ...rev, author } as CMSRevision;
        })
      );

      setRevisions(revisionsWithAuthors);
    } catch (err) {
      console.error('Error loading revisions:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const getRevision = useCallback(async (revisionId: string): Promise<CMSRevision | null> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('cms_revisions' as any)
        .select('*')
        .eq('id', revisionId)
        .single();

      if (fetchError) throw fetchError;
      return data as CMSRevision;
    } catch (err) {
      console.error('Error fetching revision:', err);
      return null;
    }
  }, []);

  const restoreRevision = useCallback(async (revision: CMSRevision): Promise<boolean> => {
    try {
      const snapshot = revision.snapshot;
      if (!snapshot) return false;

      // Strip system fields from snapshot
      const { id, created_at, created_by, ...restoreData } = snapshot as any;
      restoreData.updated_at = new Date().toISOString();

      const { error: updateError } = await supabase
        .from(revision.source_table as any)
        .update(restoreData)
        .eq('id', revision.source_id);

      if (updateError) throw updateError;

      // Create a new revision marking the restore
      const { data: { user } } = await api.auth.getUser();

      const nextNumber = revision.revision_number + 1;
      await supabase
        .from('cms_revisions' as any)
        .insert({
          source_table: revision.source_table,
          source_id: revision.source_id,
          revision_number: nextNumber,
          snapshot: { ...restoreData, id: revision.source_id },
          change_summary: `Restored to revision #${revision.revision_number}`,
          created_by: user?.id,
        });

      return true;
    } catch (err) {
      console.error('Error restoring revision:', err);
      return false;
    }
  }, []);

  const diffRevisions = useCallback((revA: CMSRevision, revB: CMSRevision): FieldDiff[] => {
    const diffs: FieldDiff[] = [];
    const snapshotA = revA.snapshot || {};
    const snapshotB = revB.snapshot || {};

    // All unique keys
    const allKeys = new Set([...Object.keys(snapshotA), ...Object.keys(snapshotB)]);

    // Skip system fields
    const skipFields = new Set(['id', 'created_at', 'updated_at', 'created_by']);

    for (const key of allKeys) {
      if (skipFields.has(key)) continue;

      const oldVal = snapshotA[key];
      const newVal = snapshotB[key];
      const oldJson = JSON.stringify(oldVal);
      const newJson = JSON.stringify(newVal);

      if (oldVal === undefined && newVal !== undefined) {
        diffs.push({ field: key, oldValue: oldVal, newValue: newVal, type: 'added' });
      } else if (oldVal !== undefined && newVal === undefined) {
        diffs.push({ field: key, oldValue: oldVal, newValue: newVal, type: 'removed' });
      } else if (oldJson !== newJson) {
        diffs.push({ field: key, oldValue: oldVal, newValue: newVal, type: 'changed' });
      }
    }

    return diffs;
  }, []);

  return {
    revisions,
    loading,
    error,
    loadRevisions,
    getRevision,
    restoreRevision,
    diffRevisions,
  };
}
