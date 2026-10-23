import { ContentListPanel } from '@/components/cms/ContentListPanel';
import { exportContentType } from '@/components/cms/ContentListPanel/exportContentList';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import { venueContentType } from '@/config/contentTypes/venue';
import { lazy, Suspense } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Navigate, useSearchParams } from 'react-router';

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
const BrandsManager = lazy(() =>
  import('@/components/admin/business/BrandsManager').then((m) => ({ default: m.BrandsManager })),
);
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
const TABS = ['directory', 'hotels', 'merchants', 'brands', 'partners'] as const;
type Tab = (typeof TABS)[number];

export default function OrganisationsWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'directory';
  // Link review moved to the Quality hub, where every review gate lives.
  // Declared below the hooks so hook order stays unconditional.
  if (tabParam === 'review') return <Navigate to="/admin/quality" replace />;

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (key === 'tab') {
      next.delete('view');
      next.delete('edit');
    }
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
        <AdminArchetypeHeader title="Organisations" />

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
          <BrandsManager />
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
        <ContentListPanel
          contentTypeId="organizations"
          workspace
          hideHeader
          tools={<VenueExportButtons />}
        />
      </TabsContent>
    </Tabs>
  );
}

/**
 * Venues have no admin list of their own: /admin/venues and
 * /admin/content/venues both land on this directory, whose export covers the
 * `organizations` table only. These export the `venues` table itself, with
 * every column and record, including archived and merged venues.
 */
function VenueExportButtons() {
  return (['Excel', 'CSV'] as const).map((format) => (
    <ExportExcelButton
      key={format}
      format={format}
      label={`Export venues (${format})`}
      onExport={() => exportContentType(venueContentType, [], format)}
    />
  ));
}
