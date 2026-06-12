// NOTE 1: no <StaticState /> here — its [style*="transform"] override would
// flatten the Progress indicator's inline scaleX() to 100%.
// NOTE 2: the component default track is bg-secondary, which in this theme's
// light mode is 4% black — identical to the bg-primary indicator, so the fill
// level is invisible. Cells override the track to bg-muted (a documented
// consumer-level className override) so the value axis is actually legible.
import { Progress } from 'queer-guide';

export const ValueSweep = () => (
  <div className="w-80 space-y-4">
    {[0, 25, 60, 100].map((v) => (
      <div key={v} className="space-y-1">
        <p className="text-13 text-muted-foreground">{v}%</p>
        <Progress value={v} className="bg-muted" />
      </div>
    ))}
  </div>
);

export const ProfileCompleteness = () => (
  <div className="w-80 space-y-2">
    <div className="flex items-baseline justify-between">
      <p className="text-15 font-medium">City profile completeness</p>
      <span className="text-13 text-muted-foreground">72%</span>
    </div>
    <Progress value={72} className="bg-muted" />
    <p className="text-13 text-muted-foreground">
      Add safety notes and travel tips to reach 100%.
    </p>
  </div>
);

export const ThickVariant = () => (
  <div className="w-80 space-y-2">
    <p className="text-13 text-muted-foreground">Import progress · 1,240 of 3,100 venues</p>
    <Progress value={40} className="h-4 bg-muted" />
  </div>
);
