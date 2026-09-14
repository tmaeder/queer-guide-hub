/**
 * Revision history for one content record, with per-field revert.
 *
 * Replaces `useCMSRevisions`, which read `cms_revisions` — a table that held 28
 * rows across seven months and four content types, because it was written
 * client-side, fire-and-forget, by the one editor path. Its `restoreRevision`
 * and `diffRevisions` had zero callers, so the history panel could list a
 * revision but never compare or undo one.
 *
 * `content_revisions` is trigger-written, so it sees machine writes too — most
 * rows here will be crons and enrichment passes. That is why `actor_kind` is
 * part of the row shape rather than a detail: a human edit has to be
 * distinguishable at a glance.
 */

import { useCallback, useState } from 'react';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';

export type RevisionActorKind = 'human' | 'declared' | 'system';

export interface ContentRevision {
  id: string;
  seq: number;
  source_table: string;
  source_id: string;
  op: 'I' | 'U' | 'D';
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  changed_fields: string[];
  actor_kind: RevisionActorKind;
  actor_id: string | null;
  actor: string | null;
  created_at: string;
  /** Joined display name for a human actor, when we could resolve one. */
  author?: { display_name?: string | null; email?: string | null };
}

export interface FieldDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface RevertResult {
  reverted: string[];
  skipped: Array<{ field: string; reason: string; expected?: unknown; live?: unknown }>;
}

/** Field-level diff for one revision. The delta IS the diff — no computation. */
export function revisionDiffs(rev: ContentRevision): FieldDiff[] {
  return rev.changed_fields.map((field) => ({
    field,
    oldValue: rev.before?.[field],
    newValue: rev.after?.[field],
  }));
}

export function useContentRevisions() {
  const [revisions, setRevisions] = useState<ContentRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (sourceTable: string, sourceId: string) => {
    setLoading(true);
    setError(null);
    try {
      // Ordered by `seq`, never `created_at`: now() is transaction time, so
      // every revision written by one statement shares a timestamp and "newest
      // first" over a tie is whatever the planner chose.
      const { data, error: fetchError } = await untypedFrom('content_revisions')
        .select('*')
        .eq('source_table', sourceTable)
        .eq('source_id', sourceId)
        .order('seq', { ascending: false })
        .limit(100);
      if (fetchError) throw fetchError;

      const rows = (data ?? []) as unknown as ContentRevision[];

      // Resolve the humans once, not once per row.
      const humanIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
      let byId = new Map<string, { display_name?: string | null; email?: string | null }>();
      if (humanIds.length > 0) {
        const { data: profiles } = await untypedFrom('profiles')
          .select('user_id, display_name, email')
          .in('user_id', humanIds);
        byId = new Map(
          (
            (profiles ?? []) as Array<{ user_id: string; display_name?: string; email?: string }>
          ).map((p) => [p.user_id, { display_name: p.display_name, email: p.email }]),
        );
      }

      setRevisions(rows.map((r) => (r.actor_id ? { ...r, author: byId.get(r.actor_id) } : r)));
    } catch (err) {
      console.error('Error loading content revisions:', err);
      setError((err as Error).message);
      // An unreadable history must not render as an empty one.
      setRevisions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Put named fields back. The RPC refuses a field whose live value has moved
   * since the revision was recorded and says which — that refusal is surfaced,
   * never swallowed, because it is the whole reason this is safe to offer.
   */
  const revertFields = useCallback(
    async (revisionId: string, fields: string[]): Promise<RevertResult> => {
      const { data, error: rpcError } = await untypedRpc<RevertResult>(
        'content_revision_revert_fields',
        { p_revision_id: revisionId, p_fields: fields },
      );
      if (rpcError) throw rpcError;
      const result = (data ?? {}) as Partial<RevertResult>;
      return { reverted: result.reverted ?? [], skipped: result.skipped ?? [] };
    },
    [],
  );

  return { revisions, loading, error, load, revertFields };
}
