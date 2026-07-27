import { lazy, Suspense, useCallback, Component, type ReactNode } from 'react';
import { useSearchParams, Link } from 'react-router';
import { ReactFlowProvider } from '@xyflow/react';
import { LayoutDashboard, Workflow, Shield, Newspaper, ClipboardCheck, Plug, History } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const OverviewTab = lazy(() => import('./tabs/OverviewTab'));
const PipelineBuilder = lazy(() => import('./PipelineBuilder'));
const MonitorTab = lazy(() => import('./tabs/MonitorTab'));
const HealthTab = lazy(() => import('./tabs/HealthTab'));
const NewsTab = lazy(() => import('./tabs/NewsTab'));
const DLQTab = lazy(() => import('./tabs/DLQTab'));
const CoverageTab = lazy(() => import('./tabs/CoverageTab'));
const SourcesTab = lazy(() => import('./tabs/SourcesTab'));
const ErrorsTab = lazy(() => import('./tabs/ErrorsTab'));
const AlertsTab = lazy(() => import('./tabs/AlertsTab'));
const ScraperHealthTab  = lazy(() => import('./tabs/ScraperHealthTab'));
const AuditTab          = lazy(() => import('./tabs/AuditTab'));
const IntegrationsTab   = lazy(() => import('./tabs/IntegrationsTab'));
const BackfillsTab      = lazy(() => import('./tabs/BackfillsTab'));

type Tab = 'overview' | 'builder' | 'health' | 'sources' | 'news' | 'audit';

/** Sub-sections of the grouped Health and Sources tabs. */
type SubSection = {
  key: string;
  label: string;
  Component: React.LazyExoticComponent<React.ComponentType>;
};

const HEALTH_SUBS: SubSection[] = [
  { key: 'monitor',        label: 'Runs',     Component: MonitorTab },
  { key: 'health',         label: 'Health',   Component: HealthTab },
  { key: 'scraper-health', label: 'Scraper',  Component: ScraperHealthTab },
  { key: 'alerts',         label: 'Alerts',   Component: AlertsTab },
  { key: 'errors',         label: 'Errors',   Component: ErrorsTab },
  { key: 'dlq',            label: 'DLQ',      Component: DLQTab },
];

const SOURCES_SUBS: SubSection[] = [
  { key: 'sources',      label: 'Managers',     Component: SourcesTab },
  { key: 'coverage',     label: 'Coverage',     Component: CoverageTab },
  { key: 'integrations', label: 'Integrations', Component: IntegrationsTab },
  { key: 'backfills',    label: 'Backfills',    Component: BackfillsTab },
];

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'builder',  label: 'Builder',  icon: Workflow },
  { key: 'health',   label: 'Monitoring', icon: Shield },
  { key: 'sources',  label: 'Sources',  icon: Plug },
  { key: 'news',     label: 'News',     icon: Newspaper },
  { key: 'audit',    label: 'Audit',    icon: History },
];

/**
 * Legacy ?tab= deep-link compat. Old top-level tabs map to their new home
 * (grouped tab + sub-section). The three dedup tabs (dedup / geo-review /
 * geo-mismatch) were removed — those decisions live in the inbox now — so
 * their deep links land on the overview, which carries the pointer card.
 */
const TAB_ALIAS: Record<string, { tab: Tab; sub?: string }> = {
  monitor: { tab: 'health', sub: 'monitor' },
  'scraper-health': { tab: 'health', sub: 'scraper-health' },
  alerts: { tab: 'health', sub: 'alerts' },
  errors: { tab: 'health', sub: 'errors' },
  dlq: { tab: 'health', sub: 'dlq' },
  coverage: { tab: 'sources', sub: 'coverage' },
  integrations: { tab: 'sources', sub: 'integrations' },
  backfills: { tab: 'sources', sub: 'backfills' },
  dedup: { tab: 'overview' },
  'geo-review': { tab: 'overview' },
  'geo-mismatch': { tab: 'overview' },
};

const TAB_KEYS: Tab[] = TABS.map((t) => t.key);

function TabSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-4">
        <Skeleton className="h-24 flex-1" />
        <Skeleton className="h-24 flex-1" />
        <Skeleton className="h-24 flex-1" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

class TabErrorBoundary extends Component<{ children: ReactNode; tab: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-sm text-muted-foreground">
          <p className="font-medium text-destructive mb-1">Failed to load {this.props.tab}</p>
          <p className="text-xs mb-4">{this.state.error.message}</p>
          <button className="text-xs underline" onClick={() => this.setState({ error: null })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Secondary pill bar switching the sub-sections of a grouped tab. */
function SubTabs({
  subs,
  active,
  onSelect,
}: {
  subs: SubSection[];
  active: string;
  onSelect: (key: string) => void;
}) {
  const current = subs.find((s) => s.key === active) ?? subs[0];
  const ActiveComponent = current.Component;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Sub-sections">
        {subs.map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={s.key === current.key}
            onClick={() => onSelect(s.key)}
            className={`px-2 py-1 text-xs border rounded-element transition-colors ${
              s.key === current.key
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <TabErrorBoundary tab={current.label} key={current.key}>
        <Suspense fallback={<TabSkeleton />}>
          <ActiveComponent />
        </Suspense>
      </TabErrorBoundary>
    </div>
  );
}

export default function UnifiedDataOps() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') ?? '';
  const alias = TAB_ALIAS[rawTab];
  const activeTab: Tab = alias?.tab ?? (TAB_KEYS.includes(rawTab as Tab) ? (rawTab as Tab) : 'overview');
  const activeSub = alias?.sub ?? params.get('sub') ?? undefined;

  const switchTab = useCallback((tab: Tab) => {
    setParams(tab === 'overview' ? {} : { tab });
  }, [setParams]);

  const switchSub = useCallback((sub: string) => {
    setParams({ tab: activeTab, sub });
  }, [setParams, activeTab]);

  let content: ReactNode;
  if (activeTab === 'health') {
    content = <SubTabs subs={HEALTH_SUBS} active={activeSub ?? 'monitor'} onSelect={switchSub} />;
  } else if (activeTab === 'sources') {
    content = <SubTabs subs={SOURCES_SUBS} active={activeSub ?? 'sources'} onSelect={switchSub} />;
  } else {
    const ActiveComponent =
      activeTab === 'builder' ? PipelineBuilder
      : activeTab === 'news' ? NewsTab
      : activeTab === 'audit' ? AuditTab
      : OverviewTab;
    content = (
      <TabErrorBoundary tab={activeTab} key={activeTab}>
        <Suspense fallback={<TabSkeleton />}>
          <ActiveComponent />
        </Suspense>
      </TabErrorBoundary>
    );
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-stretch border-b border-border overflow-x-auto" style={{ marginBottom: activeTab === 'builder' ? 0 : 20 }}>
        {TABS.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              onClick={() => switchTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
              }`}
            >
              <Icon className="h-[15px] w-[15px]" />
              {label}
            </button>
          );
        })}
        <Link
          to="/admin/inbox"
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground transition-colors ml-auto"
        >
          <ClipboardCheck className="h-[15px] w-[15px]" />
          Inbox →
        </Link>
      </div>

      {activeTab === 'builder' ? <ReactFlowProvider>{content}</ReactFlowProvider> : content}
    </div>
  );
}
