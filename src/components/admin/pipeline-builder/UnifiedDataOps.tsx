import { lazy, Suspense, useCallback, Component, type ReactNode } from 'react';
import { useSearchParams, Link } from 'react-router';
import { ReactFlowProvider } from '@xyflow/react';
import { LayoutDashboard, Workflow, BarChart3, Shield, Newspaper, ClipboardCheck, AlertTriangle, Map, MapPin, GitMerge, Plug, Bug, Bell, Merge, Activity, History, Webhook, Wrench } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const OverviewTab = lazy(() => import('./tabs/OverviewTab'));
const PipelineBuilder = lazy(() => import('./PipelineBuilder'));
const MonitorTab = lazy(() => import('./tabs/MonitorTab'));
const HealthTab = lazy(() => import('./tabs/HealthTab'));
const NewsTab = lazy(() => import('./tabs/NewsTab'));
const DLQTab = lazy(() => import('./tabs/DLQTab'));
const CoverageTab = lazy(() => import('./tabs/CoverageTab'));
const GeoReviewTab = lazy(() => import('./tabs/GeoReviewTab'));
const GeoMismatchTab = lazy(() => import('./tabs/GeoMismatchTab'));
const SourcesTab = lazy(() => import('./tabs/SourcesTab'));
const ErrorsTab = lazy(() => import('./tabs/ErrorsTab'));
const AlertsTab = lazy(() => import('./tabs/AlertsTab'));
const DedupDecisionsTab = lazy(() => import('./tabs/DedupDecisionsTab'));
const ScraperHealthTab  = lazy(() => import('./tabs/ScraperHealthTab'));
const AuditTab          = lazy(() => import('./tabs/AuditTab'));
const IntegrationsTab   = lazy(() => import('./tabs/IntegrationsTab'));
const BackfillsTab      = lazy(() => import('./tabs/BackfillsTab'));

type Tab =
  | 'overview' | 'builder' | 'monitor' | 'sources' | 'dlq'
  | 'errors' | 'alerts' | 'coverage' | 'news' | 'health' | 'geo-review'
  | 'geo-mismatch'
  | 'dedup' | 'scraper-health' | 'audit' | 'integrations' | 'backfills';

type TabGroup = 'Run' | 'Monitor' | 'Quality' | 'Config';

// Ordered into four clusters so the 17-tab bar reads as labeled groups rather
// than a flat wall. Order within the array is the render order.
const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }>; group: TabGroup }[] = [
  { key: 'overview',       label: 'Overview',   icon: LayoutDashboard, group: 'Run' },
  { key: 'builder',        label: 'Builder',    icon: Workflow,        group: 'Run' },
  { key: 'backfills',      label: 'Backfills',  icon: Wrench,          group: 'Run' },
  { key: 'monitor',        label: 'Monitor',    icon: BarChart3,       group: 'Monitor' },
  { key: 'health',         label: 'Health',     icon: Shield,          group: 'Monitor' },
  { key: 'scraper-health', label: 'Scraper',    icon: Activity,        group: 'Monitor' },
  { key: 'alerts',         label: 'Alerts',     icon: Bell,            group: 'Monitor' },
  { key: 'errors',         label: 'Errors',     icon: Bug,             group: 'Monitor' },
  { key: 'dlq',            label: 'DLQ',        icon: AlertTriangle,   group: 'Monitor' },
  { key: 'audit',          label: 'Audit',      icon: History,         group: 'Monitor' },
  { key: 'dedup',          label: 'Dedup',      icon: Merge,           group: 'Quality' },
  { key: 'geo-review',     label: 'Geo Review', icon: GitMerge,        group: 'Quality' },
  { key: 'geo-mismatch',   label: 'Geo Mismatch', icon: MapPin,        group: 'Quality' },
  { key: 'coverage',       label: 'Coverage',   icon: Map,             group: 'Quality' },
  { key: 'news',           label: 'News',       icon: Newspaper,       group: 'Quality' },
  { key: 'sources',        label: 'Sources',    icon: Plug,            group: 'Config' },
  { key: 'integrations',   label: 'Integrations', icon: Webhook,       group: 'Config' },
];

const TAB_COMPONENTS: Record<Tab, React.LazyExoticComponent<React.ComponentType>> = {
  overview: OverviewTab,
  builder: PipelineBuilder,
  monitor: MonitorTab,
  sources: SourcesTab,
  dedup: DedupDecisionsTab,
  'geo-review': GeoReviewTab,
  'geo-mismatch': GeoMismatchTab,
  dlq: DLQTab,
  errors: ErrorsTab,
  alerts: AlertsTab,
  coverage: CoverageTab,
  news: NewsTab,
  health: HealthTab,
  'scraper-health': ScraperHealthTab,
  audit: AuditTab,
  integrations: IntegrationsTab,
  backfills: BackfillsTab,
};

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

export default function UnifiedDataOps() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') as Tab;
  const activeTab = rawTab && rawTab in TAB_COMPONENTS ? rawTab : 'overview';

  const switchTab = useCallback((tab: Tab) => {
    setParams(tab === 'overview' ? {} : { tab });
  }, [setParams]);

  const ActiveComponent = TAB_COMPONENTS[activeTab];
  const needsReactFlow = activeTab === 'builder';

  const content = (
    <TabErrorBoundary tab={activeTab} key={activeTab}>
      <Suspense fallback={<TabSkeleton />}>
        <ActiveComponent />
      </Suspense>
    </TabErrorBoundary>
  );

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-stretch border-b border-border overflow-x-auto" style={{ marginBottom: activeTab === 'builder' ? 0 : 20 }}>
        {TABS.map(({ key, label, icon: Icon, group }, i) => {
          const isActive = activeTab === key;
          const startsGroup = i === 0 || TABS[i - 1].group !== group;
          return (
            <div key={key} className="flex items-stretch">
              {startsGroup && (
                <span
                  className={`flex items-center whitespace-nowrap text-2xs uppercase tracking-wide text-muted-foreground/70 ${i === 0 ? 'pr-2' : 'pl-4 pr-2'}`}
                >
                  {group}
                </span>
              )}
              <button
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
            </div>
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

      {needsReactFlow ? <ReactFlowProvider>{content}</ReactFlowProvider> : content}
    </div>
  );
}
