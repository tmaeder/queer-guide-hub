import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { cn } from '@/lib/utils';
import { formatMilestoneDate, milestoneYear } from '@/lib/milestoneDate';
import { displayableMilestoneImage } from '@/lib/milestoneImage';
import type { Milestone } from '@/types/milestone';
import { MilestoneCategoryBadge } from './MilestoneCategoryBadge';
import { MilestoneImpactMarker } from './MilestoneImpactMarker';

/**
 * Editorial anchor card — the large lead treatment for an era's defining
 * milestones. The `restrained` variant is structural, not editorial: persecution
 * and negative milestones never get the celebratory big-image treatment
 * (documentary framing instead — small or no image, quieter heading).
 */
export function AnchorMilestoneCard({
  milestone,
  restrained,
  className,
}: {
  milestone: Milestone;
  restrained: boolean;
  className?: string;
}) {
  const { i18n } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = imageFailed ? null : displayableMilestoneImage(milestone.image_url);
  const dateLabel = formatMilestoneDate(milestone.date, milestone.date_precision, i18n.language);
  const place = [milestone.city?.name ?? milestone.city_name, milestone.country?.name ?? milestone.country_name]
    .filter(Boolean)
    .join(', ');
  const eyebrow = place ? `${dateLabel} · ${place}` : dateLabel;

  if (restrained) {
    return (
      <LocalizedLink
        to={`/history/${milestone.slug}`}
        className={cn('group flex items-start gap-4 rounded-element border border-border p-4', className)}
      >
        <span className="mt-1.5 shrink-0">
          <MilestoneImpactMarker impact={milestone.impact} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-13 text-muted-foreground">{eyebrow}</span>
          <span className="mt-1 block font-display text-title font-semibold group-hover:underline">
            {milestone.title}
          </span>
          {milestone.description ? (
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
      </LocalizedLink>
    );
  }

  return (
    <LocalizedLink to={`/history/${milestone.slug}`} className={cn('group block', className)}>
      {imageUrl ? (
        <span className="mb-4 block aspect-[16/10] overflow-hidden rounded-container bg-muted">
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onError is a media-error handler, not a user-input listener. */}
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover"
          />
        </span>
      ) : (
        <span
          aria-hidden
          className="mb-4 block select-none font-display text-hero font-semibold leading-none text-muted-foreground/40"
        >
          {milestoneYear(milestone.date)}
        </span>
      )}
      <span className="block text-13 text-muted-foreground">{eyebrow}</span>
      <span className="mt-1 block font-display text-headline font-semibold leading-tight group-hover:underline">
        {milestone.title}
      </span>
      {milestone.description ? (
        <span className="mt-2 line-clamp-3 block text-15 text-muted-foreground">
          {milestone.description}
        </span>
      ) : null}
      <span className="mt-4 flex items-center gap-2">
        <MilestoneImpactMarker impact={milestone.impact} />
        {milestone.category ? <MilestoneCategoryBadge category={milestone.category} /> : null}
      </span>
    </LocalizedLink>
  );
}
