import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { useMarketplacePriceHistory } from '@/hooks/useMarketplaceQueries';
import { formatCurrency } from '@/lib/currency';

export function MarketplacePriceHistory({ listingId }: { listingId: string }) {
  const { data: points } = useMarketplacePriceHistory(listingId, 90);

  if (points.length < 2) return null;

  const min = Math.min(...points.map((p) => p.price_usd));
  const max = Math.max(...points.map((p) => p.price_usd));
  const latest = points[points.length - 1].price_usd;
  const earliest = points[0].price_usd;
  const delta = latest - earliest;
  const deltaPct = earliest > 0 ? (delta / earliest) * 100 : 0;

  return (
    <div className="rounded-container border border-border p-4 bg-card">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-sm font-semibold">Price (90 days)</p>
        <p className={`text-xs ${delta < 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
          {delta < 0 ? '↓' : delta > 0 ? '↑' : '→'} {formatCurrency(Math.abs(delta), 'USD')} ({deltaPct.toFixed(1)}%)
        </p>
      </div>
      <div style={{ width: '100%', height: 60 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <Line
              type="monotone"
              dataKey="price_usd"
              stroke="hsl(var(--foreground))"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', fontSize: 11 }}
              formatter={(v: number) => formatCurrency(v, 'USD')}
              labelFormatter={(l: string) => new Date(l).toLocaleDateString()}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-between mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Low {formatCurrency(min, 'USD')}</span>
        <span>High {formatCurrency(max, 'USD')}</span>
      </div>
    </div>
  );
}
