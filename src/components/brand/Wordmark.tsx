import { cn } from '@/lib/utils';

/** Lowercase Anton wordmark with the heart nested at the descender of the g.
 *  The heart is the one place the mark takes color (track pink).
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
      className={cn(
        'relative inline-block font-display lowercase leading-none tracking-tight',
        className,
      )}
    >
      queer.guide
      <svg viewBox="0 0 24 22" className="absolute bottom-[-0.12em] right-[1.94em] w-[0.225em]" aria-hidden>
        <path
          d="M12 21 C 5 15 1 10 1 6.5 C 1 3 3.5 1 6.2 1 C 8.6 1 12 3 12 6 C 12 3 15.4 1 17.8 1 C 20.5 1 23 3 23 6.5 C 23 10 19 15 12 21 Z"
          fill="hsl(var(--track-pink))"
        />
      </svg>
    </span>
  );
}
