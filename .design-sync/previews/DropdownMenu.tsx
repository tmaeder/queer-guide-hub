import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  Button,
} from 'queer-guide';
import { MoreHorizontal } from 'lucide-react';

// Capture harness freezes the page clock — settle Radix enter animations.
// Also restores border-widths: src/index.css ships an UNLAYERED *{border-width:0}
// reset (leftover of the reverted MUI migration) that beats every @layer
// utilities border-width — re-assert utility widths so 1px chrome renders as
// designed. Root-cause fix tracked separately (see learnings/wave-overlays.md).
const Settle = () => (
  <style>{`*,*::before,*::after{animation:none!important;transition:none!important}
.border{border-width:1px}.border-2{border-width:2px}.border-b{border-bottom-width:1px}.border-t{border-top-width:1px}.border-l{border-left-width:1px}.border-r{border-right-width:1px}`}</style>
);

export const VenueActionsMenu = () => (
  <>
    <Settle />
    <div className="flex h-[440px] items-start justify-center pt-6">
      <DropdownMenu open modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <MoreHorizontal /> Venue actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" side="bottom" align="start">
          <DropdownMenuLabel>SilverFuture, Berlin</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            Add to trip
            <DropdownMenuShortcut>⌘T</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            Show on map
            <DropdownMenuShortcut>⌘M</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>Copy address</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked>Saved to favorites</DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Report a problem</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </>
);
