/**
 * AdminDashboard — role-adaptive, interactive Cockpit.
 * Widgets come from a declarative registry (config/cockpitWidgets); their order
 * and visibility are per-admin and persisted in profiles.preferences.cockpit.
 * Every widget is live (auto-refreshing), drillable (shared right Sheet), and —
 * where it makes sense — actionable inline (run automations, queue backfills).
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, RefreshCw, SlidersHorizontal, Check, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { CockpitGrid } from '@/components/admin/cockpit/CockpitGrid';
import { CockpitDrillDown } from '@/components/admin/cockpit/CockpitDrillDown';
import { CustomizeLayoutSheet } from '@/components/admin/cockpit/CustomizeLayoutSheet';
import type { DrillDownPanel } from '@/components/admin/cockpit/types';
import { useCockpitLayout } from '@/hooks/useCockpitLayout';
import { useCockpitRealtime } from '@/hooks/useCockpitRealtime';
import { useGranularRoles } from '@/hooks/useGranularRoles';
import { useRegisterAdminCommandAction } from '@/components/admin/command-palette/useAdminCommandActions';

const FIRST_RUN_KEY = 'admin.cockpit.firstrun';

function CockpitSkeleton() {
  return (
    <div className="grid grid-cols-12 auto-rows-min gap-px bg-border">
      {[4, 3, 3, 4, 4, 12].map((span, i) => (
        <Skeleton
          key={i}
          className="rounded-none"
          style={{ gridColumn: `span ${span} / span ${span}`, height: span === 12 ? 160 : 200 }}
        />
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const { effectiveRole, loading } = useGranularRoles();
  const layout = useCockpitLayout();
  const qc = useQueryClient();
  useCockpitRealtime();

  const [panel, setPanel] = useState<DrillDownPanel | null>(null);
  const [editing, setEditing] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['cockpit'] });
    qc.invalidateQueries({ queryKey: ['admin-counts'] });
    qc.invalidateQueries({ queryKey: ['admin-automations'] });
  };

  const [showFirstRun, setShowFirstRun] = useState(() => {
    try {
      return localStorage.getItem(FIRST_RUN_KEY) !== 'dismissed';
    } catch {
      return false;
    }
  });
  const dismissFirstRun = () => {
    try {
      localStorage.setItem(FIRST_RUN_KEY, 'dismissed');
    } catch {
      /* ignore */
    }
    setShowFirstRun(false);
  };

  useRegisterAdminCommandAction({
    id: 'dashboard.refresh',
    label: 'Refresh cockpit',
    keywords: 'reload metrics',
    shortcut: '⌘R',
    perform: refresh,
  });
  useRegisterAdminCommandAction({
    id: 'dashboard.customize',
    label: 'Customize cockpit widgets',
    keywords: 'layout widgets show hide',
    perform: () => setCustomizeOpen(true),
  });

  const ctx = { openDrillDown: setPanel, effectiveRole };

  return (
    <div>
      <AdminPageHeader
        title={
          <span className="inline-flex items-center gap-3">
            <LayoutDashboard size={26} className="text-muted-foreground" aria-hidden />
            Cockpit
          </span>
        }
        actions={
          <>
            <Button
              variant={editing ? 'accent' : 'outline'}
              size="sm"
              className="rounded-element"
              onClick={() => setEditing((e) => !e)}
            >
              {editing ? <Check size={14} className="mr-1.5" aria-hidden /> : <Pencil size={14} className="mr-1.5" aria-hidden />}
              {editing ? 'Done' : 'Edit layout'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-element"
              onClick={() => setCustomizeOpen(true)}
            >
              <SlidersHorizontal size={14} className="mr-1.5" aria-hidden />
              Customize
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 rounded-element"
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

      {loading ? (
        <CockpitSkeleton />
      ) : (
        <>
          {showFirstRun && effectiveRole !== 'none' && (
            <div className="mb-4 flex items-center justify-between gap-4 rounded-element border border-border bg-muted/30 px-4 py-2">
              <p className="text-2xs text-muted-foreground">
                Your cockpit adapts to your role ({effectiveRole}). Drag to reorder in Edit layout,
                or press ⌘K to jump anywhere.
              </p>
              <button
                type="button"
                onClick={dismissFirstRun}
                className="flex-shrink-0 text-2xs font-medium text-muted-foreground hover:text-foreground"
              >
                Dismiss
              </button>
            </div>
          )}

          {layout.widgets.length === 0 ? (
            <div className="rounded-container border border-border bg-muted/30 p-8 text-center">
              <p className="text-sm font-medium">No widgets shown</p>
              <p className="mt-1 text-2xs text-muted-foreground">
                Every widget is hidden. Open Customize to turn some back on.
              </p>
            </div>
          ) : (
            <CockpitGrid
              widgets={layout.widgets}
              ctx={ctx}
              isEditing={editing}
              pinnedIds={layout.pinned}
              onReorder={layout.reorder}
              onTogglePin={layout.togglePin}
              onHide={layout.toggleVisible}
            />
          )}
        </>
      )}

      <CockpitDrillDown panel={panel} onClose={() => setPanel(null)} />
      <CustomizeLayoutSheet
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        eligible={layout.eligible}
        visibleIds={layout.visibleIds}
        onToggleVisible={layout.toggleVisible}
        onReset={layout.resetToDefault}
      />
    </div>
  );
}
