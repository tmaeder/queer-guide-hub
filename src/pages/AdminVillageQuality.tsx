import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { VillageQualityPanel } from '@/components/admin/VillageQualityPanel';
import { VillageReviewQueue } from '@/components/admin/VillageReviewQueue';
import { Table2 } from 'lucide-react';

/**
 * Village Truth Engine dashboard: completeness/coverage health + venue-linkage
 * stats + the LLM content review gate. Full village CRUD lives at /admin/villages.
 */
export default function AdminVillageQuality() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-headline">Village quality</h1>
          <p className="text-13 text-muted-foreground">Completeness, venue linkage, coverage gaps, and the LLM review gate.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/villages">
            <Table2 size={14} className="mr-1" /> Edit villages
          </Link>
        </Button>
      </div>
      <VillageQualityPanel />
      <VillageReviewQueue />
    </div>
  );
}
