import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { FreigabeFunnel } from '@/components/admin/FreigabeFunnel';
import { PersonalityFreigabeQueue } from '@/components/admin/PersonalityFreigabeQueue';
import { PersonalityQualityPanel } from '@/components/admin/PersonalityQualityPanel';
import { PersonalityReviewQueue } from '@/components/admin/PersonalityReviewQueue';
import { Table2 } from 'lucide-react';
import type { FreigabeStufe } from '@/lib/personalityStatus';

/**
 * Personality Truth Engine dashboard: the Freigabe funnel (multi-stage Ampel) +
 * manual approval queue on top, then completeness/coverage health, the identity
 * review gate, and consent-gated adult-cohort publishing. Full personality CRUD
 * lives at /admin/content/personalities.
 */
export default function AdminPersonalityQuality() {
  const [stage, setStage] = useState<FreigabeStufe>('in_pruefung');

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-headline">Personality quality</h1>
          <p className="text-13 text-muted-foreground">
            Freigabeprozess, Completeness, coverage gaps, identity review gate, and consent-gated publishing.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/content/personalities">
            <Table2 size={14} className="mr-1" /> Edit personalities
          </Link>
        </Button>
      </div>
      <FreigabeFunnel selected={stage} onSelect={setStage} />
      <PersonalityFreigabeQueue stage={stage} onStageChange={setStage} />
      <PersonalityQualityPanel />
      <PersonalityReviewQueue />
    </div>
  );
}
