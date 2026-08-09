/** Hero network: four bending track lines with station rings + labels.
 *  Geometry from the Front Page template; colors via track tokens. */
export function TrackLines() {
  return (
    <svg viewBox="0 0 1440 320" className="mt-12 block w-full" aria-hidden>
      <g fill="none" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M -20 80 C 140 50 260 120 400 100 C 540 80 620 160 730 165 C 840 170 900 90 1040 80 C 1180 70 1320 100 1460 76"
          stroke="hsl(var(--track-pink))"
        />
        <path
          d="M -20 260 C 140 285 280 225 420 240 C 560 255 640 172 730 168 C 830 164 900 255 1040 260 C 1170 265 1320 235 1460 258"
          stroke="hsl(var(--track-blue))"
        />
        <path
          d="M -20 170 C 160 152 300 182 440 172 C 570 163 650 165 730 166 C 860 167 980 150 1120 162 C 1240 172 1360 152 1460 166"
          stroke="hsl(var(--track-green))"
        />
        <path
          d="M -20 212 C 120 200 240 222 360 210 C 480 199 580 176 700 176 C 820 176 880 214 1000 210 C 1120 206 1300 218 1460 202"
          stroke="hsl(var(--track-yellow))"
        />
      </g>
      <g fill="hsl(var(--background))" stroke="hsl(var(--foreground))" strokeWidth={5}>
        <circle cx={400} cy={100} r={10} />
        <circle cx={420} cy={240} r={10} />
        <circle cx={730} cy={167} r={15} strokeWidth={6} />
        <circle cx={1040} cy={80} r={10} />
        <circle cx={1040} cy={260} r={10} />
      </g>
      <g fontSize={17} fontWeight={700} fill="hsl(var(--foreground))">
        <text x={400} y={72} textAnchor="middle">You are here</text>
        <text x={730} y={134} textAnchor="middle">Intersection</text>
        <text x={1040} y={52} textAnchor="middle">Community</text>
      </g>
    </svg>
  );
}
