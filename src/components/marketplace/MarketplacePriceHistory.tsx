import { useMemo, useRef, useState } from 'react';
import { useMarketplacePriceHistory } from '@/hooks/useMarketplaceQueries';
import { formatCurrency } from '@/lib/currency';

const W = 300;
const H = 60;
const PAD = 4;

/**
 * 90-day price sparkline. Inline SVG — this and BudgetTab were the only two
 * public recharts consumers, and a polyline + nearest-point hover readout
 * doesn't justify shipping a 342KB chart library to the marketplace item page.
 */
export function MarketplacePriceHistory({ listingId }: { listingId: string }) {
  const { data: points } = useMarketplacePriceHistory(listingId, 90);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const geom = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.price_usd);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
    const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
    return {
      min,
      max,
      x,
      y,
      path: values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
    };
  }, [points]);

  if (points.length < 2 || !geom) return null;

  const latest = points[points.length - 1].price_usd;
  const earliest = points[0].price_usd;
  const delta = latest - earliest;
  const deltaPct = earliest > 0 ? (delta / earliest) * 100 : 0;
  const hovered = hover != null ? points[hover] : null;

  return (
    <div className="rounded-container border border-border p-4 bg-card">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-sm font-semibold">Price (90 days)</p>
        <p className={`text-xs ${delta < 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
          {delta < 0 ? '↓' : delta > 0 ? '↑' : '→'} {formatCurrency(Math.abs(delta), 'USD')} ({deltaPct.toFixed(1)}%)
        </p>
      </div>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block w-full"
          style={{ height: H }}
          role="img"
          aria-label={`Price trend: from ${formatCurrency(earliest, 'USD')} to ${formatCurrency(latest, 'USD')}`}
          onMouseMove={(e) => {
            const rect = svgRef.current?.getBoundingClientRect();
            if (!rect) return;
            const frac = (e.clientX - rect.left) / rect.width;
            const i = Math.round(frac * (points.length - 1));
            setHover(Math.max(0, Math.min(points.length - 1, i)));
          }}
          onMouseLeave={() => setHover(null)}
        >
          <path d={geom.path} fill="none" stroke="hsl(var(--foreground))" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          {hovered && hover != null && (
            <circle cx={geom.x(hover)} cy={geom.y(hovered.price_usd)} r={2.5} fill="hsl(var(--foreground))" />
          )}
        </svg>
        {hovered && hover != null && (
          <div
            className="pointer-events-none absolute -top-1 -translate-x-1/2 -translate-y-full rounded-badge border border-border bg-background px-2 py-0.5 text-xs whitespace-nowrap"
            style={{ left: `${(geom.x(hover) / W) * 100}%` }}
          >
            {formatCurrency(hovered.price_usd, 'USD')} ·{' '}
            {new Date(hovered.observed_at).toLocaleDateString()}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mt-1 text-2xs uppercase tracking-wider text-muted-foreground">
        <span>Low {formatCurrency(geom.min, 'USD')}</span>
        <span>High {formatCurrency(geom.max, 'USD')}</span>
      </div>
    </div>
  );
}
