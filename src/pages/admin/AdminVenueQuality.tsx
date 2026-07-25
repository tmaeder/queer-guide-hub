import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { AmenityQualityPanel } from '@/components/admin/AmenityQualityPanel';
import { VenueReviewQueue } from '@/components/admin/review-queues/VenueReviewQueue';
import { Table2 } from 'lucide-react';

/**
 * Amenity Truth Engine dashboard: amenity + accessibility coverage health and
 * the accessibility review gate (LLM-proposed claims). Full venue CRUD lives at
 * /admin/content/venues.
 */
export default function AdminVenueQuality() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-headline">Amenity & accessibility quality</h1>
          <p className="text-13 text-muted-foreground">Coverage health and the accessibility review gate for venues.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/content/venues">
            <Table2 size={14} className="mr-1" /> Edit venues
          </Link>
        </Button>
      </div>
      <AmenityQualityPanel />
      <VenueReviewQueue />
    </div>
  );
}
