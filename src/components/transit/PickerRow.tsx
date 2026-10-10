import * as React from 'react';
import { StationRing } from '@/components/transit/StationRing';

/**
 * One row of a popover list — the shared option row for every facet picker.
 *
 * Lifted out of MarketplaceControlBar, which had it private, when
 * AttributeFacetGroups needed the same row. A second copy would have been the
 * third thing in this repo to re-implement a chip/row primitive; the first two
 * (FilterChip, the control bar's own FacetChip) already collapsed into one.
 *
 * No explicit height: `index.css` gives every bare <button> `min-height: 44px`,
 * which is the WCAG 2.5.8 target this row relies on. Do not add `min-h-0`.
 */
export function PickerRow({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className="group flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-foreground hover:text-background"
      onClick={onClick}
    >
      {children}
      {/* The row fills ink on hover, so a `done` ring (which is also ink) would
          vanish into it — it flips to paper for the hovered row. */}
      {selected && (
        <StationRing
          state="done"
          className="border shrink-0 group-hover:border-background group-hover:bg-background"
        />
      )}
    </button>
  );
}
