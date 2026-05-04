import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

export interface EntityDetailTab {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

export interface EntityDetailBreadcrumb {
  label: ReactNode;
  href?: string;
}

export interface EntityDetailLayoutProps {
  loading: boolean;
  error: Error | null;
  hero: ReactNode;
  tabs: EntityDetailTab[];
  sidebar?: ReactNode;
  breadcrumbs?: EntityDetailBreadcrumb[];
  /** Entity type label (e.g. 'venue') — reserved for analytics/telemetry hooks */
  entityType: string;
  /** Entity id — reserved for analytics/telemetry hooks */
  entityId?: string;
}

/**
 * Generic layout shell for entity detail pages (ARCH-1 foundation).
 * Pages provide hero + tabs + optional sidebar; layout handles loading/error,
 * breadcrumbs, and tab state. Pages with custom needs can compose around this.
 */
export function EntityDetailLayout({
  loading,
  error,
  hero,
  tabs,
  sidebar,
  breadcrumbs,
  entityType: _entityType,
  entityId: _entityId,
}: EntityDetailLayoutProps) {
  // Tab state is encoded in the URL query string so /city/rabat?tab=map is
  // deep-linkable and browser back/forward steps through tabs naturally.
  // Falls back to the first tab when ?tab is missing or unknown.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabIds = tabs.map((t) => t.id);
  const urlTab = searchParams.get('tab');
  const initialTab = urlTab && tabIds.includes(urlTab) ? urlTab : (tabs[0]?.id ?? '');
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  // Sync state ← URL when the user navigates back/forward.
  useEffect(() => {
    if (urlTab && tabIds.includes(urlTab) && urlTab !== activeTab) setActiveTab(urlTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab]);

  const handleTabChange = (next: string) => {
    setActiveTab(next);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === tabs[0]?.id) p.delete('tab');
        else p.set('tab', next);
        return p;
      },
      { replace: true },
    );
  };

  if (error) {
    return (
      <div className="container mx-auto py-8" data-testid="entity-detail-error">
        <Alert variant="destructive">
          <AlertTitle>Failed to load</AlertTitle>
          <AlertDescription>{error.message || 'Something went wrong.'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto py-8" data-testid="entity-detail-loading">
        <Skeleton variant="rectangular" height={32} style={{ marginBottom: 16, width: '40%' }} />
        <Skeleton variant="rectangular" height={192} style={{ marginBottom: 24, borderRadius: 12 }} />
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-6">
          <Skeleton variant="rectangular" height={320} style={{ borderRadius: 12 }} />
          <Skeleton variant="rectangular" height={240} style={{ borderRadius: 12 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8" data-testid="entity-detail-layout">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1 mb-4 flex-wrap"
        >
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            const label =
              crumb.href && !isLast ? (
                <LocalizedLink to={crumb.href} style={{ textDecoration: 'none' }}>
                  <span className="text-sm text-muted-foreground hover:text-primary">
                    {crumb.label}
                  </span>
                </LocalizedLink>
              ) : (
                <span
                  className={`text-sm ${isLast ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
                >
                  {crumb.label}
                </span>
              );
            return (
              <span key={i} className="inline-flex items-center gap-1">
                {i > 0 && (
                  <ChevronRight
                    style={{ width: 14, height: 14, color: 'hsl(var(--muted-foreground))' }}
                  />
                )}
                {label}
              </span>
            );
          })}
        </nav>
      )}

      <div className="mb-6">{hero}</div>

      <div className={`grid grid-cols-1 ${sidebar ? 'md:grid-cols-[2fr_1fr]' : ''} gap-6`}>
        <div>
          {tabs.length > 0 && (
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList>
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {tabs.map((tab) => (
                <TabsContent key={tab.id} value={tab.id}>
                  {tab.content}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
        {sidebar && <div>{sidebar}</div>}
      </div>
    </div>
  );
}

export default EntityDetailLayout;
