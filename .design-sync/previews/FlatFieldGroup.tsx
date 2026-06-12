import {
  FlatFieldGroup,
  FlatField,
  Input,
  Textarea,
  Switch,
  Checkbox,
  Label,
} from 'queer-guide';

/* HARNESS SHIM — see Input.tsx / learnings/wave-forms.md. Restores the
   production (flattened-layer) border rendering the harness CSS loses
   (this component's whole hierarchy device is a thin top border). */
const BorderFix = () => (
  <style>{`
    .border{border-width:1px}.border-t{border-top-width:1px}.border-2{border-width:2px}
    .border-input{border-color:hsl(var(--input))}.border-border{border-color:hsl(var(--border))}
    .border-primary{border-color:hsl(var(--primary))}.border-transparent{border-color:transparent}
  `}</style>
);

export const ProfileSection = () => (
  <div className="w-80">
    <BorderFix />
    <FlatFieldGroup
      noTopBorder
      title="Travel profile"
      description="Shown to hosts and travel buddies you connect with."
    >
      <FlatField label="Display name" htmlFor="ffg-name">
        <Input id="ffg-name" defaultValue="Sam K." className="w-full" />
      </FlatField>
      <FlatField label="Pronouns" htmlFor="ffg-pronouns" hint="Optional — never shown in unsafe regions.">
        <Input id="ffg-pronouns" defaultValue="they/them" className="w-full" />
      </FlatField>
      <FlatField label="About" htmlFor="ffg-about">
        <Textarea id="ffg-about" defaultValue="Slow traveler, queer history nerd, always up for a drag brunch." />
      </FlatField>
    </FlatFieldGroup>
  </div>
);

export const PrivacySection = () => (
  <div className="w-80">
    <BorderFix />
    <FlatFieldGroup
      title="Privacy"
      description="Hierarchy via border and typography only — used for sensitive settings."
    >
      <div className="flex items-center justify-between">
        <Label htmlFor="ffg-discreet">Discreet app icon</Label>
        <Switch id="ffg-discreet" defaultChecked />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="ffg-location">Hide my exact location</Label>
        <Switch id="ffg-location" defaultChecked />
      </div>
    </FlatFieldGroup>
  </div>
);

export const DenseSection = () => (
  <div className="w-80">
    <BorderFix />
    <FlatFieldGroup dense title="Content warnings" description="Blur these topics in my feed.">
      {[
        ['cw-violence', 'Anti-LGBTQ+ violence in news', true],
        ['cw-politics', 'Hostile legislation updates', false],
        ['cw-medical', 'Medical content', false],
      ].map(([id, label, checked]) => (
        <div key={id as string} className="flex items-center gap-2 py-1">
          <Checkbox id={id as string} defaultChecked={checked as boolean} />
          <Label htmlFor={id as string}>{label as string}</Label>
        </div>
      ))}
    </FlatFieldGroup>
  </div>
);
