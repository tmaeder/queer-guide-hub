import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AdminStatProps {
  label: string;
  value: number | string;
  /**
   * Marks a count that should be zero. When `value` is a non-zero number the
   * figure turns destructive and gains a warning icon.
   */
  hardFail?: boolean;
  /** Small glyph rendered before the label. */
  icon?: ReactNode;
  className?: string;
}

/**
 * Inline count chip for the admin quality panels.
 *
 * Six byte-identical private copies of this lived in CityQualityPanel,
 * VillageQualityPanel, PersonalityQualityPanel, AmenityQualityPanel,
 * EventQualityPanel and TagQualityPanel. All six reached for an inline
 * `style={{ color: 'hsl(var(--destructive)) }}` to dodge the hsl-literal lint
 * rule; the token class does the same job and stays themeable.
 *
 * Note: `admin/affiliate/Stat` is deliberately NOT folded in here — it is a
 * bordered card (label above, figure below, optional hint), a different shape
 * for a different context. Merging would buy a variant prop and remove no
 * duplication.
 */
export function AdminStat({ label, value, hardFail, icon, className }: AdminStatProps) {
  const failing = hardFail === true && typeof value === 'number' && value > 0;

  return (
    <div className={cn('flex items-center gap-2 rounded-element bg-muted px-4 py-2', className)}>
      <span className={cn('text-headline tabular-nums', failing && 'text-destructive')}>
        {value}
      </span>
      <span className="flex items-center gap-1 text-13 text-muted-foreground">
        {failing && <AlertTriangle size={12} className="text-destructive" aria-hidden />}
        {icon}
        {label}
      </span>
    </div>
  );
}
