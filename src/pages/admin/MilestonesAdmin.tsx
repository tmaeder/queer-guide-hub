import { useState } from 'react';
import { ContentListPanel } from '@/components/cms/ContentListPanel';
import { MilestoneDiscoveryButton } from '@/components/admin/MilestoneDiscoveryButton';
import { MilestoneLinkProposalsPanel } from '@/components/admin/milestones/MilestoneLinkProposalsPanel';

/**
 * Milestones admin: the generic CMS list plus an "AI suggestions" action next to
 * the New-entry point. The button triggers the milestone-discovery edge function
 * (same one the weekly cron runs), which stages AI-proposed milestones as
 * review_status='pending' — never published — for review here. Filter the list
 * by review_status = pending to see and approve them.
 */
export default function MilestonesAdmin() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-4 px-4 pt-4">
        <p className="text-sm text-muted-foreground">
          KI-Vorschläge landen als <b>pending</b> (nicht öffentlich) — hier prüfen und freigeben.
        </p>
        <MilestoneDiscoveryButton onComplete={() => setRefreshKey((k) => k + 1)} />
      </div>
      <MilestoneLinkProposalsPanel />
      <ContentListPanel key={refreshKey} contentTypeId="milestones" />
    </div>
  );
}
