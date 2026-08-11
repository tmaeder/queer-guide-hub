import { Users, Calendar, Hash, Flame, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

  if (!shared) return null;
  const chips: { icon: LucideIcon; label: string }[] = [];
  if (shared.chemistry_band === 'high')
    chips.push({ icon: Flame, label: t('people.signals.chemistryHigh', 'High chemistry') });
  else if (shared.chemistry_band === 'medium')
    chips.push({ icon: Flame, label: t('people.signals.chemistry', 'Chemistry') });
  if (shared.mutual_friends)
    chips.push({
      icon: Users,
      label: t('people.signals.mutual', {
        defaultValue: '{{count}} mutual',
        count: shared.mutual_friends,
      }),
    });
  if (shared.shared_events)
    chips.push({
      icon: Calendar,
      // Pluralisation via i18next's _one/_other suffixes rather than a hand-rolled
      // ternary — English has two forms, the eleven locales this ships in do not.
      label: t('people.signals.events', {
        defaultValue_one: '{{count}} event',
        defaultValue_other: '{{count}} events',
        count: shared.shared_events,
      }),
    });
  if (shared.mutual_groups)
    chips.push({
      icon: Hash,
      label: t('people.signals.groups', {
        defaultValue_one: '{{count}} group',
        defaultValue_other: '{{count}} groups',
        count: shared.mutual_groups,
      }),
    });
  if (!chips.length) return null;

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {chips.slice(0, max).map(({ icon: Icon, label }) => (
        <span
          key={label}
          className="inline-flex items-center gap-1 border border-foreground bg-background px-1.5 py-0.5 text-2xs font-bold"
        >
          <Icon size={10} aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}
