import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ showOutsideDays = true, style, ...props }: CalendarProps) {
  return (
    <>
      <DayPicker
        showOutsideDays={showOutsideDays}
        style={{ padding: 12, ...style }}
        components={{
          Chevron: ({ orientation, ...chevronProps }) =>
            orientation === 'left' ? (
              <ChevronLeft style={{ height: 16, width: 16 }} {...chevronProps} />
            ) : (
              <ChevronRight style={{ height: 16, width: 16 }} {...chevronProps} />
            ),
        }}
        {...props}
      />
      <style>{`
        .rdp-root {
          --rdp-accent-color: hsl(var(--foreground));
          --rdp-accent-background-color: hsl(var(--foreground));
          --rdp-day_button-height: 36px;
          --rdp-day_button-width: 36px;
        }
        .rdp-day_button {
          border-radius: 0;
          font-size: 0.875rem;
        }
        .rdp-day_button:hover:not([disabled]) {
          background-color: hsl(var(--muted));
        }
        .rdp-selected .rdp-day_button {
          background-color: hsl(var(--foreground)) !important;
          color: hsl(var(--background)) !important;
        }
        .rdp-today .rdp-day_button {
          background-color: hsl(var(--muted));
          color: hsl(var(--foreground));
          font-weight: 700;
        }
        .rdp-outside .rdp-day_button {
          color: hsl(var(--muted-foreground));
          opacity: 0.5;
        }
        .rdp-disabled .rdp-day_button {
          color: hsl(var(--muted-foreground));
          opacity: 0.5;
        }
        .rdp-range_middle .rdp-day_button {
          background-color: hsl(var(--muted)) !important;
          color: hsl(var(--foreground)) !important;
        }
        .rdp-range_start .rdp-day_button,
        .rdp-range_end .rdp-day_button {
          background-color: hsl(var(--foreground)) !important;
          color: hsl(var(--background)) !important;
        }
        .rdp-weekday {
          color: hsl(var(--muted-foreground));
          font-weight: 600;
          font-size: 0.7rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .rdp-month_caption {
          font-size: 0.875rem;
          font-weight: 700;
        }
      `}</style>
    </>
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
