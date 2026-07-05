import { Users, Calendar, Hash, Flame, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PeopleMatchShared } from '@/hooks/usePeopleDiscovery';

/**
 * Renders the "why you matched" signals the discovery engine already computes
 * (mutual friends / shared events / shared groups) as small monochrome chips.
 * Returns null when there's nothing to show — never an empty box.
 */
export function SignalChips({
  shared,
  className,
  max = 3,
}: {
  shared?: PeopleMatchShared;
  className?: string;
  max?: number;
}) {
  if (!shared) return null;
  const chips: { icon: LucideIcon; label: string }[] = [];
  if (shared.chemistry_band === 'high') chips.push({ icon: Flame, label: 'High chemistry' });
  else if (shared.chemistry_band === 'medium') chips.push({ icon: Flame, label: 'Chemistry' });
  if (shared.mutual_friends)
    chips.push({ icon: Users, label: `${shared.mutual_friends} mutual` });
  if (shared.shared_events)
    chips.push({
      icon: Calendar,
      label: `${shared.shared_events} event${shared.shared_events === 1 ? '' : 's'}`,
    });
  if (shared.mutual_groups)
    chips.push({
      icon: Hash,
      label: `${shared.mutual_groups} group${shared.mutual_groups === 1 ? '' : 's'}`,
    });
  if (!chips.length) return null;

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {chips.slice(0, max).map(({ icon: Icon, label }) => (
        <span
          key={label}
          className="inline-flex items-center gap-1 rounded-badge bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground"
        >
          <Icon size={10} aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}
