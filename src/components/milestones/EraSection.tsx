import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { eraRangeLabel, type HistoryEra } from '@/config/historyEras';
import { isRestrainedMilestone, pickAnchors } from '@/lib/historyEraGrouping';
import { useMilestonesTimeline, type MilestoneTimelineFilters } from '@/hooks/useMilestones';
import { cn } from '@/lib/utils';
import type { Milestone } from '@/types/milestone';
import { AnchorMilestoneCard } from './AnchorMilestoneCard';
import { EraKeyFigures } from './EraKeyFigures';
import { EraTrack } from './EraTrack';

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
    // scroll-mt-28: the sticky header reaches ~118px on desktop, which the
    // previous scroll-mt-24 (96px) undershot.
    <section id={`era-${era.slug}`} className="scroll-mt-28">
      <header className="mb-8 border-t border-border-hairline pt-8">
        <p className="flex items-center gap-2 text-2xs uppercase tracking-label text-muted-foreground">
          {/* Line swatch in this chapter's own stroke. The pill is the
              sanctioned legend form, and it is what makes the pink→ink switch
              read as "the line goes dark" rather than a rendering glitch. */}
          <span
            aria-hidden
            className={cn(
              'inline-block h-2 w-6 rounded-full',
              era.restrained ? 'bg-foreground' : 'bg-track-pink',
            )}
          />
          {eraRangeLabel(era)}
        </p>
        {/* text-display = rank 2 (section h2), under the page's rank-1 h1. It
            was text-headline — the same token as the anchor card titles nested
            inside it, which the rank table explicitly forbids. */}
        <h2 className="mt-2 font-display text-display">{t(era.titleKey)}</h2>
        <p className="mt-4 max-w-reading text-body-lg leading-relaxed text-muted-foreground">
          {t(era.introKey)}
        </p>
      </header>

      <EraKeyFigures era={era} />

      {anchors.length > 0 && (
        <div
          className={
            anchors.length > 1 && !anchors.every((m) => isRestrainedMilestone(m, era))
              ? 'mb-8 grid gap-8 md:grid-cols-2'
              : 'mb-8 space-y-6'
          }
        >
          {anchors.map((m) => (
            <AnchorMilestoneCard
              key={m.id}
              milestone={m}
              restrained={isRestrainedMilestone(m, era)}
            />
          ))}
        </div>
      )}

      {!expanded && <EraTrack era={era} milestones={rest} />}

      {expanded &&
        (expandLoading ? (
          <div className="relative">
            {/* The track stays drawn while the chronology loads — the page's
                spine should never blink out from under the reader. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 start-0 flex w-4 justify-center"
            >
              <span className="w-[3px] bg-foreground/20" />
            </span>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="py-4 ps-8">
                <div className="h-10 animate-pulse bg-muted" />
              </div>
            ))}
          </div>
        ) : (
          <EraTrack era={era} milestones={(fullRows ?? []).filter((m) => !anchorIds.has(m.id))} />
        ))}

      {(hasMore || expanded) && (
        <div className="mt-8">
          <Button variant="outline" size="sm" onClick={() => onToggleExpanded(!expanded)}>
            {expanded
              ? t('milestones.era.showFewer', 'Show fewer')
              : t('milestones.era.showAll', 'Show all {{count}} events', {
                  count: totalCount ?? 0,
                })}
          </Button>
        </div>
      )}
    </section>
  );
}
