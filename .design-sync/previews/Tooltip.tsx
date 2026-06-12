import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Button } from 'queer-guide';
import { ShieldCheck } from 'lucide-react';

// Capture harness freezes the page clock — settle Radix enter animations.
// Also restores border-widths: src/index.css ships an UNLAYERED *{border-width:0}
// reset (leftover of the reverted MUI migration) that beats every @layer
// utilities border-width — re-assert utility widths so 1px chrome renders as
// designed. Root-cause fix tracked separately (see learnings/wave-overlays.md).
const Settle = () => (
  <style>{`*,*::before,*::after{animation:none!important;transition:none!important}
.border{border-width:1px}.border-2{border-width:2px}.border-b{border-bottom-width:1px}.border-t{border-top-width:1px}.border-l{border-left-width:1px}.border-r{border-right-width:1px}`}</style>
);

export const VerifiedVenueTooltip = () => (
  <>
    <Settle />
    <div className="flex h-[220px] items-end justify-center pb-8">
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm">
              <ShieldCheck /> Verified venue
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Ownership confirmed by the venue in May 2026</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  </>
);
