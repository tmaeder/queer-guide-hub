import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterChip } from '@/components/transit/FilterChip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  WHEN_PRESETS,
  sameWhen,
  toDayString,
  type When,
  type WhenPreset,
} from '@/lib/whenSelection';

const PRESET_LABEL: Record<WhenPreset, string> = {
  tonight: 'Tonight',
  'this-weekend': 'This weekend',
  'next-7-days': 'Next 7 days',
};

/**
 * Date presets plus a single calendar day. Selecting the active chip again
 * clears the choice, so "any time" is always one tap away.
 */
export function WhenChips({
  value,
  onChange,
  className,
}: {
  value: When | null;
  onChange: (next: When | null) => void;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const day = value && typeof value !== 'string' ? value.day : null;
  const dayDate = day ? new Date(`${day}T00:00:00`) : undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayLabel = dayDate
    ? new Intl.DateTimeFormat(i18n.language, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(dayDate)
    : t('goingOut.when.pickDay', 'Pick a day');

  return (
    <div
      role="group"
      aria-label={t('goingOut.when.label', 'When')}
      className={className ?? 'flex flex-wrap gap-2'}
    >
      {WHEN_PRESETS.map((p) => (
        <FilterChip
          key={p}
          active={sameWhen(value, p)}
          onClick={() => onChange(sameWhen(value, p) ? null : p)}
          label={t(`goingOut.when.${p}`, PRESET_LABEL[p])}
        />
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <FilterChip
            active={Boolean(day) || open}
            label={
              <>
                <span>{dayLabel}</span>
                <span aria-hidden>▾</span>
              </>
            }
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dayDate}
            disabled={{ before: today }}
            onSelect={(d) => {
              onChange(d ? { day: toDayString(d) } : null);
              setOpen(false);
            }}
            autoFocus
            className="p-4"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
