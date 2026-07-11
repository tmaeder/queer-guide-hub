import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * The one "Featured" treatment for entity cards — monochrome overlay chip
 * matching the EventCard/VenueCard status-overlay vocabulary
 * (bg-foreground/80 on the image, never a colored badge). Positioned for the
 * card-image overlay slot; override placement via className.
 */
export function FeaturedBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'absolute top-2 right-2 px-2 py-0.5 rounded-badge text-2xs font-semibold uppercase tracking-wider bg-foreground/80 text-background',
        className,
      )}
    >
      {t('common.featured', 'Featured')}
    </span>
  );
}
