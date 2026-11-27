import { createElement } from 'react';
import { classificationSource, useManagedLabel } from '@/hooks/useManagedOptions';
import seeds from '@/config/classificationSeeds.json';
import { milestoneCategoryIcon } from './milestoneCategoryIcon';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { milestoneCategoryLabelKey, type MilestoneCategory } from '@/types/milestone';

/**
 * Monochrome outline badge naming the milestone category (vocab-driven icon +
 * i18n label).
 *
 * Icons stay lucide. `TransitIcon`'s 42-name set carries no legal or history
 * vocabulary — there is no scale, gavel, flag, ban or stethoscope in it — so
 * the design system's "never mix the two families in one surface" rule is
 * satisfied by keeping every history surface lucide, which is what it already
 * is. (`RouteBullet` / `StationRing` are geometric content-type marks, not
 * icons, and are permitted alongside — see VenueDetail.parts.tsx.)
 */
export function MilestoneCategoryBadge({
  category,
  className,
}: {
  category: MilestoneCategory | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const seed = seeds.milestone_category.find((option) => option.value === category)?.label;
  const label = useManagedLabel(
    classificationSource('milestone_category'),
    category,
    category ? t(milestoneCategoryLabelKey(category), { defaultValue: seed ?? category }) : '',
    seed,
  );
  if (!category) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-element bg-muted px-2 py-1 text-2xs uppercase tracking-label text-foreground',
        className,
      )}
    >
      {createElement(milestoneCategoryIcon(category), { size: 14, 'aria-hidden': true })}
      {label}
    </span>
  );
}
