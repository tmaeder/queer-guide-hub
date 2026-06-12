import { Checkbox, Label } from 'queer-guide';

/* HARNESS SHIM — see Input.tsx / learnings/wave-forms.md. Restores the
   production (flattened-layer) border rendering the harness CSS loses. */
const BorderFix = () => (
  <style>{`
    .border{border-width:1px}
    .border-primary{border-color:hsl(var(--primary))}
  `}</style>
);

export const States = () => (
  <div className="flex items-center gap-6">
    <BorderFix />
    <Checkbox aria-label="Unchecked" />
    <Checkbox defaultChecked aria-label="Checked" />
    <Checkbox disabled aria-label="Disabled" />
    <Checkbox disabled defaultChecked aria-label="Disabled checked" />
  </div>
);

export const InterestList = () => (
  <div className="flex w-80 flex-col gap-2">
    <BorderFix />
    {[
      ['bars', 'Bars & nightlife', true],
      ['culture', 'Queer history & culture', true],
      ['outdoors', 'Beaches & outdoors', false],
      ['festivals', 'Pride festivals', true],
    ].map(([id, label, checked]) => (
      <div key={id as string} className="flex items-center gap-2">
        <Checkbox id={id as string} defaultChecked={checked as boolean} />
        <Label htmlFor={id as string}>{label as string}</Label>
      </div>
    ))}
  </div>
);

export const WithDescription = () => (
  <div className="flex w-80 items-start gap-2">
    <BorderFix />
    <Checkbox id="anon-review" className="mt-1" defaultChecked />
    <div className="flex flex-col gap-1">
      <Label htmlFor="anon-review">Post review anonymously</Label>
      <p className="text-xs text-muted-foreground">
        Your name is hidden everywhere, including in countries where being out is unsafe.
      </p>
    </div>
  </div>
);
