import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Label,
} from 'queer-guide';

// Capture harness freezes the page clock — Radix enter animations (fade-in-0,
// zoom-in-95) would hold the dialog at opacity 0. Settle everything.
// Also restores border-widths: src/index.css ships an UNLAYERED *{border-width:0}
// reset (leftover of the reverted MUI migration) that beats every @layer
// utilities border-width — re-assert utility widths so 1px chrome renders as
// designed. Root-cause fix tracked separately (see learnings/wave-overlays.md).
const Settle = () => (
  <style>{`*,*::before,*::after{animation:none!important;transition:none!important}
.border{border-width:1px}.border-2{border-width:2px}.border-b{border-bottom-width:1px}.border-t{border-top-width:1px}.border-l{border-left-width:1px}.border-r{border-right-width:1px}`}</style>
);

export const ShareTripDialog = () => (
  <>
    <Settle />
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share trip</DialogTitle>
          <DialogDescription>
            Anyone with the link can view your Berlin Pride itinerary. Venues you marked private
            stay hidden.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="trip-link">Link</Label>
          <Input id="trip-link" readOnly value="https://queer.guide/trips/berlin-pride-2026" />
        </div>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Copy link</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
);
