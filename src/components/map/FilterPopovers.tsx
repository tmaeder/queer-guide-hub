import React, { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTranslation } from 'react-i18next';
import type { DateRange } from 'react-day-picker';
import { TransitIcon } from '@/components/transit/TransitIcon';

function fmt(d: Date | undefined): string {
  return d ? d.toISOString().slice(0, 10) : '';
}

function fmtShort(d: Date | undefined): string {
  return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
}

interface TimeRangePickerProps {
  value?: { start: string; end: string };
  onChange: (next: { start: string; end: string } | undefined) => void;
  /** Fired after a commit (apply/clear) so a wrapping popover/sheet can close. */
  onDone?: () => void;
  /** One month fits a bottom sheet; the desktop popover shows two. */
  numberOfMonths?: 1 | 2;
}

/**
 * Inline date-range picker body (header + calendar + footer). Shared between
 * the desktop TimePopover and the mobile controls sheet.
 */
export const TimeRangePicker = ({
  value,
  onChange,
  onDone,
  numberOfMonths = 2,
}: TimeRangePickerProps) => {
  const { t } = useTranslation();
  const initial: DateRange = {
    from: value ? new Date(value.start) : undefined,
    to: value ? new Date(value.end) : undefined,
  };
  const [range, setRange] = useState<DateRange | undefined>(initial);

  const rangeSummary = (r: { from?: Date; to?: Date } | undefined): string => {
    if (r?.from && r?.to) return `${fmtShort(r.from)} – ${fmtShort(r.to)}`;
    if (r?.from)
      return t('map.time.untilEndDate', {
        defaultValue: '{{start}} – end date',
        start: fmtShort(r.from),
      });
    return t('map.time.pickRange', { defaultValue: 'Pick a start & end' });
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-6 px-4 py-2">
        <span className="text-13 font-semibold text-foreground">
          {t('map.time.chooseDates', { defaultValue: 'Choose dates' })}
        </span>
        <span className="text-13 tabular-nums text-muted-foreground">{rangeSummary(range)}</span>
      </div>
      <Calendar
        mode="range"
        numberOfMonths={numberOfMonths}
        selected={range}
        onSelect={setRange}
        className="px-4 py-4"
      />
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={!range?.from && !range?.to}
          onClick={() => {
            setRange(undefined);
            onChange(undefined);
            onDone?.();
          }}
        >
          {t('map.time.clear', { defaultValue: 'Clear' })}
        </Button>
        <Button
          size="sm"
          onClick={() => {
            if (range?.from && range?.to) {
              onChange({ start: fmt(range.from), end: fmt(range.to) });
            }
            onDone?.();
          }}
          disabled={!range?.from || !range?.to}
        >
          {t('map.time.apply', { defaultValue: 'Apply dates' })}
        </Button>
      </div>
    </div>
  );
};

interface TimePopoverProps {
  value?: { start: string; end: string };
  onChange: (next: { start: string; end: string } | undefined) => void;
  trigger?: React.ReactNode;
}

/**
 * Date-range picker for the Time filter chip. Two-month inline calendar;
 * commit applies the range, clear removes the filter entirely.
 */
export const TimePopover = ({ value, onChange, trigger }: TimePopoverProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('map.time.label', { defaultValue: 'Time range' })}
            title={t('map.time.label', { defaultValue: 'Time range' })}
            className="h-8 px-2"
          >
            <span className="mr-1.5 inline-flex">
              <TransitIcon name="events" size={18} />
            </span>
            <span className="text-xs">
              {value
                ? `${value.start} → ${value.end}`
                : t('map.time.anyTime', { defaultValue: 'Any time' })}
            </span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0 overflow-hidden">
        <TimeRangePicker value={value} onChange={onChange} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
};
