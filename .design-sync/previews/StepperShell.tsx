import { StepperShell, Input, Label } from 'queer-guide';
import { StaticState } from './_static';

const steps = [
  { id: 'destination', label: 'Destination', description: 'Where are you headed?' },
  { id: 'dates', label: 'Travel dates', description: 'Pick your window' },
  { id: 'safety', label: 'Safety briefing', description: 'Local laws & tips' },
  { id: 'review', label: 'Review trip', description: 'Confirm and save' },
];

export const TripPlannerStepper = () => (
  <StepperShell steps={steps} current={1} className="min-h-0">
    <StaticState />
    <div className="max-w-md space-y-6">
      <div>
        <h2 className="text-headline font-semibold">When are you traveling?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          We use your dates to surface Pride weeks and recurring queer nights.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="dep">Departure</Label>
        <Input id="dep" defaultValue="2026-07-18" readOnly />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ret">Return</Label>
        <Input id="ret" defaultValue="2026-07-26" readOnly />
      </div>
    </div>
  </StepperShell>
);

export const DiscreetModeStepper = () => (
  <StepperShell
    steps={steps}
    current={2}
    variant="discreet"
    showSkip
    onSkip={() => {}}
    className="min-h-0"
  >
    <StaticState />
    <div className="space-y-4">
      <h2 className="text-headline font-semibold">Safety briefing — Marrakech</h2>
      <p className="text-sm text-muted-foreground">
        Same-sex relations are criminalized under Article 489. This step summarizes what
        that means in practice and how locals stay safe.
      </p>
      <ul className="list-disc space-y-2 pl-6 text-sm text-muted-foreground">
        <li>Keep dating apps off local networks.</li>
        <li>Book verified couple-friendly accommodation.</li>
        <li>Save the emergency contacts card offline.</li>
      </ul>
    </div>
  </StepperShell>
);
