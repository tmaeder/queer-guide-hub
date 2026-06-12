import { Calendar } from 'queer-guide';

export const SingleDate = () => (
  <Calendar
    mode="single"
    selected={new Date(2026, 5, 27)}
    defaultMonth={new Date(2026, 5)}
  />
);

export const TripRange = () => (
  <Calendar
    mode="range"
    selected={{ from: new Date(2026, 5, 12), to: new Date(2026, 5, 21) }}
    defaultMonth={new Date(2026, 5)}
  />
);

export const DisabledDates = () => (
  <Calendar
    mode="single"
    selected={new Date(2026, 5, 18)}
    defaultMonth={new Date(2026, 5)}
    disabled={{ before: new Date(2026, 5, 10) }}
  />
);
