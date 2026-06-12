import { DatePickerWithRange } from 'queer-guide';

/* HARNESS SHIM — see Input.tsx / learnings/wave-forms.md. Restores the
   production (flattened-layer) border rendering the harness CSS loses
   (the outline trigger button is borderless without it). */
const BorderFix = () => (
  <style>{`
    .border{border-width:1px}
    .border-foreground\\/15{border-color:hsl(var(--foreground)/.15)}
    .border-border\\/60{border-color:hsl(var(--border)/.6)}
  `}</style>
);

export const WithRange = () => (
  <>
    <BorderFix />
    <DatePickerWithRange
      date={{ from: new Date(2026, 5, 12), to: new Date(2026, 5, 21) }}
    />
  </>
);

export const StartOnly = () => (
  <>
    <BorderFix />
    <DatePickerWithRange date={{ from: new Date(2026, 5, 12) }} />
  </>
);

export const Empty = () => (
  <>
    <BorderFix />
    <DatePickerWithRange />
  </>
);
