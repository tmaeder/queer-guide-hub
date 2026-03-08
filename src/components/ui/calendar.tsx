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
          --rdp-accent-color: #333333;
          --rdp-accent-background-color: #333333;
          --rdp-day_button-height: 36px;
          --rdp-day_button-width: 36px;
        }
        .rdp-day_button {
          border-radius: 6px;
          font-size: 0.875rem;
        }
        .rdp-day_button:hover:not([disabled]) {
          background-color: #f5f5f5;
        }
        .rdp-selected .rdp-day_button {
          background-color: #333333 !important;
          color: #ffffff !important;
        }
        .rdp-today .rdp-day_button {
          background-color: #f5f5f5;
          color: #333333;
          font-weight: 600;
        }
        .rdp-outside .rdp-day_button {
          color: #999999;
          opacity: 0.5;
        }
        .rdp-disabled .rdp-day_button {
          color: #999999;
          opacity: 0.5;
        }
        .rdp-range_middle .rdp-day_button {
          background-color: #f5f5f5 !important;
          color: #333333 !important;
        }
        .rdp-range_start .rdp-day_button,
        .rdp-range_end .rdp-day_button {
          background-color: #333333 !important;
          color: #ffffff !important;
        }
        .rdp-button_previous:hover,
        .rdp-button_next:hover {
          opacity: 1;
        }
        .rdp-weekday {
          color: #999999;
          font-weight: 400;
          font-size: 0.8rem;
        }
        .rdp-month_caption {
          font-size: 0.875rem;
          font-weight: 500;
        }
      `}</style>
    </>
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
