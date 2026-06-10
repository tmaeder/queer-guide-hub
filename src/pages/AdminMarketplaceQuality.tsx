import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { MarketplaceTagQualityPanel } from '@/components/admin/MarketplaceTagQualityPanel';
import { MarketplaceReviewQueue } from '@/components/admin/MarketplaceReviewQueue';
import { Table2 } from 'lucide-react';

/**
 * Marketplace tag engine dashboard: department/attribute coverage and the
 * rating-downgrade review gate. Full listing CRUD lives at /admin/marketplace.
 */
export default function AdminMarketplaceQuality() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-headline">Marketplace tag quality</h1>
          <p className="text-13 text-muted-foreground">Department + attribute coverage and the rating-downgrade review gate.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/marketplace">
            <Table2 size={14} className="mr-1" /> Edit listings
          </Link>
        </Button>
      </div>
      <MarketplaceTagQualityPanel />
      <MarketplaceReviewQueue />
    </div>
  );
}
