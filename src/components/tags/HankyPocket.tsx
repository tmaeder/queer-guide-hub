import { HANKY_FOLD, HANKY_POCKET } from '@/lib/flags';

export type PocketSide = 'left' | 'right' | 'both' | null;

interface HankyPocketProps {
  /** Hanky colour; omitted for the empty pocket ("no code shown"). */
  color?: string;
  side: PocketSide;
  /** Rendered width in px; stitching drops out below 30px, as the design spec says. */
  size?: number;
  className?: string;
}

/**
 * The hanky-code pocket from the design system: fixed denim and stitching,
 * the hanky folded out of the left (giving) or right (receiving) side.
 * Decorative; the colour name and side are always written next to it.
 */
export function HankyPocket({ color, side, size = 44, className }: HankyPocketProps) {
  const folds = side === 'both' ? (['left', 'right'] as const) : side ? [side] : [];
  const stroke = size < 30 ? 5 : 4;
  return (
    <svg
      viewBox="0 0 100 95"
      width={size}
      height={(size * 95) / 100}
      aria-hidden="true"
      className={className}
    >
      <path
        d="M 8 8 H 92 V 62 L 50 88 L 8 62 Z"
        fill={HANKY_POCKET.denim}
        stroke={HANKY_POCKET.ink}
        strokeWidth={stroke}
        strokeLinejoin="round"
      />
      <path
        d="M 8 8 H 92 V 19 H 8 Z"
        fill={HANKY_POCKET.denimBand}
        stroke={HANKY_POCKET.ink}
        strokeWidth={stroke}
        strokeLinejoin="round"
      />
      {size >= 30 && (
        <path
          d="M 15 25 V 59 L 50 80 L 85 59 V 25"
          fill="none"
          stroke={HANKY_POCKET.stitch}
          strokeWidth={2.5}
          strokeDasharray="5 5"
        />
      )}
      {color &&
        folds.map((s) => (
          <g key={s} stroke={HANKY_POCKET.ink} strokeWidth={stroke} strokeLinejoin="round">
            <polygon points={HANKY_FOLD[s].a} fill={color} />
            <polygon points={HANKY_FOLD[s].b} fill={color} />
            {/* the far fold sits in shadow, like brightness(0.86) in the spec */}
            <polygon
              points={HANKY_FOLD[s].b}
              fill={HANKY_POCKET.ink}
              fillOpacity={0.14}
              stroke="none"
            />
          </g>
        ))}
    </svg>
  );
}
