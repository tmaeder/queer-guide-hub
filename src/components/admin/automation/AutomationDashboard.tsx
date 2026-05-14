/**
 * AutomationDashboard — Module configuration and run history dashboard.
 *
 * Review queue has moved to the unified Review & Moderation page.
 * Tabs: Overview · History · Settings
 */

import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { Activity, Clock, Settings, ScanSearch, LinkIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAutomation, type AutomationModule } from '@/hooks/useAutomation';
import { LinkHealthDashboard } from '../LinkHealthDashboard';
import { AutomationStats } from './AutomationStats';
import { ModuleCard } from './ModuleCard';
import { RunHistoryTable } from './RunHistoryTable';
import { ModuleSettingsDialog } from './ModuleSettingsDialog';

// ── Tab Definitions ─────────────────────────────────────────────────────────────

type Tab = 'overview' | 'history' | 'links' | 'settings';
const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'overview', label: 'Overview', icon: Activity },
  { key: 'history', label: 'History', icon: Clock },
  { key: 'links', label: 'Link Health', icon: LinkIcon },
  { key: 'settings', label: 'Settings', icon: Settings },
];

// ── Main Component ──────────────────────────────────────────────────────────────

export function AutomationDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [settingsModule, setSettingsModule] = useState<AutomationModule | null>(null);

  const {
    modules,
    runHistory,
    stats,
    activeRun,
    isLoading,
    isRunning,
    runningModuleSlug,
    toggleModule,
    runModule,
    updateModuleSettings,
  } = useAutomation();

  // Progress tracking for full scans: count run-log entries created since this run started
  const modulesCompleted = activeRun
    ? runHistory.filter((r) => r.created_at >= activeRun.startedAt).length
    : 0;
  const totalModules = activeRun?.slug === 'all' ? modules.length : 1;
  const progressValue =
    totalModules > 0 ? Math.min((modulesCompleted / totalModules) * 100, 99) : 0;

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h5 className="text-xl font-bold">
            Automation Modules
          </h5>
          <p className="text-sm text-muted-foreground">
            Configure and run automation pipelines — review pending changes in{' '}
            <RouterLink to="/admin/review?tab=automation" className="underline hover:no-underline text-primary">
              Review &amp; Moderation
            </RouterLink>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => runModule({ slug: 'all', dryRun: true, fullScan: true })}
            disabled={isRunning}
          >
            <ScanSearch size={15} />
            Dry Scan All
          </Button>
          <Button
            size="sm"
            onClick={() => runModule({ slug: 'all', fullScan: true })}
            disabled={isRunning}
          >
            <ScanSearch size={15} />
            Full Scan All
          </Button>
        </div>
      </div>

      {/* Progress bar — shown while any module is running */}
      {isRunning && activeRun && (
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-muted-foreground">
              {activeRun.fullScan ? 'Full scan in progress…' : `Running ${activeRun.slug}…`}
            </span>
            {activeRun.slug === 'all' && (
              <span className="text-xs text-muted-foreground">
                {modulesCompleted} / {totalModules} modules
              </span>
            )}
          </div>
          <div className="h-1 w-full bg-muted overflow-hidden rounded-sm">
            <div
              className={modulesCompleted > 0 ? 'h-full bg-primary transition-all' : 'h-full bg-primary animate-pulse'}
              style={modulesCompleted > 0 ? { width: `${progressValue}%` } : { width: '50%' }}
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-0">
        {TABS.map(({ key, label, icon: Icon }) => (
          <div
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 cursor-pointer border-b-2 text-sm transition-colors hover:text-primary ${
              activeTab === key
                ? 'border-primary text-primary font-bold'
                : 'border-transparent text-muted-foreground font-medium'
            }`}
          >
            <Icon size={16} />
            {label}
          </div>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab
          stats={stats}
          modules={modules}
          onToggle={(id, enabled) => toggleModule({ moduleId: id, enabled })}
          onRun={(slug, dryRun) => runModule({ slug, dryRun })}
          onSettings={setSettingsModule}
          runningModuleSlug={runningModuleSlug}
        />
      )}

      {activeTab === 'history' && <RunHistoryTable runs={runHistory} modules={modules} />}

      {activeTab === 'links' && <LinkHealthDashboard embedded />}

      {activeTab === 'settings' && (
        <SettingsTab
          modules={modules}
          onToggle={(id, enabled) => toggleModule({ moduleId: id, enabled })}
          onSettings={setSettingsModule}
        />
      )}

      {/* Dialogs */}
      <ModuleSettingsDialog
        module={settingsModule}
        open={!!settingsModule}
        onClose={() => setSettingsModule(null)}
        onSave={(moduleId, settings) => updateModuleSettings({ moduleId, settings })}
      />
    </div>
  );
}

// ── Overview Tab ────────────────────────────────────────────────────────────────

function OverviewTab({
  stats,
  modules,
  onToggle,
  onRun,
  onSettings,
  runningModuleSlug,
}: {
  stats: ReturnType<typeof useAutomation>['stats'];
  modules: AutomationModule[];
  onToggle: (id: string, enabled: boolean) => void;
  onRun: (slug: string, dryRun?: boolean) => void;
  onSettings: (module: AutomationModule) => void;
  runningModuleSlug: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* Stats cards */}
      <AutomationStats stats={stats} />

      {/* Module cards grid */}
      <div>
        <p className="text-base font-bold mb-4">
          Modules
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map((mod) => (
            <ModuleCard
              key={mod.id}
              module={mod}
              onToggle={onToggle}
              onRun={onRun}
              onSettings={onSettings}
              isRunning={runningModuleSlug === mod.slug}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Settings Tab ────────────────────────────────────────────────────────────────

function SettingsTab({
  modules,
  onSettings,
}: {
  modules: AutomationModule[];
  onToggle: (id: string, enabled: boolean) => void;
  onSettings: (module: AutomationModule) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Configure automation modules — thresholds, batch sizes, rate limits, and content types.
      </p>
      {modules.map((mod) => (
        <div
          key={mod.id}
          className="p-4 rounded-lg border border-border flex items-center gap-4"
        >
          <div className="flex-1">
            <p className="text-sm font-bold">
              {mod.display_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {mod.description}
            </p>
            <div className="flex gap-4 mt-2">
              <span className="text-xs">
                Threshold:{' '}
                <strong>
                  {mod.auto_approve_threshold > 1
                    ? 'Manual only'
                    : `${Math.round(mod.auto_approve_threshold * 100)}%`}
                </strong>
              </span>
              <span className="text-xs">
                Batch: <strong>{mod.batch_size}</strong>
              </span>
              <span className="text-xs">
                Rate: <strong>{mod.rate_limit_per_hour}/hr</strong>
              </span>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => onSettings(mod)}>
            <Settings size={14} />
            Configure
          </Button>
        </div>
      ))}
    </div>
  );
}
