import { useState } from 'react';
import { ChevronLeft, ChevronRight, Crosshair, CalendarDays, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { stepFor, type Viewport } from '@/utils/timelineViewport';

interface TimelineToolbarProps {
  viewport: Viewport;
  onPan: (deltaMs: number) => void;
  onCenter: (ms: number) => void;
  onZoom: (factor: number) => void;
  onFit: () => void;
  canFit: boolean;
}

export function TimelineToolbar({ viewport, onPan, onCenter, onZoom, onFit, canFit }: TimelineToolbarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const step = stepFor(viewport);
  const stepLabel =
    step.unit === 'day' ? 'day' : step.unit === 'week' ? 'week' : step.unit === 'month' ? 'month' : 'quarter';

  return (
    <div className="flex flex-wrap items-center gap-1 mb-2" role="toolbar" aria-label="Timeline navigation">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPan(-step.ms)}
        aria-label={`Pan back one ${stepLabel}`}
        style={{ display: 'inline-flex', gap: 4 }}
      >
        <ChevronLeft className="size-4" />
        <span className="hidden sm:inline">1 {stepLabel}</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onCenter(Date.now())}
        style={{ display: 'inline-flex', gap: 4 }}
        aria-label="Center on today"
      >
        <Crosshair className="size-4" />
        Today
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPan(step.ms)}
        aria-label={`Pan forward one ${stepLabel}`}
        style={{ display: 'inline-flex', gap: 4 }}
      >
        <span className="hidden sm:inline">1 {stepLabel}</span>
        <ChevronRight className="size-4" />
      </Button>

      <span className="mx-1 h-5 w-px bg-foreground/10" aria-hidden />

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" style={{ display: 'inline-flex', gap: 6 }} aria-label="Go to date">
            <CalendarDays className="size-4" />
            <span className="hidden sm:inline">Go to date</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-auto" align="start">
          <Calendar
            mode="single"
            onSelect={(d) => {
              if (d) {
                onCenter(d.getTime());
                setPickerOpen(false);
              }
            }}
            initialFocus
            className="p-4"
          />
        </PopoverContent>
      </Popover>

      {canFit && (
        <Button
          variant="outline"
          size="sm"
          onClick={onFit}
          style={{ display: 'inline-flex', gap: 4 }}
          aria-label="Fit viewport to loaded events"
        >
          <Maximize2 className="size-4" />
          <span className="hidden sm:inline">Fit</span>
        </Button>
      )}

      <span className="mx-1 h-5 w-px bg-foreground/10" aria-hidden />

      <Button variant="outline" size="sm" onClick={() => onZoom(0.5)} aria-label="Zoom in">
        <ZoomIn className="size-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={() => onZoom(2)} aria-label="Zoom out">
        <ZoomOut className="size-4" />
      </Button>

      <span className="ml-auto text-xs2 text-foreground/50 hidden md:inline">
        {format(new Date(viewport.startMs), 'PP')} — {format(new Date(viewport.endMs), 'PP')}
      </span>
    </div>
  );
}
