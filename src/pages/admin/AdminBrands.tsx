/**
 * /admin/brands — marketplace brand management.
 *
 * Review tab: the trust-gated ownership queue (approve_marketplace_brand /
 * reject_marketplace_brand). All-brands tab: generic content CRUD for display
 * fields (story/logo/website/spotlight) — status and ownership_tags stay
 * read-only there so the trust gate can't be bypassed.
 */

import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { BrandReviewQueue } from '@/components/admin/review-queues/BrandReviewQueue';
import { ContentListPanel } from '@/components/cms/ContentListPanel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

export default function AdminBrands() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'all' ? 'all' : 'review';
  const [applying, setApplying] = useState(false);

  const applyOwnership = async () => {
    setApplying(true);
    try {
      const { data, error } = await untypedSupabase.rpc('run_marketplace_ownership_apply', {});
      if (error) throw error;
      const d = (data ?? {}) as Record<string, unknown>;
      toast.success(`Ownership applied — ${d.updated ?? 0} products updated`);
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    } finally {
      setApplying(false);
    }
  };

  const tabsBar = (
    <Tabs
      value={tab}
      onValueChange={(v) => setSearchParams(v === 'all' ? { tab: 'all' } : {}, { replace: true })}
      className="mb-6"
    >
      <TabsList>
        <TabsTrigger value="review">Review</TabsTrigger>
        <TabsTrigger value="all">All brands</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  if (tab === 'all') {
    // ContentListPanel renders its own header/toolbar for the content type.
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-6 pt-6">{tabsBar}</div>
        <ContentListPanel contentTypeId="marketplace_brands" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <AdminPageHeader
        eyebrow="COMMERCE · BRANDS"
        title="Brands"
        subtitle="Ownership review queue and brand display registry."
        actions={
          <Button variant="outline" disabled={applying} onClick={applyOwnership}>
            {applying ? 'Applying…' : 'Apply ownership to products'}
          </Button>
        }
      />
      {tabsBar}
      <BrandReviewQueue />
    </div>
  );
}
