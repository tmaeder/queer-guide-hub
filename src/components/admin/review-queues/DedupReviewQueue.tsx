import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';
import { useDedupReviewQueue, type DedupReviewRow } from '@/hooks/useDedupReview';
import { EntityReviewQueue } from './EntityReviewQueue';

/**
 * The Dedup Truth Engine review gate. The nightly sweep queues ambiguous
 * duplicate pairs here (exact-identity pairs auto-merge); approving runs the
 * reversible merge cores. Personality pairs are namesake-risky and always
 * confirm-gated — a wrong person-merge can out someone.
 */
export function DedupReviewQueue({ entityType }: { entityType?: string }) {
  const { data: rows, isLoading, decide, batchApproveSafe } = useDedupReviewQueue(entityType);
  // Per-row canonical override (swap which member survives the merge).
  const [keepChoice, setKeepChoice] = useState<Record<string, string>>({});

  const safeCount = (rows ?? []).filter(
    (r) => (r.confidence ?? 0) >= 0.95 && r.entity_type !== 'personality',
  ).length;

  const members = (r: DedupReviewRow) => {
    const keep = keepChoice[r.id] ?? r.keep_id;
    return [
      { id: r.keep_id, title: r.cluster?.keep?.title ?? r.keep_id },
      { id: r.drop_id, title: r.cluster?.drop?.title ?? r.drop_id },
    ].map((m) => ({ ...m, isKeep: m.id === keep }));
  };

  return (
    <EntityReviewQueue<DedupReviewRow>
      title="Suggested merges"
      description="Duplicate pairs the nightly sweep could not merge automatically. Pick the canonical record and approve — merges are reversible and audited."
      rows={rows}
      isLoading={isLoading}
      entityName={(r) =>
        `${r.cluster?.keep?.title ?? '?'} ⇄ ${r.cluster?.drop?.title ?? '?'}`
      }
      fieldLabel={(r) => (entityType ? null : r.entity_type)}
      headerExtras={(r) => (
        <>
          <Badge variant="outline" className="font-normal">
            {r.reason}
          </Badge>
          {r.cluster?.distance_m != null && (
            <Badge variant="outline" className="font-normal">
              {Math.round(r.cluster.distance_m)} m apart
            </Badge>
          )}
        </>
      )}
      renderBody={(r) => (
        <div className="flex flex-col gap-1">
          {members(r).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setKeepChoice((p) => ({ ...p, [r.id]: m.id }))}
              className={`rounded-element flex items-center gap-2 p-2 text-left ${m.isKeep ? 'bg-accent' : 'hover:bg-muted'}`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full border ${m.isKeep ? 'bg-foreground' : ''}`}
              >
                {m.isKeep && <Check size={12} className="text-background" />}
              </span>
              <span className="font-medium">{m.title}</span>
              {m.isKeep && <Badge variant="default">canonical</Badge>}
            </button>
          ))}
        </div>
      )}
      approveLabel="Merge"
      rejectLabel="Not a duplicate"
      approveGuard={(r) =>
        r.entity_type === 'personality'
          ? 'Merging two personalities is irreversible for links shared in the meantime and namesakes are common. Are you sure these are the same person?'
          : null
      }
      decideSuccess={(action) =>
        action === 'approve' ? 'Merged — reversible via the merge audit' : 'Rejected — pair will not be suggested again'
      }
      onDecide={(r, action) =>
        decide.mutateAsync({ id: r.id, action, keepId: keepChoice[r.id] })
      }
      batch={{
        count: safeCount,
        label: (n) => `Merge safe (${n})`,
        run: () => batchApproveSafe.mutateAsync(0.95),
        successMessage: (n) => `Merged ${n} safe ${n === 1 ? 'pair' : 'pairs'}`,
      }}
    />
  );
}
