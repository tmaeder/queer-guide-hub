import { Ban, Flag, Gavel, Milestone as MilestoneIcon, Scale, ShieldAlert, Stethoscope } from 'lucide-react';
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

/** Monochrome outline badge naming the milestone category (vocab-driven icon + i18n label). */
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
        'inline-flex items-center gap-1 rounded-badge border border-border px-1.5 py-0.5 text-2xs uppercase tracking-wide text-muted-foreground',
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {t(milestoneCategoryLabelKey(category))}
    </span>
  );
}
