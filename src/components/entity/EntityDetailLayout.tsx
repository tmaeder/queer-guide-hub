import { useState, type ReactNode } from 'react';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
  const [activeTab, setActiveTab] = useState<string>(tabs[0]?.id ?? '');

  if (error) {
    return (
      <Container sx={{ py: 4 }} data-testid="entity-detail-error">
        <Alert variant="destructive">
          <AlertTitle>Failed to load</AlertTitle>
          <AlertDescription>{error.message || 'Something went wrong.'}</AlertDescription>
        </Alert>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container sx={{ py: 4 }} data-testid="entity-detail-loading">
        <Skeleton variant="rectangular" height={32} style={{ marginBottom: 16, width: '40%' }} />
        <Skeleton variant="rectangular" height={192} style={{ marginBottom: 24, borderRadius: 12 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 3 }}>
          <Skeleton variant="rectangular" height={320} style={{ borderRadius: 12 }} />
          <Skeleton variant="rectangular" height={240} style={{ borderRadius: 12 }} />
        </Box>
      </Container>
    );
  }

  return (
    <Container sx={{ py: 4 }} data-testid="entity-detail-layout">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Box
          component="nav"
          aria-label="Breadcrumb"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 2, flexWrap: 'wrap' }}
        >
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            const label =
              crumb.href && !isLast ? (
                <LocalizedLink to={crumb.href} style={{ textDecoration: 'none' }}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ '&:hover': { color: 'primary.main' } }}
                  >
                    {crumb.label}
                  </Typography>
                </LocalizedLink>
              ) : (
                <Typography
                  variant="body2"
                  sx={{ fontWeight: isLast ? 500 : 400 }}
                  color={isLast ? 'text.primary' : 'text.secondary'}
                >
                  {crumb.label}
                </Typography>
              );
            return (
              <Box key={i} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                {i > 0 && (
                  <ChevronRight
                    style={{ width: 14, height: 14, color: 'hsl(var(--muted-foreground))' }}
                  />
                )}
                {label}
              </Box>
            );
          })}
        </Box>
      )}

      <Box sx={{ mb: 3 }}>{hero}</Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: sidebar ? '2fr 1fr' : '1fr' },
          gap: 3,
        }}
      >
        <Box>
          {tabs.length > 0 && (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
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
        </Box>
        {sidebar && <Box>{sidebar}</Box>}
      </Box>
    </Container>
  );
}

export default EntityDetailLayout;
