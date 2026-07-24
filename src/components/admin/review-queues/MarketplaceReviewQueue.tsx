import { Badge } from '@/components/ui/badge';
import {
  useMarketplaceReviewQueue,
  type MarketplaceReviewRow,
} from '@/hooks/useMarketplaceReviewQueue';
import { departmentLabel, departmentOf } from '@/lib/marketplaceTaxonomy';
import { EntityReviewQueue } from './EntityReviewQueue';

function prettify(slug: string | null | undefined): string {
  return (slug ?? '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderChange(r: MarketplaceReviewRow) {
  const l = r.marketplace_listings;
  const proposed = r.proposed_value?.subcategory ?? '';
  return (
    <div className="flex flex-wrap items-center gap-2 text-13">
      <Badge variant="secondary" className="font-normal">
        {prettify(l?.subcategory_slug)} · {l?.content_rating ?? '?'}
      </Badge>
      <span className="text-muted-foreground">→</span>
      <Badge variant="outline" className="font-normal">
        {proposed} ({departmentLabel(departmentOf(proposed.toLowerCase().replace(/[\s-]+/g, '_')))})
      </Badge>
    </div>
  );
}

/**
 * The marketplace tag engine safety gate. A re-categorisation that would LOWER a
 * product's content rating (e.g. a latex "Kleid" leaving fetish_wear for apparel)
 * is never applied until an admin approves here — wrong-SFW is the harmful
 * direction in a default-SFW shop.
 */
export function MarketplaceReviewQueue() {
  const { data: rows, isLoading, decide } = useMarketplaceReviewQueue();

  return (
    <EntityReviewQueue<MarketplaceReviewRow>
      title="Review queue — rating downgrades"
      description="Proposed re-categorisations that would lower a product's content rating. Never applied until approved here."
      rows={rows}
      isLoading={isLoading}
      entityName={(r) => r.marketplace_listings?.title ?? 'Unknown listing'}
      fieldLabel={() => null}
      headerExtras={(r) =>
        r.model ? (
          <Badge variant="outline" className="font-normal">
            {r.model}
          </Badge>
        ) : null
      }
      renderBody={renderChange}
      rationale={(r) => r.proposed_value?.rationale}
      approveLabel="Approve change"
      rejectLabel="Keep current"
      decideSuccess={(action) =>
        action === 'approve' ? 'Approved — re-categorised' : 'Rejected — category kept'
      }
      onDecide={(r, action) => decide.mutateAsync({ id: r.id, action })}
    />
  );
}
