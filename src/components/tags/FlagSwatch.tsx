/**
 * FlagSwatch — renders a PrideFlag as SVG from its stripe + overlay data.
 *
 * Every colour comes in through the flag record (`src/lib/flags/`, the
 * ESLint-allowlisted home of the hexes); this component holds no colour
 * literals of its own. The frame is the standard ink border — a flag is a
 * fill, and fills are border-gated.
 *
 * Geometry is a 5:3 field (500×300 viewBox), the most common pride-flag
 * ratio. Overlays cover the five known non-stripe designs: the Progress
 * chevron, the intersex ring, the demisexual hoist triangle, the leather
 * heart, the bear paw. A new overlay kind is a data + render change here,
 * never a per-flag SVG file.
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { PrideFlag } from '@/lib/flags';

const W = 500;
const H = 300;

/** Classic heart via two circles + a square rotated 45° is fiddly in raw
 *  paths; this is a single cubic-bezier heart normalized to a 100×100 box. */
const HEART_PATH =
  'M50 88 C20 64 4 46 4 28 C4 12 16 2 29 2 C38 2 46 7 50 15 C54 7 62 2 71 2 C84 2 96 12 96 28 C96 46 80 64 50 88 Z';

function Overlay({ flag }: { flag: PrideFlag }) {
  const o = flag.overlay;
  if (!o) return null;
  switch (o.kind) {
    case 'chevron': {
      // Data order is hoist-outward (white innermost). Paint solid chevrons
      // largest-first; each smaller one on top leaves the one below visible
      // as a 45°-edged band. Band k reaches k*BAND along the top edge and
      // its tip sits H/2 further right.
      const BAND = 26;
      const n = o.colors.length;
      return (
        <>
          {[...o.colors].reverse().map((hex, i) => {
            const k = n - 1 - i;
            const a = k * BAND;
            return (
              <polygon
                key={k}
                points={`0,0 ${a},0 ${a + H / 2},${H / 2} ${a},${H} 0,${H}`}
                fill={hex}
              />
            );
          })}
        </>
      );
    }
    case 'circle':
      return (
        <circle
          cx={W / 2}
          cy={H / 2}
          r={H * 0.24}
          fill="none"
          stroke={o.ringHex}
          strokeWidth={H * 0.09}
        />
      );
    case 'triangle':
      return <polygon points={`0,0 ${W * 0.3},${H / 2} 0,${H}`} fill={o.hex} />;
    case 'heart':
      return (
        <path
          d={HEART_PATH}
          fill={o.hex}
          transform={`translate(${W * 0.03}, ${H * 0.04}) scale(${(H * 0.42) / 100})`}
        />
      );
    case 'paw': {
      // Simplified paw print in the fly-side upper corner: pad + four toes.
      const u = H / 100;
      const cx = W * 0.82;
      const cy = H * 0.3;
      return (
        <g fill={o.hex}>
          <ellipse cx={cx} cy={cy + 8 * u} rx={10 * u} ry={8 * u} />
          <ellipse cx={cx - 11 * u} cy={cy - 1 * u} rx={3.5 * u} ry={5 * u} />
          <ellipse cx={cx - 4 * u} cy={cy - 6 * u} rx={3.5 * u} ry={5 * u} />
          <ellipse cx={cx + 4 * u} cy={cy - 6 * u} rx={3.5 * u} ry={5 * u} />
          <ellipse cx={cx + 11 * u} cy={cy - 1 * u} rx={3.5 * u} ry={5 * u} />
        </g>
      );
    }
  }
}

export function FlagSwatch({
  flag,
  decorative = false,
  className,
}: {
  flag: PrideFlag;
  /** True when adjacent text already names the flag — hides it from AT. */
  decorative?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const weights = flag.stripes.map((s) => s.weight ?? 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  // Pure prefix-sum so render mutates nothing: stripe i starts where the
  // weights before it end.
  const offsets = weights.map((_, i) => weights.slice(0, i).reduce((a, b) => a + b, 0));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn('block h-auto w-full border-2 border-foreground', className)}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : t(flag.nameKey, flag.nameEn)}
      aria-hidden={decorative || undefined}
    >
      {flag.stripes.map((stripe, i) => (
        <rect
          key={i}
          x={0}
          y={(H * offsets[i]) / totalWeight}
          width={W}
          height={(H * (stripe.weight ?? 1)) / totalWeight}
          fill={stripe.hex}
        />
      ))}
      <Overlay flag={flag} />
    </svg>
  );
}
