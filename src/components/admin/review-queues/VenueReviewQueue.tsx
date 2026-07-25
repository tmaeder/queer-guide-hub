import { Badge } from '@/components/ui/badge';
import { useVenueReviewQueue, type VenueReviewRow } from '@/hooks/useVenueReviewQueue';
import { EntityReviewQueue } from './EntityReviewQueue';

const FIELD_LABEL: Record<string, string> = {
  accessibility_attributes: 'Accessibility features',
  accessibility_notes: 'Accessibility notes',
  amenities: 'Amenities',
};

function renderValue(r: VenueReviewRow) {
  const value = r.proposed_value?.value;
  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((v, i) => (
          <Badge key={i} variant="outline" className="font-normal">
            {String(v)}
          </Badge>
        ))}
      </div>
    );
  }
  return <span className="text-body">{String(value ?? '')}</span>;
}

/**
 * The Amenity Truth Engine safety gate. LLM-proposed accessibility features /
 * notes are never written to a venue until an admin approves here — a wrong
 * accessibility claim is a real-world harm.
 */
export function VenueReviewQueue() {
  const { data: rows, isLoading, decide, batchApproveSafe } = useVenueReviewQueue();

  const safeCount = (rows ?? []).filter(
    (r) => (r.confidence ?? 0) >= 0.8 && (r.citations ?? []).length > 0,
  ).length;

  return (
    <EntityReviewQueue<VenueReviewRow>
      title="Review queue — accessibility claims"
      description="LLM-proposed accessibility features and notes. These are never applied to a venue until approved here."
      rows={rows}
      isLoading={isLoading}
      entityName={(r) => r.venues?.name ?? 'Unknown venue'}
      fieldLabel={(r) => FIELD_LABEL[r.field] ?? r.field}
      renderBody={renderValue}
      decideSuccess={(action) => (action === 'approve' ? 'Approved — applied to venue' : 'Rejected')}
      onDecide={(r, action) => decide.mutateAsync({ id: r.id, action })}
      batch={{
        count: safeCount,
        label: (n) => `Approve safe (${n})`,
        run: () => batchApproveSafe.mutateAsync(0.8),
        successMessage: (n) => `Approved ${n} safe ${n === 1 ? 'claim' : 'claims'}`,
      }}
    />
  );
}
