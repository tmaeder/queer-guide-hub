import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from 'queer-guide';

// Capture harness freezes the page clock — settle Radix enter animations.
// Also restores border-widths: src/index.css ships an UNLAYERED *{border-width:0}
// reset (leftover of the reverted MUI migration) that beats every @layer
// utilities border-width — re-assert utility widths so 1px chrome renders as
// designed. Root-cause fix tracked separately (see learnings/wave-overlays.md).
const Settle = () => (
  <style>{`*,*::before,*::after{animation:none!important;transition:none!important}
.border{border-width:1px}.border-2{border-width:2px}.border-b{border-bottom-width:1px}.border-t{border-top-width:1px}.border-l{border-left-width:1px}.border-r{border-right-width:1px}`}</style>
);

export const DeleteTripConfirm = () => (
  <>
    <Settle />
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this trip?</AlertDialogTitle>
          <AlertDialogDescription>
            “Lisbon Long Weekend” and its 12 saved venues will be permanently removed. This cannot
            be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep trip</AlertDialogCancel>
          <AlertDialogAction>Delete trip</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
);
