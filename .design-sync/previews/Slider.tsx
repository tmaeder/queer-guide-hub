import { Slider, Label } from 'queer-guide';

/* HARNESS SHIM — see Input.tsx / learnings/wave-forms.md. Restores the
   production (flattened-layer) border rendering the harness CSS loses
   (the slider thumb is white with only a border — invisible without it). */
const BorderFix = () => (
  <style>{`
    .border{border-width:1px}
    .border-primary\\/50{border-color:hsl(var(--primary)/.5)}
    [data-disabled]{opacity:.5}
  `}</style>
);

export const Default = () => (
  <div className="w-80">
    <BorderFix />
    <Slider defaultValue={[40]} max={100} step={1} aria-label="Search radius" />
  </div>
);

export const RangeWithLabels = () => (
  <div className="flex w-80 flex-col gap-2">
    <BorderFix />
    <div className="flex items-center justify-between">
      <Label>Nightly budget</Label>
      <span className="text-sm text-muted-foreground">€60 – €180</span>
    </div>
    <Slider defaultValue={[60, 180]} min={0} max={400} step={10} aria-label="Nightly budget range" />
  </div>
);

export const Steps = () => (
  <div className="flex w-80 flex-col gap-2">
    <BorderFix />
    <div className="flex items-center justify-between">
      <Label>Walking distance to venues</Label>
      <span className="text-sm text-muted-foreground">2 km</span>
    </div>
    <Slider defaultValue={[2]} min={0} max={10} step={0.5} aria-label="Walking distance" />
  </div>
);

export const Disabled = () => (
  <div className="w-80">
    <BorderFix />
    <Slider disabled defaultValue={[70]} max={100} aria-label="Disabled slider" />
  </div>
);
