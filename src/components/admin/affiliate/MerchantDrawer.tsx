/**
 * Per-merchant detail drawer: the admin_merchant_overview row expanded —
 * listing/link/image/price/reject stats, clicks + commission, sync state and
 * affiliate configuration — plus a recent price-history sparkline.
 */

import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { monoChartAxis, monoChartPalette } from '@/lib/chartPalette';
import { Stat } from './Stat';
import type { MerchantOverviewRow } from './merchantTypes';

const LINK_KEYS = [
  ['link_ok', 'ok'],
  ['link_redirect', 'redirect'],
  ['link_broken', 'broken'],
  ['link_timeout', 'timeout'],
  ['link_unchecked', 'unchecked'],
] as const;

export function MerchantDrawer({
  merchant,
  days,
  onClose,
}: {
  merchant: MerchantOverviewRow | null;
  days: string;
  onClose: () => void;
}) {
  const { data: priceSeries } = useQuery({
    queryKey: ['merchant-price-history', merchant?.merchant_id, days],
    enabled: !!merchant,
    queryFn: async () => {
      // Price observations for this merchant's listings in the window,
      // bucketed per day (marketplace_price_history is public-read).
      const { data, error } = await untypedSupabase
        .from('marketplace_price_history')
        .select('price_usd, observed_at, source_slug')
        .eq('source_slug', merchant!.slug)
        .gte('observed_at', new Date(Date.now() - Number(days) * 86_400_000).toISOString())
        .order('observed_at', { ascending: true })
        .limit(2000);
      if (error) throw error;
      const byDay = new Map<string, { sum: number; n: number }>();
      for (const r of (data ?? []) as Array<{ price_usd: number | null; observed_at: string }>) {
        if (r.price_usd == null) continue;
        const day = r.observed_at.slice(0, 10);
        const b = byDay.get(day) ?? { sum: 0, n: 0 };
        b.sum += Number(r.price_usd);
        b.n += 1;
        byDay.set(day, b);
      }
      return [...byDay.entries()].map(([day, b]) => ({ day, avg: Math.round((b.sum / b.n) * 100) / 100 }));
    },
  });

  const palette = monoChartPalette(1);

  return (
    <Sheet open={!!merchant} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {merchant && (
          <>
            <SheetHeader>
              <SheetTitle>{merchant.display_name}</SheetTitle>
              <SheetDescription>
                {merchant.provider} · {merchant.shop_domain ?? merchant.slug} · last {days} days
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <Stat
                label="Listings"
                value={`${Number(merchant.listings_active).toLocaleString()}`}
                hint={`${Number(merchant.listings_total).toLocaleString()} total`}
              />
              <Stat
                label="Images mirrored"
                value={
                  merchant.listings_total > 0
                    ? `${((Number(merchant.images_mirrored) / Number(merchant.listings_total)) * 100).toFixed(0)}%`
                    : '—'
                }
                hint={`${Number(merchant.images_mirrored).toLocaleString()} listings`}
              />
              <Stat label="Clicks" value={Number(merchant.clicks).toLocaleString()} />
              <Stat label="Impressions" value={Number(merchant.impressions).toLocaleString()} />
              <Stat label="Conversions" value={Number(merchant.conversions).toLocaleString()} />
              <Stat label="Commission" value={`$${Number(merchant.commission_usd).toFixed(2)}`} />
              <Stat label="Price points" value={Number(merchant.price_points).toLocaleString()} hint="in window" />
              <Stat
                label="Relevance rejects"
                value={Number(merchant.relevance_rejects).toLocaleString()}
                hint="staging, in window"
              />
            </div>

            <section className="mt-8">
              <h3 className="mb-2 text-15 font-semibold">Link health</h3>
              <div className="flex flex-wrap gap-2">
                {LINK_KEYS.map(([key, label]) => {
                  const n = Number(merchant[key]);
                  if (n === 0) return null;
                  return (
                    <Badge key={key} variant="outline" className={label === 'broken' || label === 'timeout' ? 'text-destructive' : ''}>
                      {label}: {n.toLocaleString()}
                    </Badge>
                  );
                })}
                {LINK_KEYS.every(([key]) => Number(merchant[key]) === 0) && (
                  <p className="text-13 text-muted-foreground">No listings.</p>
                )}
              </div>
            </section>

            {priceSeries && priceSeries.length > 1 && (
              <section className="mt-8">
                <h3 className="mb-2 text-15 font-semibold">Avg price observed (USD)</h3>
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={priceSeries} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                      <XAxis dataKey="day" {...monoChartAxis} />
                      <YAxis {...monoChartAxis} width={48} />
                      <Tooltip cursor={{ stroke: 'hsl(var(--muted-foreground))' }} />
                      <Line type="monotone" dataKey="avg" stroke={palette[0]} dot={false} strokeWidth={1.5} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            <section className="mt-8">
              <h3 className="mb-2 text-15 font-semibold">Sync & affiliate config</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-13">
                <dt className="text-muted-foreground">Enabled</dt>
                <dd>{merchant.is_enabled ? 'yes' : 'no'}</dd>
                <dt className="text-muted-foreground">Last sync</dt>
                <dd>
                  {merchant.last_sync_at
                    ? `${new Date(merchant.last_sync_at).toLocaleString()} — ${merchant.last_sync_status ?? '?'} (${merchant.last_sync_items ?? 0} items)`
                    : 'never'}
                </dd>
                <dt className="text-muted-foreground">Affiliate partner</dt>
                <dd>{merchant.partner_name ?? '—'}</dd>
                <dt className="text-muted-foreground">Awin advertiser ID</dt>
                <dd>{merchant.awin_advertiser_id ?? '—'}</dd>
              </dl>
            </section>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
