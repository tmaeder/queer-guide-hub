/** The two crossing lines that open the footer, with station rings at each
 *  crossing — "the page ends on the same metaphor it started with"
 *  (Header and Footer.dc.html, panel 06). Geometry verbatim from the spec. */
export function FooterTracks() {
  return (
    <svg viewBox="0 0 1160 90" className="block w-full" aria-hidden>
      <path
        d="M 10 62 C 120 62 190 26 320 24 C 460 22 540 66 680 64 C 820 62 900 28 1150 22"
        fill="none"
        stroke="hsl(var(--track-pink))"
        strokeWidth={9}
        strokeLinecap="round"
      />
      <path
        d="M 10 34 C 140 34 200 70 340 72 C 480 74 560 38 700 36 C 840 34 960 66 1150 58"
        fill="none"
        stroke="hsl(var(--track-blue))"
        strokeWidth={9}
        strokeLinecap="round"
      />
      <circle cx={320} cy={24} r={11} fill="hsl(var(--foreground))" stroke="hsl(var(--background))" strokeWidth={5} />
      <circle cx={700} cy={36} r={11} fill="hsl(var(--foreground))" stroke="hsl(var(--background))" strokeWidth={5} />
    </svg>
  );
}
