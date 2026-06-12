import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from 'queer-guide';
import { MapPin, CalendarDays } from 'lucide-react';

// Capture harness freezes the page clock — settle any enter animations.
// Also restores border-widths: src/index.css ships an UNLAYERED *{border-width:0}
// reset (leftover of the reverted MUI migration) that beats every @layer
// utilities border-width — re-assert utility widths so 1px chrome renders as
// designed. Root-cause fix tracked separately (see learnings/wave-overlays.md).
const Settle = () => (
  <style>{`*,*::before,*::after{animation:none!important;transition:none!important}
.border{border-width:1px}.border-2{border-width:2px}.border-b{border-bottom-width:1px}.border-t{border-top-width:1px}.border-l{border-left-width:1px}.border-r{border-right-width:1px}`}</style>
);

export const CitySearchPalette = () => (
  <>
    <Settle />
    <div className="mx-auto w-[520px] overflow-hidden rounded-container border border-border/60 bg-popover">
      <Command value="berlin">
        <CommandInput placeholder="Search cities, venues, events…" />
        <CommandList>
          <CommandEmpty>No results yet.</CommandEmpty>
          <CommandGroup heading="Cities">
            <CommandItem value="berlin">
              <MapPin className="mr-2 h-4 w-4" />
              Berlin, Germany
              <CommandShortcut>142 venues</CommandShortcut>
            </CommandItem>
            <CommandItem value="lisbon">
              <MapPin className="mr-2 h-4 w-4" />
              Lisbon, Portugal
              <CommandShortcut>58 venues</CommandShortcut>
            </CommandItem>
            <CommandItem value="mexico-city">
              <MapPin className="mr-2 h-4 w-4" />
              Mexico City, Mexico
              <CommandShortcut>86 venues</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Upcoming events">
            <CommandItem value="berlin-pride">
              <CalendarDays className="mr-2 h-4 w-4" />
              Berlin Pride / CSD
              <CommandShortcut>Jul 25</CommandShortcut>
            </CommandItem>
            <CommandItem value="folsom-europe">
              <CalendarDays className="mr-2 h-4 w-4" />
              Folsom Europe
              <CommandShortcut>Sep 12</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  </>
);
