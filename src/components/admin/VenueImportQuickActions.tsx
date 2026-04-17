import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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

// Map ingestion_sources slug to the data_source value stored in venues table
const SLUG_TO_DATA_SOURCE: Record<string, string> = {
  'foursquare': 'foursquare',
  'google-places': 'google_places',
  'tomtom': 'tomtom',
  'tripadvisor': 'tripadvisor',
  'spartacus': 'spartacus',
};

// Map slug to the VenueImportDialog provider type (only for API-based providers)
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

  // Fetch venue sources from ingestion_sources
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingData(true);

        // Fetch venue-related ingestion sources
        const { data: sources, error: sourcesError } = await supabase
          .from('ingestion_sources')
          .select('id, name, slug, source_type, is_enabled, requires_api_key, edge_function, last_run_at, last_success_at, last_error, total_items_fetched, total_items_approved')
          .eq('target_table', 'venues')
          .order('name');

        if (sourcesError) throw sourcesError;

        // Also include known venue import providers not in ingestion_sources
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

        // Fetch venue counts grouped by data_source using RPC or aggregation
        // Use a count query per data_source to avoid fetching all rows
        const { data: allVenues, error: venueError } = await supabase
          .from('venues')
          .select('data_source');

        if (venueError) throw venueError;

        const stats: VenueStats = {};
        let total = 0;
        for (const v of (allVenues || [])) {
          const src = v.data_source || 'manual';
          stats[src] = (stats[src] || 0) + 1;
          total++;
        }
        setVenueStats(stats);
        setTotalVenues(total);

        // Fetch API key statuses
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
          // API key status check is optional — don't block the UI
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
      // API-based provider — open the VenueImportDialog
      setImportDialog({ open: true, provider: dialogProvider });
    } else if (source.source_type === 'scraper' && source.edge_function) {
      // Scraper — invoke directly
      setLoadingStates(prev => ({ ...prev, [source.slug]: true }));
      try {
        const { _data, error } = await supabase.functions.invoke(source.edge_function, {
          body: {}
        });
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
      const { _data, error } = await supabase.functions.invoke(functionName, {
        body: { config }
      });
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

  // Compute manual/other stats
  const manualCount = venueStats['manual'] || 0;
  const nullCount = Object.entries(venueStats)
    .filter(([k]) => !Object.values(SLUG_TO_DATA_SOURCE).includes(k) && k !== 'manual')
    .reduce((sum, [, v]) => sum + v, 0);
  const importedCount = totalVenues - manualCount - nullCount;
  const activeSources = venueSources.filter(s => s.last_success_at).length;

  if (loadingData) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Typography variant="h5">Venue Imports</Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <RefreshCw style={{ width: 24, height: 24, animation: 'spin 1s linear infinite', color: '#6b7280' }} />
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5">Venue Imports</Typography>
          <Typography color="text.secondary">
            Import venues from APIs and scrapers — sources loaded from ingestion registry
          </Typography>
        </Box>
        <Badge variant="secondary">
          <Database style={{ width: 12, height: 12 }} />
          Data-Driven
        </Badge>
      </Box>

      {/* Overall Stats */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, gap: 2 }}>
            <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: '#eff6ff', borderRadius: 2 }}>
              <Typography variant="h5" sx={{ color: '#2563eb' }}>{totalVenues.toLocaleString()}</Typography>
              <Typography variant="caption" sx={{ color: '#2563eb' }}>Total Venues</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: '#f0fdf4', borderRadius: 2 }}>
              <Typography variant="h5" sx={{ color: '#16a34a' }}>{(manualCount + nullCount).toLocaleString()}</Typography>
              <Typography variant="caption" sx={{ color: '#16a34a' }}>Manual / Other</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: '#fff7ed', borderRadius: 2 }}>
              <Typography variant="h5" sx={{ color: '#ea580c' }}>{importedCount.toLocaleString()}</Typography>
              <Typography variant="caption" sx={{ color: '#ea580c' }}>Imported</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: '#faf5ff', borderRadius: 2 }}>
              <Typography variant="h5" sx={{ color: brandColors.main }}>{activeSources}</Typography>
              <Typography variant="caption" sx={{ color: brandColors.main }}>Active Sources</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: '#fef2f2', borderRadius: 2 }}>
              <Typography variant="h5" sx={{ color: '#dc2626' }}>{venueSources.length}</Typography>
              <Typography variant="caption" sx={{ color: '#dc2626' }}>Registered Sources</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Provider Cards Grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: `repeat(${Math.min(venueSources.length, 4)}, 1fr)` }, gap: 2 }}>
        {venueSources.map((source) => {
          const color = PROVIDER_COLORS[source.slug] || '#6b7280';
          const icon = PROVIDER_ICONS[source.slug] || <Globe style={{ width: 24, height: 24 }} />;
          const venueCount = getSourceVenueCount(source);

          return (
            <Card key={source.id}>
              <CardHeader>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ p: 1, borderRadius: 2, color: 'white', bgcolor: color }}>
                    {icon}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {getKeyStatusBadge(source)}
                    {getStatusIcon(source)}
                  </Box>
                </Box>
                <CardTitle>{source.name}</CardTitle>
                <CardDescription>
                  {source.source_type === 'scraper' ? 'Web scraper' : 'API import'} &middot; {source.is_enabled ? 'Enabled' : 'Disabled'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Stats */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Venues in DB:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{venueCount.toLocaleString()}</Typography>
                </Box>
                {source.total_items_fetched != null && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Total Fetched:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{source.total_items_fetched.toLocaleString()}</Typography>
                  </Box>
                )}

                {/* Status */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {getStatusText(source)}
                  </Typography>
                </Box>

                {source.last_error && (
                  <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <Typography variant="caption" sx={{ color: '#dc2626' }}>
                      {source.last_error.slice(0, 80)}{source.last_error.length > 80 ? '...' : ''}
                    </Typography>
                  </Box>
                )}

                {/* Progress bar for loading state */}
                {loadingStates[source.slug] && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Typography variant="caption">Processing...</Typography>
                    <Progress value={45} />
                  </Box>
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
      </Box>

      {/* Venue Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Download style={{ width: 20, height: 20 }} />
            Venue Source Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {Object.entries(venueStats)
              .sort(([, a], [, b]) => b - a)
              .map(([source, count]) => (
                <Box key={source} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.02)' }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {source === 'manual' ? 'Manual / Untagged' : source}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: Math.max(4, (count / totalVenues) * 200), height: 8, borderRadius: 4, bgcolor: PROVIDER_COLORS[source] || '#94a3b8' }} />
                    <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 50, textAlign: 'right' }}>
                      {count.toLocaleString()}
                    </Typography>
                  </Box>
                </Box>
              ))}
          </Box>
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
    </Box>
  );
};
