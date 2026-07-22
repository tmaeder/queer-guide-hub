import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { eraRangeLabel, type HistoryEra } from '@/config/historyEras';
import { isRestrainedMilestone, pickAnchors } from '@/lib/historyEraGrouping';
import { useMilestonesTimeline, type MilestoneTimelineFilters } from '@/hooks/useMilestones';
import type { Milestone } from '@/types/milestone';
import { AnchorMilestoneCard } from './AnchorMilestoneCard';
import { EraKeyFigures } from './EraKeyFigures';
import { MilestoneRow } from './MilestoneRow';

/**
 * One era chapter on /history: intro, 1–2 editorial anchor cards, the remaining
 * major-milestone spine rows, and an on-demand "show all" expansion that fetches
 * the era's full chronology (all significances) under the active filters.
 * Motion-free throughout — persecution content is safety-adjacent.
 */
export function EraSection({
  era,
  spineRows,
  totalCount,
  filters,
  expanded,
  onToggleExpanded,
}: {
  era: HistoryEra;
  spineRows: Milestone[];
  /** Filtered all-significance count for this era (from milestones_year_counts). */
  totalCount: number | undefined;
  filters: Pick<MilestoneTimelineFilters, 'countryLabel' | 'category' | 'impact'>;
  expanded: boolean;
  onToggleExpanded: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  const anchors = pickAnchors(spineRows, 2);
  const anchorIds = new Set(anchors.map((m) => m.id));
  const rest = spineRows.filter((m) => !anchorIds.has(m.id));

  const { data: fullRows, isLoading: expandLoading } = useMilestonesTimeline(
    {
      ...filters,
      fromYear: era.from ?? 1,
      toYear: era.to ?? new Date().getFullYear() + 1,
    },
    2500,
    { enabled: expanded },
  );

  const hasMore = (totalCount ?? spineRows.length) > spineRows.length;

  return (
    <section id={`era-${era.slug}`} className="scroll-mt-24">
      <header className="mb-6 border-t border-border pt-6">
        <p className="text-2xs uppercase tracking-wider text-muted-foreground">{eraRangeLabel(era)}</p>
        <h2 className="mt-1 font-display text-headline-lg font-semibold">{t(era.titleKey)}</h2>
        <p className="mt-2 max-w-prose text-15 leading-relaxed text-muted-foreground">{t(era.introKey)}</p>
      </header>

      <EraKeyFigures era={era} />

      {anchors.length > 0 && (
        <div
          className={
            anchors.length > 1 && !anchors.every((m) => isRestrainedMilestone(m, era))
              ? 'mb-8 grid gap-8 md:grid-cols-2'
              : 'mb-8 space-y-4'
          }
        >
          {anchors.map((m) => (
            <AnchorMilestoneCard key={m.id} milestone={m} restrained={isRestrainedMilestone(m, era)} />
          ))}
        </div>
      )}

      {!expanded && rest.length > 0 && (
        <div className="relative ml-1.5 space-y-6 border-l border-border pl-6">
          {rest.map((m) => (
            <MilestoneRow key={m.id} milestone={m} className="-ml-[31px]" />
          ))}
        </div>
      )}

      {expanded &&
        (expandLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" height={48} className="rounded-element" />
            ))}
          </div>
        ) : (
          <div className="relative ml-1.5 space-y-6 border-l border-border pl-6">
            {(fullRows ?? [])
              .filter((m) => !anchorIds.has(m.id))
              .map((m) => (
                <MilestoneRow key={m.id} milestone={m} className="-ml-[31px]" />
              ))}
          </div>
        ))}

      {(hasMore || expanded) && (
        <div className="mt-6">
          <Button variant="outline" size="sm" onClick={() => onToggleExpanded(!expanded)}>
            {expanded
              ? t('milestones.era.showFewer', 'Show fewer')
              : t('milestones.era.showAll', 'Show all {{count}} events', { count: totalCount ?? 0 })}
          </Button>
        </div>
      )}
    </section>
  );
}
