/* eslint-disable react-refresh/only-export-components -- intentionally co-locates helpers/constants with the primary component */

import { useTranslation } from 'react-i18next';
import { Calendar, MapPin, Sparkles, Ticket, Flag, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EventPresetId =
  | 'this-weekend'
  | 'near-me'
  | 'pride'
  | 'this-month'
  | 'free'
  | 'featured';

export interface EventPreset {
  id: EventPresetId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface PresetChipsProps {
  active: EventPresetId | null;
  onSelect: (preset: EventPresetId | null) => void;
  disabled?: EventPresetId[];
}

export function PresetChips({ active, onSelect, disabled = [] }: PresetChipsProps) {
  const { t } = useTranslation();

  const presets: EventPreset[] = [
    { id: 'this-weekend', label: t('pages.events.preset.thisWeekend', 'This weekend'), icon: CalendarDays },
    { id: 'near-me', label: t('pages.events.preset.nearMe', 'Near me'), icon: MapPin },
    { id: 'pride', label: t('pages.events.preset.pride', 'Pride season'), icon: Flag },
    { id: 'this-month', label: t('pages.events.preset.thisMonth', 'This month'), icon: Calendar },
    { id: 'free', label: t('pages.events.preset.free', 'Free'), icon: Ticket },
    { id: 'featured', label: t('pages.events.preset.featured', 'Featured'), icon: Sparkles },
  ];

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory scrollbar-thin"
      role="tablist"
      aria-label={t('pages.events.preset.label', 'Quick filters')}
    >
      {presets.map(({ id, label, icon: Icon }) => {
        const isActive = active === id;
        const isDisabled = disabled.includes(id);
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={isDisabled}
            onClick={() => onSelect(isActive ? null : id)}
            className={cn(
              'shrink-0 snap-start inline-flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-border hover:bg-muted',
              isDisabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function getPresetDateRange(id: EventPresetId): { start: Date; end: Date } | null {
  const now = new Date();
  if (id === 'this-weekend') {
    const day = now.getDay();
    const friday = new Date(now);
    friday.setDate(now.getDate() + ((5 - day + 7) % 7));
    friday.setHours(0, 0, 0, 0);
    const sunday = new Date(friday);
    sunday.setDate(friday.getDate() + 2);
    sunday.setHours(23, 59, 59, 999);
    return { start: friday, end: sunday };
  }
  if (id === 'this-month') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }
  if (id === 'pride') {
    const year = now.getFullYear();
    const start = new Date(year, 5, 1, 0, 0, 0, 0);
    const end = new Date(year, 6, 31, 23, 59, 59, 999);
    if (now > end) {
      return { start: new Date(year + 1, 5, 1), end: new Date(year + 1, 6, 31, 23, 59, 59, 999) };
    }
    return { start: now > start ? now : start, end };
  }
  return null;
}
