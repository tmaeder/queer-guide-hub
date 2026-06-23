import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ProfileSectionHeaderProps {
  title: ReactNode;
  /** Optional right-aligned slot — e.g. a "View all →" link or a count. */
  action?: ReactNode;
  /** id for the heading, so a section can reference it via aria-labelledby. */
  id?: string;
  className?: string;
}

/**
 * One consistent section heading for the profile hub. A single `text-title`
 * display-font h2 with an optional right-aligned action slot — replaces the
 * ad-hoc mix of heading styles across the progress / overview sub-sections.
 */
export function ProfileSectionHeader({ title, action, id, className }: ProfileSectionHeaderProps) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4', className)}>
      <h2 id={id} className="text-title font-display font-semibold">
        {title}
      </h2>
      {action != null && <div className="shrink-0">{action}</div>}
    </div>
  );
}
