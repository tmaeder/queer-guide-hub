import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  MapPin, Search, Download, RefreshCw, CheckCircle, AlertTriangle,
  Clock, Globe, Navigation, Plane, AlertCircle,
  XCircle, Key, Database
} from 'lucide-react';
import { VenueImportDialog } from './venues/VenueImportDialog';
import { brandColors } from '@/theme/muiTheme';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { listFromWhere, listFrom } from '@/hooks/usePageFetchers';

interface VenueSource {
  id: string;
  name: string;
  slug: string;
  source_type: string;
  is_enabled: boolean;
  requires_api_key: string | null;
  edge_function: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  total_items_fetched: number | null;
  total_items_approved: number | null;
}

interface VenueStats {
  [source: string]: number;
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  'foursquare': <Navigation style={{ width: 24, height: 24 }} />,
  'google-places': <Globe style={{ width: 24, height: 24 }} />,
  'tomtom': <MapPin style={{ width: 24, height: 24 }} />,
  'tripadvisor': <Plane style={{ width: 24, height: 24 }} />,
  'spartacus': <Database style={{ width: 24, height: 24 }} />,
};

const PROVIDER_COLORS: Record<string, string> = {
  'foursquare': '#3b82f6',
  'google-places': '#22c55e',
  'tomtom': '#f97316',
  'tripadvisor': '#555555',
  'spartacus': '#a855f7',
};

const SLUG_TO_DATA_SOURCE: Record<string, string> = {
  'foursquare': 'foursquare',
  'google-places': 'google_places',
  'tomtom': 'tomtom',
  'tripadvisor': 'tripadvisor',
  'spartacus': 'spartacus',
};

const SLUG_TO_DIALOG_PROVIDER: Record<string, 'foursquare' | 'google-places' | 'tomtom' | 'tripadvisor'> = {
  'foursquare': 'foursquare',
  'google-places': 'google-places',
  'tomtom': 'tomtom',
  'tripadvisor': 'tripadvisor',
};

export const VenueImportQuickActions = () => {
  const { toast } = useToast();
  const [venueSources, setVenueSources] = useState<VenueSource[]>([]);
  const [venueStats, setVenueStats] = useState<VenueStats>({});
  const [totalVenues, setTotalVenues] = useState(0);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [apiKeyStatuses, setApiKeyStatuses] = useState<Record<string, 'configured' | 'missing' | 'error'>>({});

  const [importDialog, setImportDialog] = useState<{
    open: boolean;
    provider: 'foursquare' | 'google-places' | 'tomtom' | 'tripadvisor' | null;
  }>({ open: false, provider: null });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingData(true);

        const sources = await listFromWhere<VenueSource>(
          'ingestion_sources',
          'id, name, slug, source_type, is_enabled, requires_api_key, edge_function, last_run_at, last_success_at, last_error, total_items_fetched, total_items_approved',
          [{ col: 'target_table', val: 'venues' }],
          { order: { col: 'name', ascending: true } },
        );

        const knownSlugs = (sources || []).map(s => s.slug);
        const extraSources: VenueSource[] = [];

        if (!knownSlugs.includes('tomtom')) {
          extraSources.push({
            id: 'tomtom-manual',
            name: 'TomTom',
            slug: 'tomtom',
            source_type: 'api',
            is_enabled: true,
            requires_api_key: 'TOMTOM_API_KEY',
            edge_function: 'import-tomtom-venues',
            last_run_at: null,
            last_success_at: null,
            last_error: null,
            total_items_fetched: null,
            total_items_approved: null,
          });
        }

        setVenueSources([...(sources || []), ...extraSources]);

        const allVenues = await listFrom<{ data_source: string | null }>(
          'venues',
          'data_source',
        );

        const stats: VenueStats = {};
        let total = 0;
        for (const v of allVenues) {
          const src = v.data_source || 'manual';
          stats[src] = (stats[src] || 0) + 1;
          total++;
        }
        setVenueStats(stats);
        setTotalVenues(total);

        try {
          const { data: keyData, error: keyError } = await supabase.functions.invoke('manage-api-keys?action=status', {
            method: 'GET'
          });
          if (!keyError && keyData?.required_keys) {
            const statuses: Record<string, 'configured' | 'missing' | 'error'> = {};
            for (const rk of keyData.required_keys) {
              statuses[rk.key_name] = rk.status;
            }
            setApiKeyStatuses(statuses);
          }
        } catch {
          // optional
        }

      } catch (error) {
        console.error('Failed to fetch venue data:', error);
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, []);

  const getKeyStatus = (source: VenueSource): 'ready' | 'missing' | 'error' | 'not_needed' => {
    if (!source.requires_api_key) return 'not_needed';
    const status = apiKeyStatuses[source.requires_api_key];
    if (status === 'configured') return 'ready';
    if (status === 'error') return 'error';
    return 'missing';
  };

  const getKeyStatusBadge = (source: VenueSource) => {
    const status = getKeyStatus(source);
    switch (status) {
      case 'ready':
        return <Badge variant="default"><Key style={{ width: 10, height: 10 }} />API Ready</Badge>;
      case 'error':
        return <Badge variant="destructive"><AlertTriangle style={{ width: 10, height: 10 }} />Key Error</Badge>;
      case 'missing':
        return <Badge variant="destructive"><XCircle style={{ width: 10, height: 10 }} />Key Missing</Badge>;
      default:
        return <Badge variant="secondary">No Key Needed</Badge>;
    }
  };

  const getSourceVenueCount = (source: VenueSource): number => {
    const dataSource = SLUG_TO_DATA_SOURCE[source.slug] || source.slug;
    return venueStats[dataSource] || 0;
  };

  const getStatusIcon = (source: VenueSource) => {
    if (loadingStates[source.slug]) {
      return <RefreshCw style={{ width: 16, height: 16, animation: 'spin 1s linear infinite', color: '#3b82f6' }} />;
    }
    if (source.last_error) {
      return <AlertCircle style={{ width: 16, height: 16, color: '#ef4444' }} />;
    }
    if (source.last_success_at) {
      return <CheckCircle style={{ width: 16, height: 16, color: '#22c55e' }} />;
    }
    return <Clock style={{ width: 16, height: 16, color: '#9ca3af' }} />;
  };

  const getStatusText = (source: VenueSource) => {
    if (loadingStates[source.slug]) return 'Importing...';
    if (source.last_error) return source.last_error.slice(0, 60);
    if (source.last_success_at) {
      const date = new Date(source.last_success_at);
      return `Last success: ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (source.last_run_at) {
      const date = new Date(source.last_run_at);
      return `Last run: ${date.toLocaleDateString()}`;
    }
    return 'Never imported';
  };

  const handleImportClick = async (source: VenueSource) => {
    const dialogProvider = SLUG_TO_DIALOG_PROVIDER[source.slug];
    if (dialogProvider) {
      setImportDialog({ open: true, provider: dialogProvider });
    } else if (source.source_type === 'scraper' && source.edge_function) {
      setLoadingStates(prev => ({ ...prev, [source.slug]: true }));
      try {
        const { error } = await supabase.functions.invoke(source.edge_function, { body: {} });
        if (error) throw error;
        toast({
          title: 'Scraper Started',
          description: `${source.name} scraper has been triggered. Check the Pipeline tab for progress.`,
        });
      } catch (error) {
        toast({
          title: 'Import Failed',
          description: error instanceof Error ? error.message : 'An error occurred',
          variant: 'destructive'
        });
      } finally {
        setLoadingStates(prev => ({ ...prev, [source.slug]: false }));
      }
    }
  };

  const handleImportConfig = async (config: Record<string, unknown>) => {
    if (!importDialog.provider) return;
    setLoadingStates(prev => ({ ...prev, [importDialog.provider!]: true }));

    try {
      const functionName = `import-${importDialog.provider}-venues`;
      const { error } = await supabase.functions.invoke(functionName, { body: { config } });
      if (error) throw error;

      toast({
        title: 'Import Started',
        description: `Venue import has been initiated`,
      });
      setImportDialog({ open: false, provider: null });
    } catch (error) {
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'An error occurred during import',
        variant: 'destructive'
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, [importDialog.provider!]: false }));
    }
  };

  const canImport = (source: VenueSource): boolean => {
    if (loadingStates[source.slug]) return false;
    const keyStatus = getKeyStatus(source);
    if (keyStatus === 'missing') return false;
    return true;
  };

  const getImportButtonText = (source: VenueSource): string => {
    if (loadingStates[source.slug]) return 'Importing...';
    const keyStatus = getKeyStatus(source);
    if (keyStatus === 'missing') return 'API Key Missing';
    if (keyStatus === 'error') return 'Import (Key Issue)';
    if (source.source_type === 'scraper') return 'Run Scraper';
    return 'Configure Import';
  };

  const manualCount = venueStats['manual'] || 0;
  const nullCount = Object.entries(venueStats)
    .filter(([k]) => !Object.values(SLUG_TO_DATA_SOURCE).includes(k) && k !== 'manual')
    .reduce((sum, [, v]) => sum + v, 0);
  const importedCount = totalVenues - manualCount - nullCount;
  const activeSources = venueSources.filter(s => s.last_success_at).length;

  if (loadingData) {
    return (
      <div className="flex flex-col gap-6">
        <h5 className="text-xl font-semibold">Venue Imports</h5>
        <div className="flex justify-center p-8">
          <RefreshCw style={{ width: 24, height: 24, animation: 'spin 1s linear infinite', color: '#6b7280' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h5 className="text-xl font-semibold">Venue Imports</h5>
          <p className="text-muted-foreground">
            Import venues from APIs and scrapers — sources loaded from ingestion registry
          </p>
        </div>
        <Badge variant="secondary">
          <Database style={{ width: 12, height: 12 }} />
          Data-Driven
        </Badge>
      </div>

      {/* Overall Stats */}
      <Card>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-3 rounded-md" style={{ backgroundColor: '#eff6ff' }}>
              <div className="text-xl font-semibold" style={{ color: '#2563eb' }}>{totalVenues.toLocaleString()}</div>
              <div className="text-xs" style={{ color: '#2563eb' }}>Total Venues</div>
            </div>
            <div className="text-center p-3 rounded-md" style={{ backgroundColor: '#f0fdf4' }}>
              <div className="text-xl font-semibold" style={{ color: '#16a34a' }}>{(manualCount + nullCount).toLocaleString()}</div>
              <div className="text-xs" style={{ color: '#16a34a' }}>Manual / Other</div>
            </div>
            <div className="text-center p-3 rounded-md" style={{ backgroundColor: '#fff7ed' }}>
              <div className="text-xl font-semibold" style={{ color: '#ea580c' }}>{importedCount.toLocaleString()}</div>
              <div className="text-xs" style={{ color: '#ea580c' }}>Imported</div>
            </div>
            <div className="text-center p-3 rounded-md" style={{ backgroundColor: '#faf5ff' }}>
              <div className="text-xl font-semibold" style={{ color: brandColors.main }}>{activeSources}</div>
              <div className="text-xs" style={{ color: brandColors.main }}>Active Sources</div>
            </div>
            <div className="text-center p-3 rounded-md" style={{ backgroundColor: '#fef2f2' }}>
              <div className="text-xl font-semibold" style={{ color: '#dc2626' }}>{venueSources.length}</div>
              <div className="text-xs" style={{ color: '#dc2626' }}>Registered Sources</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Provider Cards Grid */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
        style={{
          gridTemplateColumns: undefined,
        }}
      >
        {venueSources.map((source) => {
          const color = PROVIDER_COLORS[source.slug] || '#6b7280';
          const icon = PROVIDER_ICONS[source.slug] || <Globe style={{ width: 24, height: 24 }} />;
          const venueCount = getSourceVenueCount(source);

          return (
            <Card key={source.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-md text-white" style={{ backgroundColor: color }}>
                    {icon}
                  </div>
                  <div className="flex items-center gap-1">
                    {getKeyStatusBadge(source)}
                    {getStatusIcon(source)}
                  </div>
                </div>
                <CardTitle>{source.name}</CardTitle>
                <CardDescription>
                  {source.source_type === 'scraper' ? 'Web scraper' : 'API import'} &middot; {source.is_enabled ? 'Enabled' : 'Disabled'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Stats */}
                <div className="flex justify-between">
                  <p className="text-sm text-muted-foreground">Venues in DB:</p>
                  <p className="text-sm font-semibold">{venueCount.toLocaleString()}</p>
                </div>
                {source.total_items_fetched != null && (
                  <div className="flex justify-between">
                    <p className="text-sm text-muted-foreground">Total Fetched:</p>
                    <p className="text-sm font-semibold">{source.total_items_fetched.toLocaleString()}</p>
                  </div>
                )}

                {/* Status */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                    {getStatusText(source)}
                  </span>
                </div>

                {source.last_error && (
                  <div
                    className="p-2 rounded"
                    style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
                  >
                    <span className="text-xs" style={{ color: '#dc2626' }}>
                      {source.last_error.slice(0, 80)}{source.last_error.length > 80 ? '...' : ''}
                    </span>
                  </div>
                )}

                {/* Progress bar */}
                {loadingStates[source.slug] && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs">Processing...</span>
                    <Progress value={45} />
                  </div>
                )}

                {/* Action Button */}
                <Button
                  size="sm"
                  variant={canImport(source) ? "default" : "secondary"}
                  disabled={!canImport(source)}
                  onClick={() => handleImportClick(source)}
                >
                  {loadingStates[source.slug] ? (
                    <>
                      <RefreshCw style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Search style={{ width: 16, height: 16 }} />
                      {getImportButtonText(source)}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Venue Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Download style={{ width: 20, height: 20 }} />
            Venue Source Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {Object.entries(venueStats)
              .sort(([, a], [, b]) => b - a)
              .map(([source, count]) => (
                <div
                  key={source}
                  className="flex items-center justify-between p-2 rounded"
                  style={{ backgroundColor: 'rgba(0,0,0,0.02)' }}
                >
                  <p className="text-sm font-medium">
                    {source === 'manual' ? 'Manual / Untagged' : source}
                  </p>
                  <div className="flex items-center gap-2">
                    <div
                      className="rounded-md"
                      style={{
                        width: Math.max(4, (count / totalVenues) * 200),
                        height: 8,
                        backgroundColor: PROVIDER_COLORS[source] || '#94a3b8',
                      }}
                    />
                    <p className="text-sm font-semibold text-right" style={{ minWidth: 50 }}>
                      {count.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Import Dialog */}
      {importDialog.provider && (
        <VenueImportDialog
          open={importDialog.open}
          onOpenChange={(open) => setImportDialog({ open, provider: importDialog.provider })}
          provider={importDialog.provider}
          onImport={handleImportConfig}
          isImporting={loadingStates[importDialog.provider] || false}
        />
      )}
    </div>
  );
};
