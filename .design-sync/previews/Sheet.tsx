import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Button,
  Checkbox,
  Label,
} from 'queer-guide';

// Capture harness freezes the page clock — settle slide-in/transition state.
// Also restores border-widths: src/index.css ships an UNLAYERED *{border-width:0}
// reset (leftover of the reverted MUI migration) that beats every @layer
// utilities border-width — re-assert utility widths so 1px chrome renders as
// designed. Root-cause fix tracked separately (see learnings/wave-overlays.md).
const Settle = () => (
  <style>{`*,*::before,*::after{animation:none!important;transition:none!important}
.border{border-width:1px}.border-2{border-width:2px}.border-b{border-bottom-width:1px}.border-t{border-top-width:1px}.border-l{border-left-width:1px}.border-r{border-right-width:1px}`}</style>
);

export const VenueFilterSheet = () => (
  <>
    <Settle />
    <Sheet open>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Filter venues</SheetTitle>
          <SheetDescription>Narrow the Berlin list by category and amenities.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-6">
          <p className="text-13 font-semibold uppercase tracking-wide text-muted-foreground">
            Category
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox id="f-bars" defaultChecked />
              <Label htmlFor="f-bars">Bars &amp; nightlife</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="f-cafes" defaultChecked />
              <Label htmlFor="f-cafes">Cafés</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="f-community" />
              <Label htmlFor="f-community">Community centers</Label>
            </div>
          </div>
          <p className="text-13 font-semibold uppercase tracking-wide text-muted-foreground">
            Amenities
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox id="f-access" defaultChecked />
              <Label htmlFor="f-access">Wheelchair accessible</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="f-terrace" />
              <Label htmlFor="f-terrace">Outdoor seating</Label>
            </div>
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline">Reset</Button>
          <Button>Show 24 venues</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </>
);
