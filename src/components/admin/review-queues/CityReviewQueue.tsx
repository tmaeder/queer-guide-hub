import { Badge } from '@/components/ui/badge';
import { Star, Lock } from 'lucide-react';
import {
  useCityReviewQueue,
  isCriminalizingTier,
  type CityReviewRow,
} from '@/hooks/useCityReviewQueue';
import { EntityReviewQueue } from './EntityReviewQueue';

const FIELD_LABEL: Record<string, string> = {
  lgbt_friendly_rating: 'LGBTQ+ friendly rating',
  safety_notes: 'Safety notes',
  editorial_hook: 'Editorial hook',
};

const TIER_LABEL: Record<string, string> = {
  low: 'Low risk',
  moderate: 'Moderate',
  high: 'Criminalized',
  critical: 'Critical',
};

function renderValue(r: CityReviewRow) {
  const value = r.proposed_value?.value;
  if (r.field === 'lgbt_friendly_rating') {
    const n = Number(value);
    return (
      <span className="inline-flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={14}
            className={i < n ? 'fill-foreground text-foreground' : 'text-muted-foreground'}
          />
        ))}
        <span className="ml-1 tabular-nums text-13 text-muted-foreground">{n}/5</span>
      </span>
    );
  }
  return <span className="text-body">{String(value ?? '')}</span>;
}

/**
 * The City Truth Engine safety gate. Open city_review_queue items
 * (lgbt_friendly_rating / safety_notes / editorial_hook proposed by the LLM)
 * with their citations. Nothing here is public until an admin approves.
 * Outing-safety invariant: approving a criminalizing-tier row requires
 * explicit confirmation (approveGuard) — mirrored by approve_city_review's
 * p_confirm server check.
 */
export function CityReviewQueue() {
  const { data: rows, isLoading, decide, batchApproveSafe } = useCityReviewQueue();

  const safeCount = (rows ?? []).filter(
    (r) => r.field === 'safety_notes' && r.proposed_value?.risk_tier === 'low',
  ).length;

  return (
    <EntityReviewQueue<CityReviewRow>
      title="Review queue — safety-sensitive fields"
      description="Ratings and hooks are LLM-proposed; safety notes are composed from country legal status + city LGBTQ+ density. Low-risk destinations auto-publish — only criminalizing or moderate ones land here."
      rows={rows}
      isLoading={isLoading}
      entityName={(r) => r.cities?.name ?? 'Unknown city'}
      fieldLabel={(r) => FIELD_LABEL[r.field] ?? r.field}
      headerExtras={(r) =>
        r.proposed_value?.risk_tier ? (
          <Badge
            variant={isCriminalizingTier(r.proposed_value.risk_tier) ? 'destructive' : 'secondary'}
            className="font-normal"
          >
            {isCriminalizingTier(r.proposed_value.risk_tier) && <Lock size={11} className="mr-1" />}
            {TIER_LABEL[r.proposed_value.risk_tier] ?? r.proposed_value.risk_tier}
          </Badge>
        ) : null
      }
      renderBody={renderValue}
      rationale={(r) => r.proposed_value?.rationale}
      approveGuard={(r) =>
        isCriminalizingTier(r.proposed_value?.risk_tier)
          ? 'This is a criminalizing destination. Publishing a safety note here is sensitive — confirm you have reviewed it for outing/safety risk?'
          : null
      }
      onDecide={(r, action, confirmed) => decide.mutateAsync({ id: r.id, action, confirm: confirmed })}
      batch={{
        count: safeCount,
        label: (n) => `Approve ${n} safe-tier`,
        run: () => batchApproveSafe.mutateAsync(),
        successMessage: (n) => `Batch approved ${n} safe-tier safety note${n === 1 ? '' : 's'}`,
      }}
    />
  );
}
