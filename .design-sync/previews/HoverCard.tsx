import { HoverCard, HoverCardTrigger, HoverCardContent, Badge } from 'queer-guide';

// Capture harness freezes the page clock — settle Radix enter animations.
// Also restores border-widths: src/index.css ships an UNLAYERED *{border-width:0}
// reset (leftover of the reverted MUI migration) that beats every @layer
// utilities border-width — re-assert utility widths so 1px chrome renders as
// designed. Root-cause fix tracked separately (see learnings/wave-overlays.md).
const Settle = () => (
  <style>{`*,*::before,*::after{animation:none!important;transition:none!important}
.border{border-width:1px}.border-2{border-width:2px}.border-b{border-bottom-width:1px}.border-t{border-top-width:1px}.border-l{border-left-width:1px}.border-r{border-right-width:1px}`}</style>
);

export const CityHoverCard = () => (
  <>
    <Settle />
    <div className="flex h-[380px] items-start justify-center pt-8">
      <HoverCard open>
        <HoverCardTrigger asChild>
          <a href="#mexico-city" className="text-sm font-medium underline">
            Mexico City
          </a>
        </HoverCardTrigger>
        <HoverCardContent side="bottom">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Mexico City</p>
              <Badge variant="outline">Mexico</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Zona Rosa is the heart of queer nightlife; marriage equality nationwide since 2022.
            </p>
            <p className="text-13 text-muted-foreground">86 venues · 14 upcoming events</p>
          </div>
        </HoverCardContent>
      </HoverCard>
    </div>
  </>
);
