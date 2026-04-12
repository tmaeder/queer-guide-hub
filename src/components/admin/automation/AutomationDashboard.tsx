/**
 * AutomationDashboard — Module configuration and run history dashboard.
 *
 * Review queue has moved to the unified Review & Moderation page.
 * Tabs: Overview · History · Settings
 */

import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import MuiLink from '@mui/material/Link';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import { Activity, Clock, Settings, ScanSearch, LinkIcon } from 'lucide-react';
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
    _pendingChanges,
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
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Automation Modules
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure and run automation pipelines — review pending changes in{' '}
            <MuiLink component={RouterLink} to="/admin/review?tab=automation" underline="hover">
              Review &amp; Moderation
            </MuiLink>
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
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
        </Box>
      </Box>

      {/* Progress bar — shown while any module is running */}
      {isRunning && activeRun && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {activeRun.fullScan ? 'Full scan in progress…' : `Running ${activeRun.slug}…`}
            </Typography>
            {activeRun.slug === 'all' && (
              <Typography variant="caption" color="text.secondary">
                {modulesCompleted} / {totalModules} modules
              </Typography>
            )}
          </Box>
          <LinearProgress
            variant={modulesCompleted > 0 ? 'determinate' : 'indeterminate'}
            value={progressValue}
            sx={{ borderRadius: 1 }}
          />
        </Box>
      )}

      {/* Tabs */}
      <Box sx={{ display: 'flex', gap: 1, borderBottom: 1, borderColor: 'divider', pb: 0 }}>
        {TABS.map(({ key, label, icon: Icon }) => (
          <Box
            key={key}
            onClick={() => setActiveTab(key)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 2,
              py: 1.25,
              cursor: 'pointer',
              borderBottom: 2,
              borderColor: activeTab === key ? 'primary.main' : 'transparent',
              color: activeTab === key ? 'primary.main' : 'text.secondary',
              fontWeight: activeTab === key ? 700 : 500,
              fontSize: '0.875rem',
              transition: 'all 0.15s',
              '&:hover': { color: 'primary.main' },
            }}
          >
            <Icon size={16} />
            {label}
          </Box>
        ))}
      </Box>

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
    </Box>
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Stats cards */}
      <AutomationStats stats={stats} />

      {/* Module cards grid */}
      <Box>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
          Modules
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
            gap: 2,
          }}
        >
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
        </Box>
      </Box>
    </Box>
  );
}

// ── Settings Tab ────────────────────────────────────────────────────────────────

function SettingsTab({
  modules,
  _onToggle,
  onSettings,
}: {
  modules: AutomationModule[];
  onToggle: (id: string, enabled: boolean) => void;
  onSettings: (module: AutomationModule) => void;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        Configure automation modules — thresholds, batch sizes, rate limits, and content types.
      </Typography>
      {modules.map((mod) => (
        <Box
          key={mod.id}
          sx={{
            p: 2,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" fontWeight={700}>
              {mod.display_name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {mod.description}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
              <Typography variant="caption">
                Threshold:{' '}
                <strong>
                  {mod.auto_approve_threshold > 1
                    ? 'Manual only'
                    : `${Math.round(mod.auto_approve_threshold * 100)}%`}
                </strong>
              </Typography>
              <Typography variant="caption">
                Batch: <strong>{mod.batch_size}</strong>
              </Typography>
              <Typography variant="caption">
                Rate: <strong>{mod.rate_limit_per_hour}/hr</strong>
              </Typography>
            </Box>
          </Box>
          <Button size="sm" variant="outline" onClick={() => onSettings(mod)}>
            <Settings size={14} />
            Configure
          </Button>
        </Box>
      ))}
    </Box>
  );
}
