import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { CityQualityPanel } from '@/components/admin/CityQualityPanel';
import { CityReviewQueue } from '@/components/admin/CityReviewQueue';
import { Table2 } from 'lucide-react';

/**
 * City Truth Engine dashboard: completeness/coverage health + the
 * safety-sensitive review queue (rating / safety notes / hooks). Full city CRUD
 * lives at /admin/content/cities.
 */
export default function AdminCityQuality() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-headline">City quality</h1>
          <p className="text-13 text-muted-foreground">Completeness, coverage gaps, and the LLM safety review gate.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/content/cities">
            <Table2 size={14} className="mr-1" /> Edit cities
          </Link>
        </Button>
      </div>
      <CityQualityPanel />
      <CityReviewQueue />
    </div>
  );
}
