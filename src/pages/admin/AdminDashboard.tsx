/**
 * AdminDashboard — the Cockpit.
 *
 * A single-column priority feed, not a dashboard. It answers three questions in
 * a fixed order: what needs me, what is broken, where do I go. Everything else
 * is a report and lives on its own page (/admin/inbox, /admin/quality,
 * /admin/pipelines, /admin/automation).
 *
 * It replaced a fourteen-widget bento on a hard `grid-cols-12` with no
 * breakpoint, where a `sm` widget rendered ~90px wide on a phone holding a
 * `text-display` number. The DOM order here is identical at every width; at lg
 * the reference sections move into a rail, which is a layout adaptation, not a
 * reorder.
 *
 * Request budget is the other half of the rebuild. The old page fired ~25
 * requests per load (six head-counts for review, thirteen for content stats,
 * three refresh-due RPCs, plus six more). Everything an editor sees now comes
 * from the single cached get_admin_counts payload the sidebar already fetches —
 * zero extra requests. Only "Broken" costs anything, and only for moderator+.
 */

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminTextSkeleton } from '@/components/admin/primitives/AdminLoading';
import { CockpitSection } from '@/components/admin/cockpit/CockpitSection';
import { CockpitStatusLine } from '@/components/admin/cockpit/CockpitStatusLine';
import { NeedsYouList } from '@/components/admin/cockpit/NeedsYouList';
import { BrokenList } from '@/components/admin/cockpit/BrokenList';
import { JumpToGrid } from '@/components/admin/cockpit/JumpToGrid';
import { FootprintPanel } from '@/components/admin/cockpit/FootprintPanel';
import { CockpitSectionsSheet } from '@/components/admin/cockpit/CockpitSectionsSheet';
import { rankQueueRows } from '@/config/adminQueues';
import { roleAtLeast } from '@/config/adminRoles';
import { useAdminCounts } from '@/hooks/useAdminCounts';
import { useCockpitOps } from '@/hooks/useCockpitOps';
import { useCockpitSections } from '@/hooks/useCockpitSections';
import { useCockpitRealtime } from '@/hooks/useCockpitRealtime';
import { useGranularRoles } from '@/hooks/useGranularRoles';
import { useRegisterAdminCommandAction } from '@/components/admin/command-palette/useAdminCommandActions';

export default function AdminDashboard() {
  const { effectiveRole, loading: rolesLoading } = useGranularRoles();
  const sections = useCockpitSections();
  const qc = useQueryClient();
  useCockpitRealtime();

  const [sheetOpen, setSheetOpen] = useState(false);

  const counts = useAdminCounts();
  // Gated twice on purpose: by role (the ops sources are moderator-only) and by
  // the section being visible, so hiding "Broken" actually stops the requests.
  const canSeeOps = roleAtLeast(effectiveRole, 'moderator');
  const brokenVisible = sections.isVisible('broken');
  const ops = useCockpitOps(canSeeOps && brokenVisible && !rolesLoading);

  const rows = useMemo(
    () => rankQueueRows(counts.data, effectiveRole),
    [counts.data, effectiveRole],
  );

  const opsBroken = ops.data
    ? ops.data.failingGates.length +
      ops.data.failingAutomations.length +
      ops.data.pipelineErrors.length +
      (ops.data.failedImportsToday > 0 ? 1 : 0)
    : 0;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-counts'] });
    qc.invalidateQueries({ queryKey: ['cockpit', 'ops'] });
  };

  useRegisterAdminCommandAction({
    id: 'dashboard.refresh',
    label: 'Refresh cockpit',
    keywords: 'reload metrics counts',
    shortcut: '⌘R',
    perform: refresh,
  });
  useRegisterAdminCommandAction({
    id: 'dashboard.sections',
    label: 'Show or hide cockpit sections',
    keywords: 'layout sections customize',
    perform: () => setSheetOpen(true),
  });

  const showNeedsYou = sections.isVisible('needs-you');
  const showJumpTo = sections.isVisible('jump-to');
  const showFootprint = sections.isVisible('footprint');
  const hasRail = showJumpTo || showFootprint;

  return (
    <div className="mx-auto w-full max-w-3xl lg:max-w-6xl">
      <AdminPageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <LayoutDashboard size={26} className="text-muted-foreground" aria-hidden />
            Cockpit
          </span>
        }
        subtitle={
          rolesLoading || counts.isLoading ? (
            <AdminTextSkeleton lines={1} className="max-w-xs" />
          ) : (
            <CockpitStatusLine
              rows={rows}
              opsBroken={opsBroken}
              dataUpdatedAt={counts.dataUpdatedAt}
              isFetching={counts.isFetching}
            />
          )
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="rounded-element"
              onClick={() => setSheetOpen(true)}
            >
              <SlidersHorizontal size={14} className="mr-1.5" aria-hidden />
              Sections
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 rounded-element p-0"
                  onClick={refresh}
                  aria-label="Refresh"
                >
                  <RefreshCw size={15} aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh all</TooltipContent>
            </Tooltip>
          </>
        }
      />

      {/* One column up to lg, then feed + sticky rail. The rail is a sibling
          that moves visually; the DOM order never changes. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-8 lg:col-start-1">
          {showNeedsYou && (
            <CockpitSection id="needs-you" title="Needs you">
              <NeedsYouList rows={rows} loading={rolesLoading || counts.isLoading} />
            </CockpitSection>
          )}
          {canSeeOps && brokenVisible && (
            <CockpitSection id="broken" title="Broken">
              <BrokenList ops={ops.data} loading={ops.isLoading} error={ops.isError} />
            </CockpitSection>
          )}
        </div>

        {hasRail && (
          <div className="mt-8 flex flex-col gap-8 lg:sticky lg:top-6 lg:col-start-2 lg:mt-0">
            {showJumpTo && (
              <CockpitSection id="jump-to" title="Jump to">
                <JumpToGrid counts={counts.data} role={effectiveRole} />
              </CockpitSection>
            )}
            {showFootprint && (
              <CockpitSection id="footprint" title="Footprint">
                <FootprintPanel counts={counts.data} />
              </CockpitSection>
            )}
          </div>
        )}
      </div>

      <CockpitSectionsSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        sections={sections.eligible}
        isVisible={sections.isVisible}
        onToggle={sections.toggle}
        onReset={sections.reset}
      />
    </div>
  );
}
