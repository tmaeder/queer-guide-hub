import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

const calendarStyles: Record<string, React.CSSProperties> = {
  months: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  month: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  caption: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: 4,
    position: 'relative',
    alignItems: 'center',
  },
  caption_label: {
    fontSize: '0.875rem',
    fontWeight: 500,
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  nav_button: {
    height: 28,
    width: 28,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    border: '1px solid #e5e5e5',
    background: 'transparent',
    padding: 0,
    opacity: 0.5,
    cursor: 'pointer',
  },
  nav_button_previous: {
    position: 'absolute',
    left: 4,
  },
  nav_button_next: {
    position: 'absolute',
    right: 4,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  head_row: {
    display: 'flex',
  },
  head_cell: {
    color: '#999999',
    width: 36,
    fontWeight: 400,
    fontSize: '0.8rem',
    textAlign: 'center',
  },
  row: {
    display: 'flex',
    width: '100%',
    marginTop: 8,
  },
  cell: {
    height: 36,
    width: 36,
    textAlign: 'center',
    fontSize: '0.875rem',
    padding: 0,
    position: 'relative',
  },
  day: {
    height: 36,
    width: 36,
    padding: 0,
    fontWeight: 400,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  day_selected: {
    backgroundColor: '#333333',
    color: '#ffffff',
  },
  day_today: {
    backgroundColor: '#f5f5f5',
    color: '#333333',
    fontWeight: 600,
  },
  day_outside: {
    color: '#999999',
    opacity: 0.5,
  },
  day_disabled: {
    color: '#999999',
    opacity: 0.5,
  },
  day_range_middle: {
    backgroundColor: '#f5f5f5',
    color: '#333333',
  },
  day_hidden: {
    visibility: 'hidden',
  },
};

function Calendar({
  showOutsideDays = true,
  style,
  styles: propStyles,
  ...props
}: CalendarProps) {
  return (
    <>
      <DayPicker
        showOutsideDays={showOutsideDays}
        style={{ padding: 12, ...style }}
        styles={{
          ...calendarStyles,
          ...propStyles,
        }}
        components={{
          IconLeft: ({ ..._props }) => <ChevronLeft style={{ height: 16, width: 16 }} />,
          IconRight: ({ ..._props }) => <ChevronRight style={{ height: 16, width: 16 }} />,
        }}
        {...props}
      />
      <style>{`
        .rdp-day:hover:not([disabled]):not(.rdp-day_selected) {
          background-color: #f5f5f5;
        }
        .rdp-day_selected {
          background-color: #333333 !important;
          color: #ffffff !important;
        }
        .rdp-day_selected:hover {
          background-color: #333333 !important;
          color: #ffffff !important;
        }
        .rdp-day_selected:focus {
          background-color: #333333 !important;
          color: #ffffff !important;
        }
        .rdp-nav_button:hover {
          opacity: 1;
        }
        .rdp-day_range_start {
          background-color: #333333 !important;
          color: #ffffff !important;
        }
        .rdp-day_range_end {
          background-color: #333333 !important;
          color: #ffffff !important;
        }
        .rdp-day_range_middle {
          background-color: #f5f5f5 !important;
          color: #333333 !important;
        }
      `}</style>
    </>
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
