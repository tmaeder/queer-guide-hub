/**
 * /admin/vendors — unified vendor management hub.
 *
 * Merchants: the marketplace_merchants sync registry (previously SQL-only —
 * onboarding, config, sync health, test sync). Partners: the existing travel
 * affiliate_partners manager, reused verbatim. Organizations: seller orgs and
 * their merchant links (identity spine).
 */

import { Navigate, useSearchParams } from 'react-router';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AffiliatePartnersManager } from '@/components/admin/AffiliatePartnersManager';
import { MerchantsManager } from '@/components/admin/vendors/MerchantsManager';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TABS = ['merchants', 'partners'] as const;
type Tab = (typeof TABS)[number];

export default function AdminVendors() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab');

  // Seller orgs moved to the Business console (organizations spine).
  if (raw === 'orgs') return <Navigate to="/admin/business" replace />;

  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'merchants';

  return (
    <div className="p-6">
      <AdminPageHeader
        eyebrow="COMMERCE · VENDORS"
        title="Vendors"
        subtitle="Marketplace merchants and travel affiliate partners. Seller organizations live in the Business console."
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
        </TabsList>
      </Tabs>

      {tab === 'merchants' && <MerchantsManager />}
      {/* AffiliatePartnersManager brings its own p-6 container — matches the
          standalone /admin/affiliate?tab=partners rendering. */}
      {tab === 'partners' && <AffiliatePartnersManager />}
    </div>
  );
}
