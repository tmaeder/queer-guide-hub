import { ContentListPanel } from '@/components/cms/ContentListPanel';
import { lazy, Suspense, useState } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Link, Navigate, useSearchParams } from 'react-router';

import { toast } from 'sonner';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';
const AffiliatePartnersManager = lazy(() =>
  import('@/components/admin/AffiliatePartnersManager').then((m) => ({
    default: m.AffiliatePartnersManager,
  })),
);
const MerchantsManager = lazy(() =>
  import('@/components/admin/affiliate/MerchantsManager').then((m) => ({
    default: m.MerchantsManager,
  })),
);
const HotelsManager = lazy(() =>
  import('@/components/admin/business/HotelsManager').then((m) => ({ default: m.HotelsManager })),
);
const BrandReviewQueue = lazy(() =>
  import('@/components/admin/review-queues/BrandReviewQueue').then((m) => ({
    default: m.BrandReviewQueue,
  })),
);
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
const TABS = ['directory', 'hotels', 'merchants', 'brands', 'partners'] as const;
type Tab = (typeof TABS)[number];

export default function OrganisationsWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'directory';
  const [applyingOwnership, setApplyingOwnership] = useState(false);

  // Fans approved ownership tags out to the products that carry the badges.
  const applyOwnership = async () => {
    setApplyingOwnership(true);
    try {
      const { data, error } = await untypedSupabase.rpc('run_marketplace_ownership_apply', {});
      if (error) throw error;
      const d = (data ?? {}) as Record<string, unknown>;
      toast.success(`Ownership applied — ${d.updated ?? 0} products updated`);
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    } finally {
      setApplyingOwnership(false);
    }
  };

  // Link review moved to the Quality hub, where every review gate lives.
  // Declared below the hooks so hook order stays unconditional.
  if (tabParam === 'review') return <Navigate to="/admin/quality" replace />;

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setParam('tab', v === 'directory' ? '' : v)}
      className="flex min-h-0 flex-1 flex-col"
    >
      {/* No padding: AdminShell's <main> is the ONE owner of admin page spacing
          and already applies the gutter. The px-6 wrappers that used to sit on
          this block and on each tab body were compensating for an AdminEntityTable
          `p-6` that no longer exists, which had left the Hotels tab misaligned
          against the other four. */}
      <div>
        {/* No eyebrow: the route line is derived from the registry. */}
        <AdminArchetypeHeader
          title="Organisations"
          actions={
            tab === 'brands' ? (
              <Button variant="outline" disabled={applyingOwnership} onClick={applyOwnership}>
                {applyingOwnership ? 'Applying…' : 'Apply ownership to products'}
              </Button>
            ) : undefined
          }
        />

        <div className="mb-6">
          <TabsList className="max-w-full overflow-x-auto justify-start">
            <TabsTrigger value="directory">Directory</TabsTrigger>
            <TabsTrigger value="hotels">Hotels</TabsTrigger>
            <TabsTrigger value="merchants">Merchants</TabsTrigger>
            {/* No count: get_admin_counts exposes no brand key (the old
                /admin/brands nav badge read a `review_brands` that never
                existed). The queue itself shows the pending rows. */}
            <TabsTrigger value="brands">Brands</TabsTrigger>
            <TabsTrigger value="partners">Partners</TabsTrigger>
          </TabsList>
        </div>
      </div>

      <Suspense fallback={<TrackLoader size={24} label="Loading tools" />}>
        {/* HotelsManager brings its own AdminEntityTable page shell. */}
        <TabsContent value="hotels">
          <HotelsManager />
        </TabsContent>

        <TabsContent value="merchants">
          <MerchantsManager />
        </TabsContent>

        <TabsContent value="brands">
          <div className="mb-4 flex justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/content/marketplace_brands">Brand registry (raw list)</Link>
            </Button>
          </div>
          <BrandReviewQueue />
        </TabsContent>

        <TabsContent value="partners">
          <AffiliatePartnersManager embedded />
        </TabsContent>
      </Suspense>
      <TabsContent
        value="directory"
        forceMount
        hidden={tab !== 'directory'}
        className={`${tab === 'directory' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col`}
      >
        <ContentListPanel contentTypeId="organizations" hideHeader />
      </TabsContent>
    </Tabs>
  );
}
