import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  MapPin, Search, Download, RefreshCw, CheckCircle, AlertTriangle,
  Clock, Zap, Globe, Navigation, Plane, Activity, TrendingUp, AlertCircle
} from 'lucide-react';
import { VenueImportDialog } from './venues/VenueImportDialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ImportStatus {
  isRunning: boolean;
  lastResult?: {
    imported: number;
    updated: number;
    skipped: number;
    timestamp: string;
    success: boolean;
    error?: string;
  };
}

interface VenueProvider {
  id: 'foursquare' | 'google-places' | 'tomtom' | 'tripadvisor';
  name: string;
  icon: React.ReactNode;
  description: string;
  color: string;
  isLoading: boolean;
  lastImport?: string;
  totalVenues?: number;
  status?: ImportStatus;
}

export const VenueImportQuickActions = () => {
  const { toast } = useToast();
  const [importDialog, setImportDialog] = useState<{
    open: boolean;
    provider: 'foursquare' | 'google-places' | 'tomtom' | 'tripadvisor' | null;
  }>({ open: false, provider: null });

  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({
    foursquare: false,
    'google-places': false,
    tomtom: false,
    tripadvisor: false
  });

  const [importStatuses, setImportStatuses] = useState<Record<string, ImportStatus>>({
    foursquare: { isRunning: false },
    'google-places': { isRunning: false },
    tomtom: { isRunning: false },
    tripadvisor: { isRunning: false }
  });

  const [venueStats, setVenueStats] = useState<Record<string, number>>({});

  // Fetch real venue counts by data source
  useEffect(() => {
    const fetchVenueStats = async () => {
      try {
        const { data, error } = await supabase
          .from('venues')
          .select('data_source');

        if (error) throw error;

        const stats = (data || []).reduce((acc: Record<string, number>, venue: any) => {
          const source = venue.data_source || 'unknown';
          acc[source] = (acc[source] || 0) + 1;
          return acc;
        }, {});
        setVenueStats(stats);
      } catch (error) {
        console.error('Failed to fetch venue stats:', error);
      }
    };

    fetchVenueStats();
  }, []);

  // Provider configuration with real stats
  const getEnhancedProviders = (): VenueProvider[] => {
    return [
      {
        id: 'foursquare',
        name: 'Foursquare',
        icon: <Navigation style={{ width: 24, height: 24 }} />,
        description: 'Import venues from Foursquare with detailed business information',
        color: 'bg-blue-500',
        isLoading: loadingStates.foursquare,
        totalVenues: venueStats['foursquare'] || 0,
        status: importStatuses.foursquare
      },
      {
        id: 'google-places',
        name: 'Google Places',
        icon: <Globe style={{ width: 24, height: 24 }} />,
        description: 'Import venues from Google Places with comprehensive location data',
        color: 'bg-green-500',
        isLoading: loadingStates['google-places'],
        totalVenues: venueStats['google_places'] || 0,
        status: importStatuses['google-places']
      },
      {
        id: 'tomtom',
        name: 'TomTom',
        icon: <MapPin style={{ width: 24, height: 24 }} />,
        description: 'Import venues from TomTom with accurate mapping information',
        color: 'bg-orange-500',
        isLoading: loadingStates.tomtom,
        totalVenues: venueStats['tomtom'] || 0,
        status: importStatuses.tomtom
      },
      {
        id: 'tripadvisor',
        name: 'TripAdvisor',
        icon: <Plane style={{ width: 24, height: 24 }} />,
        description: 'Import venues from TripAdvisor with reviews and ratings',
        color: 'bg-purple-500',
        isLoading: loadingStates.tripadvisor,
        totalVenues: venueStats['tripadvisor'] || 0,
        status: importStatuses.tripadvisor
      }
    ];
  };

  const providers = getEnhancedProviders();

  const handleImportConfig = async (config: any) => {
    if (!importDialog.provider) return;

    setLoadingStates(prev => ({ ...prev, [importDialog.provider!]: true }));

    try {
      const functionName = `import-${importDialog.provider}-venues`;
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { config }
      });

      if (error) throw error;

      toast({
        title: 'Import Started',
        description: `${providers.find(p => p.id === importDialog.provider)?.name} venue import has been initiated`,
      });

      setImportDialog({ open: false, provider: null });
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'An error occurred during import',
        variant: 'destructive'
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, [importDialog.provider!]: false }));
    }
  };

  const getStatusIcon = (provider: VenueProvider) => {
    if (provider.isLoading || provider.status?.isRunning) {
      return <RefreshCw style={{ width: 16, height: 16, animation: 'spin 1s linear infinite', color: '#3b82f6' }} />;
    }
    if (provider.status?.lastResult?.error) {
      return <AlertCircle style={{ width: 16, height: 16, color: '#ef4444' }} />;
    }
    if (provider.status?.lastResult?.success) {
      return <CheckCircle style={{ width: 16, height: 16, color: '#22c55e' }} />;
    }
    if (provider.lastImport) {
      return <CheckCircle style={{ width: 16, height: 16, color: '#22c55e' }} />;
    }
    return <Clock style={{ width: 16, height: 16, color: '#9ca3af' }} />;
  };

  const getStatusText = (provider: VenueProvider) => {
    if (provider.isLoading || provider.status?.isRunning) return 'Importing...';
    if (provider.status?.lastResult?.error) return 'Failed';
    if (provider.status?.lastResult) {
      const { imported, updated, skipped } = provider.status.lastResult;
      return `+${imported} new, ~${updated} updated, =${skipped} skipped`;
    }
    if (provider.lastImport) return `Last: ${provider.lastImport}`;
    return 'Never imported';
  };

  const getStatusBadge = (provider: VenueProvider) => {
    if (provider.isLoading || provider.status?.isRunning) {
      return <Badge variant="secondary" sx={{ gap: 0.5 }}><Activity style={{ width: 12, height: 12 }} />Running</Badge>;
    }
    if (provider.status?.lastResult?.error) {
      return <Badge variant="destructive" sx={{ gap: 0.5 }}><AlertTriangle style={{ width: 12, height: 12 }} />Error</Badge>;
    }
    if (provider.status?.lastResult?.success) {
      return <Badge variant="default" sx={{ gap: 0.5 }}><TrendingUp style={{ width: 12, height: 12 }} />Success</Badge>;
    }
    return null;
  };

  const getProviderColor = (id: string) => {
    switch (id) {
      case 'foursquare': return '#3b82f6';
      case 'google-places': return '#22c55e';
      case 'tomtom': return '#f97316';
      case 'tripadvisor': return '#555555';
      default: return '#6b7280';
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5">Venue Imports</Typography>
          <Typography color="text.secondary">
            Import venues from multiple providers with customizable search terms
          </Typography>
        </Box>
        <Badge variant="secondary" sx={{ gap: 0.5 }}>
          <Zap style={{ width: 12, height: 12 }} />
          Quick Actions
        </Badge>
      </Box>

      {/* Provider Cards Grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
        {providers.map((provider) => (
          <Card key={provider.id} sx={{ position: 'relative', overflow: 'hidden', '&:hover': { boxShadow: 6 }, transition: 'all 0.2s' }}>
            <CardHeader sx={{ pb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ p: 1, borderRadius: 2, color: 'white', bgcolor: getProviderColor(provider.id) }}>
                  {provider.icon}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {getStatusBadge(provider)}
                  {getStatusIcon(provider)}
                </Box>
              </Box>
              <CardTitle sx={{ fontSize: '1.125rem' }}>{provider.name}</CardTitle>
              <CardDescription>
                {provider.description}
              </CardDescription>
            </CardHeader>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Stats */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Total Venues:</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{provider.totalVenues?.toLocaleString()}</Typography>
              </Box>

              {/* Status with more detailed information */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="caption" color="text.secondary">{getStatusText(provider)}</Typography>
                </Box>
                {provider.status?.lastResult && !provider.status.lastResult.error && (
                  <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'success.light', color: 'success.dark' }}>
                    <Typography variant="caption">
                      Last import: {provider.status.lastResult.imported + provider.status.lastResult.updated} venues processed
                    </Typography>
                  </Box>
                )}
                {provider.status?.lastResult?.error && (
                  <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'error.light', color: 'error.dark' }}>
                    <Typography variant="caption">
                      Error: {provider.status.lastResult.error}
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* Progress bar for loading state */}
              {provider.isLoading && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption">Importing venues...</Typography>
                    <Typography variant="caption">Processing</Typography>
                  </Box>
                  <Progress value={45} sx={{ height: 8 }} />
                </Box>
              )}

              {/* Action Button */}
              <Button
                sx={{ width: '100%', gap: 1 }}
                size="sm"
                variant={provider.isLoading ? "secondary" : "default"}
                disabled={provider.isLoading}
                onClick={() => setImportDialog({ open: true, provider: provider.id })}
              >
                {provider.isLoading ? (
                  <>
                    <RefreshCw style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
                    Importing...
                  </>
                ) : (
                  <>
                    <Search style={{ width: 16, height: 16 }} />
                    Configure Import
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Quick Stats */}
      <Card>
        <CardHeader>
          <CardTitle sx={{ fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Download style={{ width: 20, height: 20 }} />
            Import Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#eff6ff', borderRadius: 2 }}>
              <Typography variant="h5" sx={{ color: '#2563eb' }}>
                {providers.reduce((sum, p) => sum + (p.totalVenues || 0), 0).toLocaleString()}
              </Typography>
              <Typography variant="body2" sx={{ color: '#2563eb' }}>Total Venues</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#f0fdf4', borderRadius: 2 }}>
              <Typography variant="h5" sx={{ color: '#16a34a' }}>
                {providers.filter(p => p.lastImport).length}
              </Typography>
              <Typography variant="body2" sx={{ color: '#16a34a' }}>Active Sources</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#fff7ed', borderRadius: 2 }}>
              <Typography variant="h5" sx={{ color: '#ea580c' }}>
                {providers.filter(p => p.isLoading).length}
              </Typography>
              <Typography variant="body2" sx={{ color: '#ea580c' }}>Currently Importing</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#faf5ff', borderRadius: 2 }}>
              <Typography variant="h5" sx={{ color: '#333333' }}>4</Typography>
              <Typography variant="body2" sx={{ color: '#333333' }}>Available Providers</Typography>
            </Box>
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
          isImporting={loadingStates[importDialog.provider]}
        />
      )}
    </Box>
  );
};
