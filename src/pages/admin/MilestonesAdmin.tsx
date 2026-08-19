import { useState } from 'react';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';
import { ContentListPanel } from '@/components/cms/ContentListPanel';
import { MilestoneDiscoveryButton } from '@/components/admin/MilestoneDiscoveryButton';
import { MilestoneLinkProposalsPanel } from '@/components/admin/milestones/MilestoneLinkProposalsPanel';

/**
 * Milestones admin: the generic CMS list plus an "AI suggestions" action next to
 * the New-entry point. The button triggers the milestone-discovery edge function
 * (same one the weekly cron runs), which stages AI-proposed milestones as
 * review_status='pending' — never published — for review here. Filter the list
 * by review_status = pending to see and approve them.
 *
 * No `eyebrow`: AdminPageHeader resolves it from the route registry, which
 * already yields "CONTENT · MILESTONES".
 */
export default function MilestonesAdmin() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    // AdminShell's <main> owns the gutter and the vertical rhythm — admin pages
    // render bare content. The old `px-4 pt-4` here doubled the shell's gutter.
    <div className="flex flex-col gap-6">
      {/* This page owns the title, so the embedded ContentListPanel is told to
        suppress its own — otherwise the route renders TWO h1s. */}
      <AdminArchetypeHeader
        className="mb-0"
        title="Milestones"
        actions={<MilestoneDiscoveryButton onComplete={() => setRefreshKey((k) => k + 1)} />}
      />

      {/* Kept as body copy: "AI suggestions land as pending — never public" is
        a publication guarantee, not orientation. */}
      <p className="m-0 max-w-reading text-13 leading-relaxed text-muted-foreground">
        AI suggestions land as <b>pending</b> — never public. Review and publish them here; filter
        the list by review status “pending” to find them.
      </p>
      <MilestoneLinkProposalsPanel />
      <ContentListPanel key={refreshKey} contentTypeId="milestones" hideHeader />
    </div>
  );
}
