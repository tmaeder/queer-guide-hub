import { cn } from '@/lib/utils';

/** Lowercase Anton wordmark. Ink only — no color anywhere in the mark.
 *
 *  There WAS a pink heart nested at the descender of the g; it is gone
 *  deliberately, so do not re-add it. The mark now follows the same
 *  black-only rule as `MasterSymbol`: ink on paper, or reversed. That also
 *  removes the wordmark's dependence on Anton's own metrics — the heart had
 *  to be positioned by a hand-measured `right-[2.02em]` offset that only
 *  held for this exact string in this exact face at this exact tracking.
 *
 *  `cn()` (tailwind-merge), NOT a template string: the base sets
 *  `inline-block`, and a caller passing `hidden` to drop the wordmark on
 *  narrow screens landed BOTH classes with neither reliably winning —
 *  measured `display: block`, so the wordmark stayed visible and kept
 *  squeezing the mobile search field. Merging lets the caller's utility
 *  replace the base one, which is the whole point of accepting a className. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-block font-display lowercase leading-none tracking-tight', className)}
    >
      queer.guide
    </span>
  );
}
