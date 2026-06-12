import { Popover, PopoverTrigger, PopoverContent, Button } from 'queer-guide';
import { Info } from 'lucide-react';

// Capture harness freezes the page clock — settle Radix enter animations.
// Also restores border-widths: src/index.css ships an UNLAYERED *{border-width:0}
// reset (leftover of the reverted MUI migration) that beats every @layer
// utilities border-width — re-assert utility widths so 1px chrome renders as
// designed. Root-cause fix tracked separately (see learnings/wave-overlays.md).
const Settle = () => (
  <style>{`*,*::before,*::after{animation:none!important;transition:none!important}
.border{border-width:1px}.border-2{border-width:2px}.border-b{border-bottom-width:1px}.border-t{border-top-width:1px}.border-l{border-left-width:1px}.border-r{border-right-width:1px}`}</style>
);

export const SafetyOverviewPopover = () => (
  <>
    <Settle />
    <div className="flex h-[380px] items-start justify-center pt-8">
      <Popover open>
        <PopoverTrigger asChild>
          <Button variant="outline">
            <Info /> Safety overview
          </Button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="center">
          <div className="space-y-2">
            <p className="text-sm font-semibold">Portugal — legal protections</p>
            <p className="text-sm text-muted-foreground">
              Same-sex marriage since 2010. Anti-discrimination law covers employment, goods and
              services. Equality score 89/100.
            </p>
            <p className="text-13 text-muted-foreground">Last verified May 2026</p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  </>
);
