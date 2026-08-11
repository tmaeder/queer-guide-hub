/** "Cupid's transit" master symbol. Black-only rule: ink on paper or reversed
 *  (paper on ink) via currentColor — the mark never takes track colors.
 *
 *  Three things here are design-system rules, not taste:
 *
 *  - **Both tracks bend.** Hard rule #1 of the subway map is that an
 *    illustrative line is never straight. The entry ran dead straight
 *    (`H 134`) with its arrowhead stranded mid-shaft while only the exit
 *    wavered, so the mark broke the one rule it is supposed to embody.
 *  - **Stroke 15 in a 354-unit box (~4.2%)** — the mark sits inline beside
 *    `TransitIcon` (9–11 in a 100-unit box) and the Anton wordmark. At the
 *    old 12/360 the header mark rendered ~1.3px strokes next to 2.4px icons
 *    and read as a different, lighter system. 18 clogs the heart's counter.
 *  - **The viewBox is trimmed to the ink** (`0 24 354 190`, ~10 units of pad
 *    on all four sides). The old `0 0 360 210` left 35 units of dead space
 *    above the mark and 8 below, so `w-10` in the header spent a third of
 *    its height on nothing and hung the mark low in its own box.
 *
 *  The geometry is duplicated in `scripts/generate-brand-assets.mjs` (OG
 *  image) and, cropped to the heart, in `public/favicon.svg`; the three are
 *  pinned together by `__tests__/brandAssetSync.test.ts`. */
export function MasterSymbol({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 24 354 190"
      className={className}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={15}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M 18 112 C 40 88 62 130 84 106 C 94 94 104 106 114 106" />
        <path d="M 96 90 L 120 106 L 96 122" />
        <path d="M 180 158 C 152 136 132 116 132 96 C 132 79 145 68 159 68 C 172 68 180 78 180 89 C 180 78 188 68 201 68 C 215 68 228 79 228 96 C 228 116 208 136 180 158 Z" />
        <path d="M 219.8 75.6 L 248 41 M 248 41 L 226 41 M 248 41 L 248 63" />
        <path d="M 180 158 L 180 196 M 165 180 L 195 180" />
        <path d="M 225.7 108 C 250 80 266 132 288 104 C 296 94 306 90 318 93 L 336 89 M 336 89 L 312 75 M 336 89 L 310 105" />
      </g>
    </svg>
  );
}
