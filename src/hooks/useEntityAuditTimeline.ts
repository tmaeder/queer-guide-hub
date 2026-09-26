/**
 * Item-level audit timeline — every automated decision that shaped one record.
 *
 * Reads `entity_audit_timeline()`, which unions content_revisions, the review
 * queue, field provenance, enrichment steps, the quality-signal ledgers, the
 * merge audits, the ingest path and the consensus ledgers into one shape.
 *
 * WHY `untypedRpc`. `content_revisions`, `pipeline_explanations` and
 * `audit_entity_registry` are all absent from the generated
 * src/integrations/supabase/types.ts — the generator has not been re-run since
 * those migrations. useContentRevisions already reads its table the same way,
 * so this is the established route for this family rather than a shortcut.
 *
 * THE ONE RULE THIS FILE EXISTS TO HOLD: an unregistered explanation key is
 * rendered as the RAW KEY, never as prose derived from it. Do not add a
 * `title ?? prettify(key)` fallback here or in the component. A prettified key
 * looks like content, which makes a missing explanation indistinguishable from
 * a written one — the exact defect the explanation registry was built to
 * remove, reintroduced one layer up.
 */

import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';

export type AuditEventKind =
  | 'revision'
  | 'review_proposal'
  | 'review_decision'
  | 'provenance'
  | 'enrichment_step'
  | 'quality_signal'
  | 'merge'
  | 'staging_stage'
  | 'consensus'
  | 'gap';

export type AuditActorKind = 'human' | 'declared' | 'system' | 'unknown';

/** Three-valued on purpose — see the note above and the RPC's own comment. */
export type ExplanationStatus = 'registered' | 'unregistered' | 'not_applicable';

export type AuditSeverity = 'info' | 'warning' | 'blocking';

export interface AuditEvent {
  row_no: number;
  /** 0 = coverage gap (pinned), 1 = dated event, 2 = undated current state. */
  sort_bucket: 0 | 1 | 2;
  occurred_at: string | null;
  /**
   * True when occurred_at is a transaction timestamp, so a cluster sharing one
   * second is NOT an ordering. The renderer must not present it as one.
   */
  occurred_at_is_tx: boolean;
  /** Real sequence only for revisions and ingest events; null elsewhere. */
  source_seq: number | null;
  kind: AuditEventKind;
  actor_kind: AuditActorKind;
  actor_label: string | null;
  field: string | null;
  before_value: unknown;
  after_value: unknown;
  confidence: number | null;
  source: string | null;
  explanation_key: string | null;
  explanation_status: ExplanationStatus;
  explanation_title: string | null;
  explanation_body: string | null;
  explanation_what_now: string | null;
  explanation_severity: AuditSeverity | null;
  source_ref: { table?: string; pk?: string | number } | null;
  raw: unknown;
}

export function useEntityAuditTimeline(
  entityType: string | null | undefined,
  entityId: string | null | undefined,
  limit = 200,
) {
  const query = useQuery({
    queryKey: ['entity-audit-timeline', entityType, entityId, limit],
    enabled: Boolean(entityType && entityId),
    staleTime: 60_000,
    queryFn: async (): Promise<AuditEvent[]> => {
      const { data, error } = await untypedRpc('entity_audit_timeline', {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_limit: limit,
      });
      // THROWN, never swallowed into an empty array. The RPC raises 22023 for
      // an unregistered entity type and 42501 for a caller without the role;
      // both of those are facts the reader needs, and returning [] would
      // render each of them as "nothing ever happened to this record".
      if (error) throw new Error(error.message);
      return (data as AuditEvent[]) ?? [];
    },
  });

  const events = query.data ?? [];
  return {
    events,
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    gaps: events.filter((e) => e.sort_bucket === 0),
    dated: events.filter((e) => e.sort_bucket === 1),
    current: events.filter((e) => e.sort_bucket === 2),
    unexplained: events.filter((e) => e.explanation_status === 'unregistered'),
    reload: query.refetch,
  };
}
