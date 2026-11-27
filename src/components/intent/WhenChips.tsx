import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterChip } from '@/components/transit/FilterChip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { SEGMENT_TRACK, segmentClass } from '@/lib/segmented';
import { cn } from '@/lib/utils';
import { CalendarDays } from '@/components/icons';
import {
  WHEN_PRESETS,
  WHEN_PRESET_LABEL as PRESET_LABEL,
  formatWhen,
  sameWhen,
  toDayString,
  type When,
} from '@/lib/whenSelection';

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
                <CalendarDays size={16} aria-hidden />
                <span className="whitespace-nowrap">{dayLabel}</span>
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

const SHORT_LABEL: Record<(typeof WHEN_PRESETS)[number], string> = {
  tonight: 'Tonight',
  'this-weekend': 'Weekend',
  'next-7-days': '7 days',
};

/**
 * The same choice as one compact "This weekend ▾" control, for the sticky
 * toolbar on /going-out where a row of four chips would not fit beside the
 * city and the filters.
 */
export function WhenMenu({
  value,
  onChange,
}: {
  value: When | null;
  onChange: (next: When | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const day = value && typeof value !== 'string' ? value.day : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const label = formatWhen(value, t, i18n.language);
  const pick = (next: When | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FilterChip
          active={Boolean(value) || open}
          aria-label={`${t('goingOut.when.label', 'When')}: ${label}`}
          label={
            <>
              <span className="whitespace-nowrap">{label}</span>
              <span aria-hidden>▾</span>
            </>
          }
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={16}
        className="w-auto max-w-[calc(100vw-2rem)] p-4"
      >
        {/* One line above the calendar: a segmented row with short labels.
            Each accessible name is the full phrase, which contains the
            visible text (WCAG 2.5.3). */}
        <div
          role="group"
          aria-label={t('goingOut.when.label', 'When')}
          className={cn(SEGMENT_TRACK, 'mb-2 grid-cols-4')}
        >
          <button
            type="button"
            aria-pressed={!value}
            aria-label={t('goingOut.when.any', 'Any time')}
            onClick={() => pick(null)}
            className={segmentClass(!value)}
          >
            {t('goingOut.when.short.any', 'Any')}
          </button>
          {WHEN_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={sameWhen(value, p)}
              aria-label={t(`goingOut.when.${p}`, PRESET_LABEL[p])}
              onClick={() => pick(p)}
              className={segmentClass(sameWhen(value, p))}
            >
              {t(`goingOut.when.short.${p}`, SHORT_LABEL[p])}
            </button>
          ))}
        </div>
        <Calendar
          mode="single"
          selected={day ? new Date(`${day}T00:00:00`) : undefined}
          disabled={{ before: today }}
          onSelect={(d) => pick(d ? { day: toDayString(d) } : null)}
        />
      </PopoverContent>
    </Popover>
  );
}
