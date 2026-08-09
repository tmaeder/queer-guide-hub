/** "Cupid's transit" master symbol. Black-only rule: ink on paper or reversed
 *  (paper on ink) via currentColor — the mark never takes track colors. */
export function MasterSymbol({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 360 210"
      className={className}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <g fill="none" stroke="currentColor" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round">
        <path d="M 16 108 H 134" />
        <path d="M 58 84 L 92 108 L 58 132" />
        <path d="M 180 158 C 152 136 132 116 132 96 C 132 79 145 68 159 68 C 172 68 180 78 180 89 C 180 78 188 68 201 68 C 215 68 228 79 228 96 C 228 116 208 136 180 158 Z" />
        <path d="M 219.8 75.6 L 248 41 M 248 41 L 226 41 M 248 41 L 248 63" />
        <path d="M 180 158 L 180 196 M 165 180 L 195 180" />
        <path d="M 225.7 108 C 250 80 266 132 288 104 C 296 94 306 90 318 93 L 336 89 M 336 89 L 312 75 M 336 89 L 310 105" />
      </g>
    </svg>
  );
}
