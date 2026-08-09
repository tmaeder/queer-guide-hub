/** Lowercase Anton wordmark with the heart nested at the descender of the g.
 *  The heart is the one place the mark takes color (track pink). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`relative inline-block font-display lowercase leading-none tracking-tight ${className ?? ''}`}>
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
