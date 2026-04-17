import { lazy, Suspense, useCallback, Component, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { ReactFlowProvider } from '@xyflow/react';
import { LayoutDashboard, Workflow, BarChart3, Shield, Newspaper, ClipboardCheck, AlertTriangle, Map, GitMerge, Plug, Bug, Bell, Merge, Activity, History, Webhook } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const OverviewTab = lazy(() => import('./tabs/OverviewTab'));
const PipelineBuilder = lazy(() => import('./PipelineBuilder'));
const MonitorTab = lazy(() => import('./tabs/MonitorTab'));
const HealthTab = lazy(() => import('./tabs/HealthTab'));
const NewsTab = lazy(() => import('./tabs/NewsTab'));
const ReviewQueueTab = lazy(() => import('./tabs/ReviewQueueTab'));
const DLQTab = lazy(() => import('./tabs/DLQTab'));
const CoverageTab = lazy(() => import('./tabs/CoverageTab'));
const GeoReviewTab = lazy(() => import('./tabs/GeoReviewTab'));
const SourcesTab = lazy(() => import('./tabs/SourcesTab'));
const ErrorsTab = lazy(() => import('./tabs/ErrorsTab'));
const AlertsTab = lazy(() => import('./tabs/AlertsTab'));
const DedupDecisionsTab = lazy(() => import('./tabs/DedupDecisionsTab'));
const ScraperHealthTab  = lazy(() => import('./tabs/ScraperHealthTab'));
const AuditTab          = lazy(() => import('./tabs/AuditTab'));
const IntegrationsTab   = lazy(() => import('./tabs/IntegrationsTab'));

type Tab =
  | 'overview' | 'builder' | 'monitor' | 'sources' | 'review' | 'dlq'
  | 'errors' | 'alerts' | 'coverage' | 'news' | 'health' | 'geo-review'
  | 'dedup' | 'scraper-health' | 'audit' | 'integrations';

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'overview',       label: 'Overview',   icon: LayoutDashboard },
  { key: 'builder',        label: 'Builder',    icon: Workflow },
  { key: 'monitor',        label: 'Monitor',    icon: BarChart3 },
  { key: 'sources',        label: 'Sources',    icon: Plug },
  { key: 'review',         label: 'Review',     icon: ClipboardCheck },
  { key: 'dedup',          label: 'Dedup',      icon: Merge },
  { key: 'geo-review',     label: 'Geo Review', icon: GitMerge },
  { key: 'dlq',            label: 'DLQ',        icon: AlertTriangle },
  { key: 'errors',         label: 'Errors',     icon: Bug },
  { key: 'alerts',         label: 'Alerts',     icon: Bell },
  { key: 'coverage',       label: 'Coverage',   icon: Map },
  { key: 'news',           label: 'News',       icon: Newspaper },
  { key: 'health',         label: 'Health',     icon: Shield },
  { key: 'scraper-health', label: 'Scraper',    icon: Activity },
  { key: 'audit',          label: 'Audit',      icon: History },
  { key: 'integrations',   label: 'Integrations', icon: Webhook },
];

const TAB_COMPONENTS: Record<Tab, React.LazyExoticComponent<React.ComponentType>> = {
  overview: OverviewTab,
  builder: PipelineBuilder,
  monitor: MonitorTab,
  sources: SourcesTab,
  review: ReviewQueueTab,
  dedup: DedupDecisionsTab,
  'geo-review': GeoReviewTab,
  dlq: DLQTab,
  errors: ErrorsTab,
  alerts: AlertsTab,
  coverage: CoverageTab,
  news: NewsTab,
  health: HealthTab,
  'scraper-health': ScraperHealthTab,
  audit: AuditTab,
  integrations: IntegrationsTab,
};

function TabSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-3">
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
          <p className="text-xs mb-3">{this.state.error.message}</p>
          <button className="text-xs underline" onClick={() => this.setState({ error: null })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function UnifiedDataOps() {
  const [params, setParams] = useSearchParams();
  const activeTab = (params.get('tab') as Tab) || 'overview';

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
      <div className="flex border-b border-border overflow-x-auto" style={{ marginBottom: activeTab === 'builder' ? 0 : 20 }}>
        {TABS.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              onClick={() => switchTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] whitespace-nowrap border-b-2 transition-colors ${
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
      </div>

      {needsReactFlow ? <ReactFlowProvider>{content}</ReactFlowProvider> : content}
    </div>
  );
}
