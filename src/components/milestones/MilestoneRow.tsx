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
  showMarker = true,
  className,
}: {
  milestone: RowMilestone;
  /** Override the significance-derived density (country strips force 'compact'). */
  density?: 'card' | 'row' | 'compact';
  showMarker?: boolean;
  className?: string;
}) {
  const { i18n } = useTranslation();
  const d = density ?? (milestone.significance >= 5 ? 'card' : milestone.significance >= 3 ? 'row' : 'compact');
  const dateLabel = formatMilestoneDate(milestone.date, milestone.date_precision, i18n.language);
  const place = milestone.country?.name ?? milestone.country_name ?? null;

  return (
    <LocalizedLink
      to={`/history/${milestone.slug}`}
      className={cn('group flex items-start gap-4', className)}
    >
      {showMarker && (
        <span className="mt-1.5 shrink-0">
          <MilestoneImpactMarker impact={milestone.impact} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        {d === 'card' ? (
          <span className="block">
            <span className="block text-13 text-muted-foreground">{dateLabel}{place ? ` · ${place}` : ''}</span>
            <span className="block font-display text-title font-semibold group-hover:underline">
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
            <span className="block text-13 text-muted-foreground">{dateLabel}{place ? ` · ${place}` : ''}</span>
            <span className="block text-15 font-semibold group-hover:underline">{milestone.title}</span>
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
