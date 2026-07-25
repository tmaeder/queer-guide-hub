/**
 * /admin/vendors — unified vendor management hub.
 *
 * Merchants: the marketplace_merchants sync registry (previously SQL-only —
 * onboarding, config, sync health, test sync). Partners: the existing travel
 * affiliate_partners manager, reused verbatim. Organizations: seller orgs and
 * their merchant links (identity spine).
 */

import { useSearchParams } from 'react-router';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AffiliatePartnersManager } from '@/components/admin/AffiliatePartnersManager';
import { MerchantsManager } from '@/components/admin/vendors/MerchantsManager';
import { SellerOrgsPanel } from '@/components/admin/vendors/SellerOrgsPanel';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TABS = ['merchants', 'partners', 'orgs'] as const;
type Tab = (typeof TABS)[number];

export default function AdminVendors() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'merchants';

  return (
    <div className="p-6">
      <AdminPageHeader
        eyebrow="COMMERCE · VENDORS"
        title="Vendors"
        subtitle="Marketplace merchants, travel affiliate partners, and seller organizations."
      />
      <Tabs
        value={tab}
        onValueChange={(v) =>
          setSearchParams(v === 'merchants' ? {} : { tab: v }, { replace: true })
        }
        className="mb-6"
      >
        <TabsList>
          <TabsTrigger value="merchants">Merchants</TabsTrigger>
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="orgs">Organizations</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'merchants' && <MerchantsManager />}
      {/* AffiliatePartnersManager brings its own p-6 container — matches the
          standalone /admin/affiliate?tab=partners rendering. */}
      {tab === 'partners' && <AffiliatePartnersManager />}
      {tab === 'orgs' && <SellerOrgsPanel />}
    </div>
  );
}
