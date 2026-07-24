import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { PersonalityQualityPanel } from '@/components/admin/PersonalityQualityPanel';
import { PersonalityReviewQueue } from '@/components/admin/review-queues/PersonalityReviewQueue';
import { Table2 } from 'lucide-react';

/**
 * Personality Truth Engine dashboard: completeness/coverage health, the identity
 * review gate, and consent-gated adult-cohort publishing. Full personality CRUD
 * lives at /admin/content/personalities.
 */
export default function AdminPersonalityQuality() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-headline">Personality quality</h1>
          <p className="text-13 text-muted-foreground">Completeness, coverage gaps, identity review gate, and consent-gated publishing.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/content/personalities">
            <Table2 size={14} className="mr-1" /> Edit personalities
          </Link>
        </Button>
      </div>
      <PersonalityQualityPanel />
      <PersonalityReviewQueue />
    </div>
  );
}
