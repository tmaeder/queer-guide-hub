import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { cn } from '@/lib/utils';
import { formatMilestoneDate } from '@/lib/milestoneDate';
import type { Milestone, MilestoneRef } from '@/types/milestone';
import { MilestoneCategoryBadge } from './MilestoneCategoryBadge';
import { MilestoneImpactMarker } from './MilestoneImpactMarker';

type RowMilestone = MilestoneRef & Partial<Pick<Milestone, 'description' | 'country' | 'city'>>;

/**
 * The one milestone list row, used by the /history timeline, country strips and
 * entity embeds. Density is driven by `significance` (size instead of stars):
 * 5 = full card with description excerpt, 3–4 = standard row, 1–2 = compact line.
 */
export function MilestoneRow({
  milestone,
  density,
  marker = 'inline',
  className,
}: {
  milestone: RowMilestone;
  /** Override the significance-derived density (country strips force 'compact'). */
  density?: 'card' | 'row' | 'compact';
  /**
   * `station` sizes the impact marker to StationRing's box model and centres it
   * in a fixed 16px column, so `EraTrack`'s 3px rail — which centres itself in
   * the same 16px — runs exactly through the marker. That shared constant is
   * what replaced the old hand-calibrated `-ml-[31px]` offset at the call site.
   */
  marker?: 'inline' | 'station' | 'none';
  className?: string;
}) {
  const { i18n } = useTranslation();
  const d =
    density ??
    (milestone.significance >= 5 ? 'card' : milestone.significance >= 3 ? 'row' : 'compact');
  const dateLabel = formatMilestoneDate(milestone.date, milestone.date_precision, i18n.language);
  const place = milestone.country?.name ?? milestone.country_name ?? null;

  return (
    <LocalizedLink
      to={`/history/${milestone.slug}`}
      // `no-underline` is load-bearing, not cosmetic: the unlayered
      // `li a:not(.no-underline)` rule in index.css forces `display: inline`,
      // which collapses this flex row the moment it sits inside an <li> — which
      // is exactly what EraTrack does. jsdom never applies that stylesheet, so
      // no unit test can catch the regression; only the Playwright
      // `display: flex` assertion can. See OnThisDayBand for the same trap.
      className={cn('group flex items-start gap-4 no-underline', className)}
    >
      {marker !== 'none' && (
        <span
          className={cn(
            'flex shrink-0 justify-center',
            marker === 'station' ? 'mt-1 w-4' : 'mt-1.5',
          )}
        >
          <MilestoneImpactMarker
            impact={milestone.impact}
            size={marker === 'station' ? 'station' : 'inline'}
          />
        </span>
      )}
      <span className="min-w-0 flex-1">
        {d === 'card' ? (
          <span className="block">
            <span className="block text-13 text-muted-foreground">
              {dateLabel}
              {place ? ` · ${place}` : ''}
            </span>
            <span className="block text-title font-bold group-hover:underline">
              {milestone.title}
            </span>
            {'description' in milestone && milestone.description ? (
              <span className="mt-1 line-clamp-2 block text-15 text-muted-foreground">
                {milestone.description}
              </span>
            ) : null}
            {milestone.category ? (
              <span className="mt-2 block">
                <MilestoneCategoryBadge category={milestone.category} />
              </span>
            ) : null}
          </span>
        ) : d === 'row' ? (
          <span className="block">
            <span className="block text-13 text-muted-foreground">
              {dateLabel}
              {place ? ` · ${place}` : ''}
            </span>
            {/* Same token as `card` — a row and a card are the same station,
                they differ in how much of the story they carry, not in rank.
                Space Grotesk 700 is rank 4 per the docs' table; the transit
                components render this rank in Anton, but they are 41 files
                against 111 and both docs say otherwise. */}
            <span className="block text-title font-bold group-hover:underline">
              {milestone.title}
            </span>
          </span>
        ) : (
          <span className="block truncate text-13">
            <span className="text-muted-foreground">{dateLabel}</span>{' '}
            <span className="font-medium group-hover:underline">{milestone.title}</span>
          </span>
        )}
      </span>
    </LocalizedLink>
  );
}
