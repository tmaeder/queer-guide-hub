import { Badge } from '@/components/ui/badge';
import { useVillageReviewQueue, type VillageReviewRow } from '@/hooks/useVillageReviewQueue';
import { EntityReviewQueue } from './EntityReviewQueue';

const FIELD_LABEL: Record<string, string> = {
  history: 'History (queer rewrite)',
  description: 'Description',
  editorial_hook: 'Editorial hook',
  notable_landmarks: 'Notable landmarks',
};

function renderValue(r: VillageReviewRow) {
  const value = r.proposed_value?.value;
  if (r.field === 'notable_landmarks' && Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((v, i) => (
          <Badge key={i} variant="secondary" className="font-normal">
            {String(v)}
          </Badge>
        ))}
      </div>
    );
  }
  return <p className="whitespace-pre-wrap text-body">{String(value ?? '')}</p>;
}

/**
 * The Village Truth Engine review gate. Open village_review_queue items — LLM
 * rewrites of history/description/editorial_hook and landmark proposals, each
 * grounded in the village's own Wikipedia page + the venues we list there.
 * Nothing here reaches a public village page until an admin approves.
 */
export function VillageReviewQueue() {
  const { data: rows, isLoading, decide } = useVillageReviewQueue();

  return (
    <EntityReviewQueue<VillageReviewRow>
      title="Review queue — LLM content rewrites"
      description="Every rewrite is grounded in the village's own sources and overwrites existing content, so it lands here for a human. Empty landmark lists may auto-fill at high confidence; nothing else publishes unreviewed."
      rows={rows}
      isLoading={isLoading}
      entityName={(r) => r.queer_villages?.name ?? 'Unknown village'}
      fieldLabel={(r) => FIELD_LABEL[r.field] ?? r.field}
      renderBody={renderValue}
      onDecide={(r, action) => decide.mutateAsync({ id: r.id, action })}
    />
  );
}
