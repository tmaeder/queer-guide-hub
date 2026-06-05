import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ showOutsideDays = true, style, ...props }: CalendarProps) {
  return (
    <>
      <DayPicker
        showOutsideDays={showOutsideDays}
        style={{ ...style }}
        className="p-4"
        components={{
          Chevron: ({ orientation, ...chevronProps }) =>
            orientation === 'left' ? (
              <ChevronLeft size={16} {...chevronProps} />
            ) : (
              <ChevronRight size={16} {...chevronProps} />
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
        /* D3: explicit 7-col grid. Without this the weekday header and
           day rows collapse to content width inside constrained containers
           (the EventsCalendarView panel), producing "SUMOTUWETHFRSA" and
           "2627 2829 30" runs reported in QA. */
        .rdp-month_grid { width: 100%; border-collapse: separate; }
        .rdp-weekdays,
        .rdp-week {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
        }
        .rdp-weekday,
        .rdp-day {
          text-align: center;
        }
        .rdp-day { padding: 0; }
        .rdp-day_button {
          border-radius: 0;
          font-size: 0.875rem;
          width: 100%;
          margin: 0 auto;
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
        /* Lay multiple months side by side (range pickers) instead of stacked;
           wraps on narrow containers so a single column still works on mobile. */
        .rdp-months {
          display: flex;
          flex-wrap: wrap;
          gap: 1.5rem;
          justify-content: center;
        }
        .rdp-month {
          flex: 0 0 auto;
        }
      `}</style>
    </>
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
