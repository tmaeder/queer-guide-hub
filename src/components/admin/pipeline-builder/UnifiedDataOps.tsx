import { lazy, Suspense, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { ReactFlowProvider } from '@xyflow/react';
import { Workflow, BarChart3, Zap, Shield, Newspaper, ClipboardCheck, AlertTriangle, Map, GitMerge, Plug, Bug, Bell } from 'lucide-react';

const PipelineBuilder = lazy(() => import('./PipelineBuilder'));
const MonitorTab = lazy(() => import('./tabs/MonitorTab'));
const AutomationDashboard = lazy(() => import('../automation/AutomationDashboard').then(m => ({ default: m.AutomationDashboard })));
const HealthTab = lazy(() => import('./tabs/HealthTab'));
const NewsTab = lazy(() => import('./tabs/NewsTab'));
const ReviewQueueTab = lazy(() => import('./tabs/ReviewQueueTab'));
const DLQTab = lazy(() => import('./tabs/DLQTab'));
const CoverageTab = lazy(() => import('./tabs/CoverageTab'));
const GeoReviewTab = lazy(() => import('./tabs/GeoReviewTab'));
const SourcesTab = lazy(() => import('./tabs/SourcesTab'));
const ErrorsTab = lazy(() => import('./tabs/ErrorsTab'));
const AlertsTab = lazy(() => import('./tabs/AlertsTab'));

type Tab = 'builder' | 'monitor' | 'sources' | 'review' | 'dlq' | 'errors' | 'alerts' | 'coverage' | 'news' | 'modules' | 'health' | 'geo-review';

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ style?: React.CSSProperties }> }[] = [
  { key: 'builder',    label: 'Builder',    icon: Workflow },
  { key: 'monitor',    label: 'Monitor',    icon: BarChart3 },
  { key: 'sources',    label: 'Sources',    icon: Plug },
  { key: 'review',     label: 'Review',     icon: ClipboardCheck },
  { key: 'geo-review', label: 'Geo Review', icon: GitMerge },
  { key: 'dlq',        label: 'DLQ',        icon: AlertTriangle },
  { key: 'errors',     label: 'Errors',     icon: Bug },
  { key: 'alerts',     label: 'Alerts',     icon: Bell },
  { key: 'coverage',   label: 'Coverage',   icon: Map },
  { key: 'news',       label: 'News',       icon: Newspaper },
  { key: 'modules',    label: 'Modules',    icon: Zap },
  { key: 'health',     label: 'Health',     icon: Shield },
];

const fallback = <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Loading...</div>;

export default function UnifiedDataOps() {
  const [params, setParams] = useSearchParams();
  const activeTab = (params.get('tab') as Tab) || 'builder';

  const switchTab = useCallback((tab: Tab) => {
    setParams(tab === 'builder' ? {} : { tab });
  }, [setParams]);

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: activeTab === 'builder' ? 0 : 20 }}>
        {TABS.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => switchTab(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 20px', fontSize: 13, fontWeight: isActive ? 600 : 400,
                color: isActive ? '#6366f1' : '#6b7280',
                borderBottom: isActive ? '2px solid #6366f1' : '2px solid transparent',
                marginBottom: -2, background: 'transparent', border: 'none',
                cursor: 'pointer', transition: 'color 0.15s',
              }}
            >
              <Icon style={{ width: 15, height: 15 }} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'builder' && (
        <ReactFlowProvider>
          <Suspense fallback={fallback}>
            <PipelineBuilder />
          </Suspense>
        </ReactFlowProvider>
      )}
      {activeTab === 'monitor' && (
        <Suspense fallback={fallback}>
          <MonitorTab />
        </Suspense>
      )}
      {activeTab === 'sources' && (
        <Suspense fallback={fallback}>
          <SourcesTab />
        </Suspense>
      )}
      {activeTab === 'review' && (
        <Suspense fallback={fallback}>
          <ReviewQueueTab />
        </Suspense>
      )}
      {activeTab === 'geo-review' && (
        <Suspense fallback={fallback}>
          <GeoReviewTab />
        </Suspense>
      )}
      {activeTab === 'dlq' && (
        <Suspense fallback={fallback}>
          <DLQTab />
        </Suspense>
      )}
      {activeTab === 'errors' && (
        <Suspense fallback={fallback}>
          <ErrorsTab />
        </Suspense>
      )}
      {activeTab === 'alerts' && (
        <Suspense fallback={fallback}>
          <AlertsTab />
        </Suspense>
      )}
      {activeTab === 'coverage' && (
        <Suspense fallback={fallback}>
          <CoverageTab />
        </Suspense>
      )}
      {activeTab === 'news' && (
        <Suspense fallback={fallback}>
          <NewsTab />
        </Suspense>
      )}
      {activeTab === 'modules' && (
        <Suspense fallback={fallback}>
          <AutomationDashboard />
        </Suspense>
      )}
      {activeTab === 'health' && (
        <Suspense fallback={fallback}>
          <HealthTab />
        </Suspense>
      )}
    </div>
  );
}
