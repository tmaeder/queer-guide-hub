import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  MapPin, Search, Download, RefreshCw, CheckCircle, AlertTriangle, 
  Clock, Zap, Globe, Navigation, Plane
} from 'lucide-react';
import { VenueImportDialog } from './venues/VenueImportDialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface VenueProvider {
  id: 'foursquare' | 'google-places' | 'tomtom' | 'tripadvisor';
  name: string;
  icon: React.ReactNode;
  description: string;
  color: string;
  isLoading: boolean;
  lastImport?: string;
  totalVenues?: number;
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

  const providers: VenueProvider[] = [
    {
      id: 'foursquare',
      name: 'Foursquare',
      icon: <Navigation className="h-6 w-6" />,
      description: 'Import venues from Foursquare with detailed business information',
      color: 'bg-blue-500',
      isLoading: loadingStates.foursquare,
      lastImport: '2 hours ago',
      totalVenues: 1234
    },
    {
      id: 'google-places',
      name: 'Google Places',
      icon: <Globe className="h-6 w-6" />,
      description: 'Import venues from Google Places with comprehensive location data',
      color: 'bg-green-500',
      isLoading: loadingStates['google-places'],
      lastImport: '4 hours ago',
      totalVenues: 2156
    },
    {
      id: 'tomtom',
      name: 'TomTom',
      icon: <MapPin className="h-6 w-6" />,
      description: 'Import venues from TomTom with accurate mapping information',
      color: 'bg-orange-500',
      isLoading: loadingStates.tomtom,
      lastImport: '1 day ago',
      totalVenues: 892
    },
    {
      id: 'tripadvisor',
      name: 'TripAdvisor',
      icon: <Plane className="h-6 w-6" />,
      description: 'Import venues from TripAdvisor with reviews and ratings',
      color: 'bg-purple-500',
      isLoading: loadingStates.tripadvisor,
      lastImport: '3 days ago',
      totalVenues: 567
    }
  ];

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
    if (provider.isLoading) {
      return <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />;
    }
    if (provider.lastImport) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    return <Clock className="h-4 w-4 text-gray-400" />;
  };

  const getStatusText = (provider: VenueProvider) => {
    if (provider.isLoading) return 'Importing...';
    if (provider.lastImport) return `Last: ${provider.lastImport}`;
    return 'Never imported';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Venue Imports</h2>
          <p className="text-muted-foreground">
            Import venues from multiple providers with customizable search terms
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Zap className="h-3 w-3" />
          Quick Actions
        </Badge>
      </div>

      {/* Provider Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {providers.map((provider) => (
          <Card key={provider.id} className="relative overflow-hidden hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className={`p-2 rounded-lg ${provider.color} text-white`}>
                  {provider.icon}
                </div>
                {getStatusIcon(provider)}
              </div>
              <CardTitle className="text-lg">{provider.name}</CardTitle>
              <CardDescription className="text-sm">
                {provider.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stats */}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Venues:</span>
                <span className="font-semibold">{provider.totalVenues?.toLocaleString()}</span>
              </div>

              {/* Status */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{getStatusText(provider)}</span>
              </div>

              {/* Progress bar for loading state */}
              {provider.isLoading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span>Importing venues...</span>
                    <span>Processing</span>
                  </div>
                  <Progress value={45} className="h-2" />
                </div>
              )}

              {/* Action Button */}
              <Button
                className="w-full gap-2"
                size="sm"
                variant={provider.isLoading ? "secondary" : "default"}
                disabled={provider.isLoading}
                onClick={() => setImportDialog({ open: true, provider: provider.id })}
              >
                {provider.isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    Configure Import
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Download className="h-5 w-5" />
            Import Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {providers.reduce((sum, p) => sum + (p.totalVenues || 0), 0).toLocaleString()}
              </div>
              <div className="text-sm text-blue-600">Total Venues</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {providers.filter(p => p.lastImport).length}
              </div>
              <div className="text-sm text-green-600">Active Sources</div>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">
                {providers.filter(p => p.isLoading).length}
              </div>
              <div className="text-sm text-orange-600">Currently Importing</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">4</div>
              <div className="text-sm text-purple-600">Available Providers</div>
            </div>
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
          isImporting={loadingStates[importDialog.provider]}
        />
      )}
    </div>
  );
};