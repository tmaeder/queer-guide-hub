/**
 * /admin/affiliate — the affiliate cockpit, network analytics only.
 *
 * Performance  clicks/impressions/CTR by surface × partner × vertical
 * Revenue      realized commissions (affiliate_conversions ← Awin/TP/Amazon)
 * Link health  marketplace link-rot rollup (marketplace-link-checker)
 *
 * The per-business registries that used to live here — Merchants and Partners —
 * moved into the Business console (/admin/business), which owns businesses;
 * this page keeps only what is network-level. Both old tab URLs redirect.
 */

import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PerformancePanel } from '@/components/admin/affiliate/PerformancePanel';
import { RevenuePanel } from '@/components/admin/affiliate/RevenuePanel';
import { LinkHealthPanel } from '@/components/admin/affiliate/LinkHealthPanel';
import { RegistryDriftCard } from '@/components/admin/affiliate/RegistryDriftCard';

const TABS = ['performance', 'revenue', 'link-health'] as const;
type Tab = (typeof TABS)[number];

const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

const VERTICALS = [
  { value: 'all', label: 'All verticals' },
  { value: 'shopping', label: 'Shopping only' },
];

const HEADERS: Record<Tab, { title: string; subtitle: string }> = {
  performance: {
    title: 'Affiliate performance',
    subtitle: 'Clicks attributed by surface. Which part of the product earns.',
  },
  revenue: {
    title: 'Affiliate revenue',
    subtitle: 'Realized commissions reconciled from Awin, Travelpayouts and Amazon.',
  },
  'link-health': {
    title: 'Link health',
    subtitle: 'Outbound link rot across marketplace listings, swept daily.',
  },
};

export default function AdminAffiliate() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const [days, setDays] = useState('30');
  const [vertical, setVertical] = useState('all');

  // Absorbed by the Business console — keep the old deep links working.
  if (rawTab === 'merchants') return <Navigate to="/admin/business?tab=merchants" replace />;
  if (rawTab === 'partners') return <Navigate to="/admin/business?tab=partners" replace />;

  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : 'performance';

  return (
    <div className="p-6">
      <AdminPageHeader
        eyebrow="COCKPIT · AFFILIATE"
        title={HEADERS[tab].title}
        subtitle={HEADERS[tab].subtitle}
        actions={
          <div className="flex gap-2">
              {tab === 'performance' && (
                <Select value={vertical} onValueChange={setVertical}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VERTICALS.map((v) => (
                      <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIODS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
          </div>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(v) => setSearchParams(v === 'performance' ? {} : { tab: v }, { replace: true })}
        className="mb-6"
      >
        <TabsList>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="link-health">Link health</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'performance' && <PerformancePanel days={days} vertical={vertical} />}
      {tab === 'revenue' && <RevenuePanel days={days} />}
      {tab === 'link-health' && (
        <>
          {/* /go registry drift is network-level ops, not a per-business concern. */}
          <RegistryDriftCard />
          <LinkHealthPanel days={days} />
        </>
      )}
    </div>
  );
}
