/**
 * useCMSAudit - Audit log hook
 * Writes and reads audit trail entries for all CMS operations.
 */

import { useState, useCallback } from 'react';
import { api } from '@/integrations/api/client';
import type { CMSAuditEntry } from '@/types/cms';

interface UseCMSAuditReturn {
  entries: CMSAuditEntry[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  /** Load audit entries for a specific content item */
  loadForContent: (sourceTable: string, sourceId: string) => Promise<void>;
  /** Load global audit entries (all content) */
  loadGlobal: (options?: { page?: number; pageSize?: number; action?: string }) => Promise<void>;
  /** Write an audit entry */
  writeEntry: (entry: {
    sourceTable: string;
    sourceId: string;
    action: string;
    changes?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
}

export function useCMSAudit(): UseCMSAuditReturn {
  const [entries, setEntries] = useState<CMSAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const loadForContent = useCallback(async (sourceTable: string, sourceId: string) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await api
        .from('cms_audit_log' as any)
        .select('*')
        .eq('source_table', sourceTable)
        .eq('source_id', sourceId)
        .order('timestamp', { ascending: false })
        .limit(100);

      if (fetchError) throw fetchError;

      // Resolve actor info
      const enriched = await enrichWithActors(data || []);
      setEntries(enriched);
      setTotalCount(enriched.length);
    } catch (err) {
      console.error('Error loading audit entries:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGlobal = useCallback(async (options?: { page?: number; pageSize?: number; action?: string }) => {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    setLoading(true);
    setError(null);

    try {
      let query = api
        .from('cms_audit_log' as any)
        .select('*', { count: 'exact' })
        .order('timestamp', { ascending: false })
        .range(from, to);

      if (options?.action) {
        query = query.eq('action', options.action);
      }

      const { data, error: fetchError, count } = await query;

      if (fetchError) throw fetchError;

      const enriched = await enrichWithActors(data || []);
      setEntries(enriched);
      setTotalCount(count ?? 0);
    } catch (err) {
      console.error('Error loading global audit entries:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const writeEntry = useCallback(async (entry: {
    sourceTable: string;
    sourceId: string;
    action: string;
    changes?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) => {
    try {
      const { data: { user } } = await api.auth.getUser();

      await api
        .from('cms_audit_log' as any)
        .insert({
          source_table: entry.sourceTable,
          source_id: entry.sourceId,
          action: entry.action,
          actor_id: user?.id,
          changes: entry.changes,
          metadata: entry.metadata,
          timestamp: new Date().toISOString(),
        });
    } catch (err) {
      console.error('Error writing audit entry:', err);
    }
  }, []);

  return {
    entries,
    loading,
    error,
    totalCount,
    loadForContent,
    loadGlobal,
    writeEntry,
  };
}

// ── Helpers ────────────────────────────────────────────────────────

async function enrichWithActors(entries: any[]): Promise<CMSAuditEntry[]> {
  const actorIds = [...new Set(entries.filter(e => e.actor_id).map(e => e.actor_id))];

  if (actorIds.length === 0) return entries as CMSAuditEntry[];

  const { data: profiles } = await api
    .from('profiles' as any)
    .select('id, display_name, email')
    .in('id', actorIds);

  const profileMap = new Map(
    (profiles || []).map((p: any) => [p.id, { display_name: p.display_name, email: p.email }])
  );

  return entries.map(entry => ({
    ...entry,
    actor: entry.actor_id ? profileMap.get(entry.actor_id) : undefined,
  })) as CMSAuditEntry[];
}
