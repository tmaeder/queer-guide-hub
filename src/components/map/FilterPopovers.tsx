import React, { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarRange, History } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import type { MapShellFilters } from './MapShell.types';

function fmt(d: Date | undefined): string {
  return d ? d.toISOString().slice(0, 10) : '';
}

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
  const [open, setOpen] = useState(false);
  const initial: DateRange = {
    from: value ? new Date(value.start) : undefined,
    to: value ? new Date(value.end) : undefined,
  };
  const [range, setRange] = useState<DateRange | undefined>(initial);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" aria-label="Time range" className="h-8 px-2 border border-border">
            <CalendarRange size={14} className="mr-1.5" aria-hidden="true" />
            <span className="text-xs">
              {value ? `${value.start} → ${value.end}` : 'Any time'}
            </span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0 border-border">
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={range}
          onSelect={setRange}
          className="p-3"
        />
        <div className="flex items-center justify-between gap-2 border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRange(undefined);
              onChange(undefined);
              setOpen(false);
            }}
          >
            Clear
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (range?.from && range?.to) {
                onChange({ start: fmt(range.from), end: fmt(range.to) });
              }
              setOpen(false);
            }}
            disabled={!range?.from || !range?.to}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

interface EraPopoverProps {
  value?: MapShellFilters['era'];
  onChange: (next: MapShellFilters['era'] | undefined) => void;
  trigger?: React.ReactNode;
  min?: number;
  max?: number;
}

/**
 * Decade-range slider for the Era filter chip. Two thumbs, snapped to
 * decade boundaries. The historic LGBTQ+ overlay (personalities born or
 * active in the range) reads this value once Phase 4 data plumbing
 * lands.
 */
export const EraPopover = ({
  value,
  onChange,
  trigger,
  min = 1900,
  max = Math.floor(new Date().getFullYear() / 10) * 10,
}: EraPopoverProps) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<[number, number]>([
    value?.decadeStart ?? 1950,
    value?.decadeEnd ?? max,
  ]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" aria-label="Era" className="h-8 px-2 border border-border">
            <History size={14} className="mr-1.5" aria-hidden="true" />
            <span className="text-xs">
              {value ? `${value.decadeStart}s–${value.decadeEnd}s` : 'Any era'}
            </span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-4 border-border">
        <div className="flex items-baseline justify-between mb-3">
          <span className="text-xs text-muted-foreground">Era</span>
          <span className="text-sm font-medium tabular-nums">
            {draft[0]}s – {draft[1]}s
          </span>
        </div>
        <SliderPrimitive.Root
          className={cn('relative flex w-full touch-none select-none items-center h-5')}
          min={min}
          max={max}
          step={10}
          value={draft}
          onValueChange={(v) => setDraft([v[0], v[1]] as [number, number])}
          minStepsBetweenThumbs={1}
          aria-label="Decade range"
        >
          <SliderPrimitive.Track className="relative h-0.5 w-full grow bg-border">
            <SliderPrimitive.Range className="absolute h-full bg-foreground" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            aria-label="Start decade"
            className="block h-4 w-4 border border-foreground bg-background focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <SliderPrimitive.Thumb
            aria-label="End decade"
            className="block h-4 w-4 border border-foreground bg-background focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </SliderPrimitive.Root>
        <div className="flex items-center justify-between gap-2 mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(undefined);
              setOpen(false);
            }}
          >
            Clear
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onChange({ decadeStart: draft[0], decadeEnd: draft[1] });
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
