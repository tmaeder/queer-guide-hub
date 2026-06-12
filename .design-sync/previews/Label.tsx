import { Input, Label, Checkbox } from 'queer-guide';

/* HARNESS SHIM — see Input.tsx / learnings/wave-forms.md. Restores the
   production (flattened-layer) border rendering the harness CSS loses. */
const BorderFix = () => (
  <style>{`
    .border{border-width:1px}
    .border-input{border-color:hsl(var(--input))}
    .border-primary{border-color:hsl(var(--primary))}
  `}</style>
);

export const WithInput = () => (
  <div className="flex w-80 flex-col gap-2">
    <BorderFix />
    <Label htmlFor="home-city">Home city</Label>
    <Input id="home-city" placeholder="e.g. Madrid" />
  </div>
);

export const WithCheckbox = () => (
  <div className="flex items-center gap-2">
    <BorderFix />
    <Checkbox id="newsletter" defaultChecked />
    <Label htmlFor="newsletter">Send me monthly Pride event digests</Label>
  </div>
);

export const DisabledPeer = () => (
  <div className="flex items-center gap-2">
    <BorderFix />
    <Checkbox id="locked-pref" disabled />
    <Label htmlFor="locked-pref">Share my trip publicly (verify your account first)</Label>
  </div>
);
