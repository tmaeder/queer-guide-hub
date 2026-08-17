import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
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
  const place = [
    milestone.city?.name ?? milestone.city_name,
    milestone.country?.name ?? milestone.country_name,
  ]
    .filter(Boolean)
    .join(', ');
  const eyebrow = place ? `${dateLabel} · ${place}` : dateLabel;

  if (restrained) {
    return (
      <LocalizedLink
        to={`/history/${milestone.slug}`}
        // Same 3px plate and the same `card-lift` as the celebratory variant.
        // The affordance must NOT differ — a persecution milestone that refuses
        // to respond to the pointer reads as broken, not as sombre. Only the
        // treatment is documentary: no image, no poster year.
        className={cn(
          'card-lift group flex items-start gap-4 bg-card p-4 no-underline rounded-container shadow-soft',
          className,
        )}
      >
        <span className="mt-1 flex w-4 shrink-0 justify-center">
          <MilestoneImpactMarker impact={milestone.impact} size="station" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            {/* The line goes dark here, so the M bullet takes ink rather than
                pink. RouteBullet puts `className` last in its cn(), so this
                overrides the track fill without the component learning about
                eras. */}
            <RouteBullet type="milestone" size={24} className="bg-foreground text-background" />
            <span className="text-2xs uppercase tracking-label text-muted-foreground">
              {eyebrow}
            </span>
          </span>
          <span className="mt-2 block font-display text-headline leading-tight group-hover:underline">
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
    <LocalizedLink
      to={`/history/${milestone.slug}`}
      className={cn(
        'card-lift group block bg-card no-underline rounded-container shadow-soft',
        className,
      )}
    >
      {imageUrl ? (
        <span className="block aspect-[16/10] overflow-hidden border-b border-border-hairline bg-muted">
          { }
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover"
          />
        </span>
      ) : (
        // The year AS the poster. Ink, not a 40%-opacity ghost — that was a
        // soft-UI move, and Anton 400 at 40% would nearly vanish next to the
        // 3px plate around it.
        <span
          aria-hidden
          className="block select-none border-b border-border-hairline px-4 py-6 font-display text-hero leading-none"
        >
          {milestoneYear(milestone.date)}
        </span>
      )}
      <span className="block p-4">
        <span className="flex items-center gap-2">
          <RouteBullet type="milestone" size={30} />
          <span className="text-2xs uppercase tracking-label text-muted-foreground">{eyebrow}</span>
        </span>
        <span className="mt-2 block font-display text-headline leading-tight group-hover:underline">
          {milestone.title}
        </span>
        {milestone.description ? (
          <span className="mt-2 line-clamp-3 block text-15 text-muted-foreground">
            {milestone.description}
          </span>
        ) : null}
        {milestone.category ? (
          <span className="mt-4 block">
            <MilestoneCategoryBadge category={milestone.category} />
          </span>
        ) : null}
      </span>
    </LocalizedLink>
  );
}
