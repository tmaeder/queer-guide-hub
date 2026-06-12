import { Switch, Label } from 'queer-guide';

/* HARNESS SHIM — see Input.tsx / learnings/wave-forms.md. Restores the
   production (flattened-layer) border rendering the harness CSS loses. */
const BorderFix = () => (
  <style>{`
    .border-2{border-width:2px}
    .border-transparent{border-color:transparent}
  `}</style>
);

export const States = () => (
  <div className="flex items-center gap-6">
    <BorderFix />
    <Switch aria-label="Off" />
    <Switch defaultChecked aria-label="On" />
    <Switch disabled aria-label="Disabled off" />
    <Switch disabled defaultChecked aria-label="Disabled on" />
  </div>
);

export const SettingsRows = () => (
  <div className="flex w-80 flex-col gap-4">
    <BorderFix />
    <div className="flex items-center justify-between">
      <Label htmlFor="safety-alerts">Safety alerts for my destinations</Label>
      <Switch id="safety-alerts" defaultChecked />
    </div>
    <div className="flex items-center justify-between">
      <Label htmlFor="event-reminders">Event reminders</Label>
      <Switch id="event-reminders" defaultChecked />
    </div>
    <div className="flex items-center justify-between">
      <Label htmlFor="public-profile">Show my profile to other travelers</Label>
      <Switch id="public-profile" />
    </div>
  </div>
);

export const WithDescription = () => (
  <div className="flex w-80 items-center justify-between gap-4">
    <BorderFix />
    <div className="flex flex-col gap-1">
      <Label htmlFor="discreet-mode">Discreet mode</Label>
      <p className="text-xs text-muted-foreground">
        Hides queer content when your screen is visible to others.
      </p>
    </div>
    <Switch id="discreet-mode" defaultChecked />
  </div>
);
