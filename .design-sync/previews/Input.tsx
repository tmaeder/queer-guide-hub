import { Input, Label } from 'queer-guide';

/* HARNESS SHIM — not part of the preview composition. The DS bundle CSS
   (built with the tailwindcss CLI) preserves @layer, so the app's unlayered
   universal reset (src/index.css:382 `*{border-width:0}`) outranks every
   layered border utility and all 1px borders vanish. The production build
   flattens layers, so borders DO render on queer.guide. These unlayered
   rules restore exactly the production outcome. Remove once the harness
   buildCmd flattens layers (see .design-sync/learnings/wave-forms.md). */
const BorderFix = () => (
  <style>{`
    .border{border-width:1px}.border-2{border-width:2px}.border-t{border-top-width:1px}
    .border-input{border-color:hsl(var(--input))}.border-primary{border-color:hsl(var(--primary))}
    .border-primary\\/50{border-color:hsl(var(--primary)/.5)}.border-border{border-color:hsl(var(--border))}
    .border-border\\/60{border-color:hsl(var(--border)/.6)}.border-foreground\\/15{border-color:hsl(var(--foreground)/.15)}
    .border-transparent{border-color:transparent}
  `}</style>
);

export const Default = () => (
  <div className="w-80">
    <BorderFix />
    <Input placeholder="Search venues in Berlin…" />
  </div>
);

export const InputTypes = () => (
  <div className="flex w-80 flex-col gap-4">
    <BorderFix />
    <Input type="email" defaultValue="alex@queer.guide" aria-label="Email" />
    <Input type="password" defaultValue="rainbow-route-2026" aria-label="Password" />
    <Input type="number" defaultValue={4} min={1} max={12} aria-label="Travelers" />
  </div>
);

export const Disabled = () => (
  <div className="flex w-80 flex-col gap-4">
    <BorderFix />
    <Input disabled placeholder="City locked while trip is published" />
    <Input disabled defaultValue="Barcelona, Spain" aria-label="Destination" />
  </div>
);

export const FieldComposition = () => (
  <div className="flex w-80 flex-col gap-2">
    <BorderFix />
    <Label htmlFor="trip-name">Trip name</Label>
    <Input id="trip-name" defaultValue="Pride week in Amsterdam" />
    <p className="text-xs text-muted-foreground">Visible to invited travel buddies only.</p>
  </div>
);
