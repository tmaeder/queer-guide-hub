/**
 * /admin/affiliate — the affiliate cockpit.
 *
 * Performance  clicks/impressions/CTR by surface × partner × vertical
 * Revenue      realized commissions (affiliate_conversions ← Awin/TP/Amazon)
 * Merchants    every marketplace vendor: stats + sync + affiliate config
 * Partners     affiliate_partners registry — consumed LIVE by the /go worker
 * Link health  marketplace link-rot rollup (marketplace-link-checker)
 */

import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AffiliatePartnersManager } from '@/components/admin/AffiliatePartnersManager';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PerformancePanel } from '@/components/admin/affiliate/PerformancePanel';
import { RevenuePanel } from '@/components/admin/affiliate/RevenuePanel';
import { MerchantsManager } from '@/components/admin/affiliate/MerchantsManager';
import { LinkHealthPanel } from '@/components/admin/affiliate/LinkHealthPanel';
import { RegistryDriftCard } from '@/components/admin/affiliate/RegistryDriftCard';

const TABS = ['performance', 'revenue', 'merchants', 'partners', 'link-health'] as const;
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
  merchants: {
    title: 'Marketplace merchants',
    subtitle: 'All vendors: sync state, listings, link health, clicks, commission and affiliate config.',
  },
  partners: {
    title: 'Affiliate partners',
    subtitle: 'Partner registry — served live to the /go redirect worker.',
  },
  'link-health': {
    title: 'Link health',
    subtitle: 'Outbound link rot across marketplace listings, swept daily.',
  },
};

export default function AdminAffiliate() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'performance';
  const [days, setDays] = useState('30');
  const [vertical, setVertical] = useState('all');

  const showPeriod = tab !== 'partners';

  return (
    <div className="p-6">
      <AdminPageHeader
        eyebrow="COCKPIT · AFFILIATE"
        title={HEADERS[tab].title}
        subtitle={HEADERS[tab].subtitle}
        actions={
          showPeriod ? (
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
          ) : undefined
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
          <TabsTrigger value="merchants">Merchants</TabsTrigger>
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="link-health">Link health</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'performance' && <PerformancePanel days={days} vertical={vertical} />}
      {tab === 'revenue' && <RevenuePanel days={days} />}
      {tab === 'merchants' && <MerchantsManager days={days} />}
      {tab === 'partners' && (
        <>
          <RegistryDriftCard />
          <AffiliatePartnersManager />
        </>
      )}
      {tab === 'link-health' && <LinkHealthPanel days={days} />}
    </div>
  );
}
