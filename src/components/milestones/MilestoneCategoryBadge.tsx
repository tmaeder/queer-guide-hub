import {
  Ban,
  Flag,
  Gavel,
  Milestone as MilestoneIcon,
  Scale,
  ShieldAlert,
  Stethoscope,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { milestoneCategoryLabelKey, type MilestoneCategory } from '@/types/milestone';

const CATEGORY_ICON: Record<MilestoneCategory, LucideIcon> = {
  'uprising-movement': Flag,
  'law-equality': Scale,
  'law-decriminalization': Gavel,
  'law-criminalization': Ban,
  depathologization: Stethoscope,
  'persecution-destruction': ShieldAlert,
  other: MilestoneIcon,
};

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
  if (!category) return null;
  const Icon = CATEGORY_ICON[category] ?? MilestoneIcon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 bg-card px-1.5 py-0.5 text-2xs uppercase tracking-label text-foreground rounded-container shadow-soft',
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {t(milestoneCategoryLabelKey(category))}
    </span>
  );
}
