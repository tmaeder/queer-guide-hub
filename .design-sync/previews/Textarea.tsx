import { Textarea, Label } from 'queer-guide';

/* HARNESS SHIM — see Input.tsx / learnings/wave-forms.md. Restores the
   production (flattened-layer) border rendering the harness CSS loses. */
const BorderFix = () => (
  <style>{`
    .border{border-width:1px}
    .border-input{border-color:hsl(var(--input))}
  `}</style>
);

export const Default = () => (
  <div className="w-80">
    <BorderFix />
    <Textarea placeholder="Tell other travelers what made this venue feel safe and welcoming…" />
  </div>
);

export const Filled = () => (
  <div className="w-80">
    <BorderFix />
    <Textarea
      defaultValue="SchwuZ is one of Berlin's longest-running queer clubs — three floors, mixed crowd, and staff who actually step in if anyone is hassled. Go on a Friday for the drag shows."
      aria-label="Venue review"
    />
  </div>
);

export const Disabled = () => (
  <div className="w-80">
    <BorderFix />
    <Textarea disabled placeholder="Reviews are closed while this venue is under verification." />
  </div>
);

export const FieldComposition = () => (
  <div className="flex w-80 flex-col gap-2">
    <BorderFix />
    <Label htmlFor="safety-note">Safety note for travelers</Label>
    <Textarea
      id="safety-note"
      defaultValue="Avoid public displays of affection near the main station after dark; the Marais-side venues are relaxed."
    />
    <p className="text-xs text-muted-foreground">Shown on the city safety briefing after review.</p>
  </div>
);
