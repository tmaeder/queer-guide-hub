import { AnimatedBeamConnector } from 'queer-guide';
import { StaticState } from './_static';

export const StepConnector = () => (
  <>
    <StaticState />
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background text-13">
        1
      </div>
      <div className="w-24">
        <AnimatedBeamConnector active orientation="horizontal" />
      </div>
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-13">
        2
      </div>
      <div className="w-24">
        <AnimatedBeamConnector orientation="horizontal" />
      </div>
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-13 text-muted-foreground">
        3
      </div>
    </div>
  </>
);

export const Vertical = () => (
  <>
    <StaticState />
    <div className="flex flex-col items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background text-13">
        1
      </div>
      <div className="h-16">
        <AnimatedBeamConnector active />
      </div>
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-13">
        2
      </div>
    </div>
  </>
);
