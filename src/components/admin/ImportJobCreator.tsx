import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useImportHub } from '@/hooks/useImportHub';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Upload, FileText, Globe, Database, AlertTriangle, Info, Eye,
  Settings, Filter, CheckCircle, X, Plus, RefreshCw, MapPin, Calendar,
  Users, Building, Shield, Tag, ShoppingCart, BookOpen, Newspaper, Sliders
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { VenueImportDialog } from './venues/VenueImportDialog';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

const IMPORT_TYPES = {
  // Venues
  'venues-csv': {
    label: 'Venues CSV',
    description: 'Import venue data from CSV files',
    requiredFields: ['name', 'address', 'city', 'country'],
    optionalFields: ['description', 'website', 'phone', 'latitude', 'longitude', 'tags'],
    icon: 'MapPin'
  },
  'venues-foursquare': {
    label: 'Venues - Foursquare API',
    description: 'Import venues from Foursquare with custom search terms',
    requiredFields: ['locations', 'search_terms'],
    optionalFields: ['limit', 'radius', 'categories', 'filters'],
    icon: 'MapPin'
  },
  'venues-google-places': {
    label: 'Venues - Google Places API',
    description: 'Import venues from Google Places with custom search terms',
    requiredFields: ['locations', 'search_terms'],
    optionalFields: ['limit', 'radius', 'categories', 'filters'],
    icon: 'MapPin'
  },
  'venues-tomtom': {
    label: 'Venues - TomTom API',
    description: 'Import venues from TomTom with custom search terms',
    requiredFields: ['locations', 'search_terms'],
    optionalFields: ['limit', 'radius', 'categories', 'filters'],
    icon: 'MapPin'
  },
  'venues-tripadvisor': {
    label: 'Venues - TripAdvisor API',
    description: 'Import venues from TripAdvisor with custom search terms',
    requiredFields: ['locations', 'search_terms'],
    optionalFields: ['limit', 'radius', 'categories', 'filters'],
    icon: 'MapPin'
  },

  // Events
  'events-csv': {
    label: 'Events CSV',
    description: 'Import event data from CSV files',
    requiredFields: ['title', 'start_date', 'venue_name', 'city', 'country'],
    optionalFields: ['description', 'end_date', 'website', 'ticket_url', 'price_min', 'price_max'],
    icon: 'Calendar'
  },
  'events-eventbrite': {
    label: 'Events - Eventbrite API',
    description: 'Import events from Eventbrite',
    requiredFields: ['event_ids'],
    optionalFields: ['categories', 'locations', 'date_range'],
    icon: 'Calendar'
  },
  'events-ticketmaster': {
    label: 'Events - Ticketmaster API',
    description: 'Import events from Ticketmaster',
    requiredFields: ['locations'],
    optionalFields: ['categories', 'date_range', 'keywords'],
    icon: 'Calendar'
  },
  'events-bulk-scrape': {
    label: 'Events - Bulk Scraper',
    description: 'Bulk scrape events from multiple sources',
    requiredFields: ['sources', 'locations'],
    optionalFields: ['date_range', 'categories', 'filters'],
    icon: 'Calendar'
  },

  // Personalities
  'personalities-csv': {
    label: 'Personalities CSV',
    description: 'Import personality/people data from CSV files',
    requiredFields: ['name'],
    optionalFields: ['description', 'image_url', 'website', 'social_links', 'birth_date', 'death_date'],
    icon: 'Users'
  },
  'personalities-adult-models': {
    label: 'Adult Models CSV',
    description: 'Import adult model data from CSV files',
    requiredFields: ['name'],
    optionalFields: ['description', 'image_url', 'website', 'social_links'],
    icon: 'Users'
  },
  'personalities-bulk-create': {
    label: 'Bulk Create Personalities',
    description: 'Bulk create personalities with AI assistance',
    requiredFields: ['count', 'categories'],
    optionalFields: ['locations', 'attributes'],
    icon: 'Users'
  },

  // Geographic Data
  'cities-data': {
    label: 'Cities Data',
    description: 'Import city information and metadata',
    requiredFields: ['city_names'],
    optionalFields: ['country_filter', 'data_sources'],
    icon: 'Building'
  },
  'countries-data': {
    label: 'Countries Data',
    description: 'Import country information and metadata',
    requiredFields: [],
    optionalFields: ['data_sources', 'update_existing'],
    icon: 'Globe'
  },
  'ilga-data': {
    label: 'ILGA LGBT Rights Data',
    description: 'Import LGBT rights data from ILGA',
    requiredFields: [],
    optionalFields: ['countries', 'force_update'],
    icon: 'Shield'
  },

  // Tags & Categories
  'tags-csv': {
    label: 'Tags CSV',
    description: 'Import tags and categories from CSV files',
    requiredFields: ['name', 'category'],
    optionalFields: ['description', 'color', 'icon'],
    icon: 'Tag'
  },
  'tags-bulk-ai': {
    label: 'Bulk Create AI Tags',
    description: 'Generate tags using AI for existing content',
    requiredFields: ['content_type'],
    optionalFields: ['categories', 'count'],
    icon: 'Tag'
  },
  'tags-categorize': {
    label: 'Categorize Tags',
    description: 'Automatically categorize existing tags using AI',
    requiredFields: [],
    optionalFields: ['categories', 'force_recategorize'],
    icon: 'Tag'
  },

  // Resources & Marketplace
  'marketplace-awin': {
    label: 'AWIN Products',
    description: 'Import products from AWIN affiliate network',
    requiredFields: ['advertiser_ids'],
    optionalFields: ['categories', 'regions', 'filters'],
    icon: 'ShoppingCart'
  },

  // Restrooms & Accessibility
  'restrooms-refuge': {
    label: 'Refuge Restrooms',
    description: 'Import restroom data from Refuge Restrooms API',
    requiredFields: [],
    optionalFields: ['locations', 'accessibility_filters'],
    icon: 'MapPin'
  },

  // Wikipedia Data
  'wikipedia-data': {
    label: 'Wikipedia Data',
    description: 'Import data from Wikipedia articles',
    requiredFields: ['article_titles'],
    optionalFields: ['languages', 'extract_images'],
    icon: 'BookOpen'
  },

  // News
  'news-sources': {
    label: 'News Sources',
    description: 'Configure and import from news sources',
    requiredFields: ['source_urls'],
    optionalFields: ['categories', 'keywords', 'frequency'],
    icon: 'Newspaper'
  }
};

const DUPLICATE_STRATEGIES = {
  skip: {
    label: 'Skip Duplicates',
    description: 'Skip records that already exist based on unique key fields'
  },
  overwrite: {
    label: 'Overwrite Duplicates',
    description: 'Replace existing records with new data'
  },
  create_new: {
    label: 'Create New',
    description: 'Create new records even if duplicates exist'
  }
};

export const ImportJobCreator = () => {
  const { createImportJob, parseCSVPreview, loading } = useImportHub();
  const { toast } = useToast();

  const [importType, setImportType] = useState<string>('');
  const [sourceType, setSourceType] = useState<'csv' | 'api' | 'web_scraping'>('csv');
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'overwrite' | 'create_new'>('skip');
  const [uniqueKeyFields, setUniqueKeyFields] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string>('');
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [apiEndpoint, setApiEndpoint] = useState<string>('');
  const [validationRules, setValidationRules] = useState<Record<string, any>>({});
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [fileName, setFileName] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showVenueImportDialog, setShowVenueImportDialog] = useState(false);

  // Scraper config state
  const [scraperConfig, setScraperConfig] = useState<{
    events: { cities: string[]; maxCities: number };
    spartacus: { venueTypes: string[]; countries: string[]; maxCitiesPerCountry: number; discoverCities: boolean };
  }>({
    events: {
      cities: ['berlin', 'amsterdam', 'barcelona', 'london', 'paris', 'new-york', 'san-francisco', 'los-angeles', 'miami', 'chicago'],
      maxCities: 10
    },
    spartacus: {
      venueTypes: ['saunas', 'goingout'],
      countries: ['germany', 'spain', 'uk', 'usa'],
      maxCitiesPerCountry: 5,
      discoverCities: false,
    }
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load cities from DB for event scraper city picker
  const [allCities, setAllCities] = useState<{ name: string; country: string }[]>([]);
  const [citySearch, setCitySearch] = useState('');

  useEffect(() => {
    const loadCities = async () => {
      const { data } = await supabase
        .from('cities')
        .select('name, countries!inner(name)')
        .order('name');
      if (data) {
        setAllCities(data.map((c: any) => ({
          name: c.name,
          country: (c.countries as any)?.name || ''
        })));
      }
    };
    loadCities();
  }, []);

  const isVenueApiImport = importType.startsWith('venues-') && !importType.endsWith('-csv');

  const getVenueProvider = (): 'foursquare' | 'google-places' | 'tomtom' | 'tripadvisor' | null => {
    if (importType === 'venues-foursquare') return 'foursquare';
    if (importType === 'venues-google-places') return 'google-places';
    if (importType === 'venues-tomtom') return 'tomtom';
    if (importType === 'venues-tripadvisor') return 'tripadvisor';
    return null;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: 'Invalid File Type',
        description: 'Please select a CSV file',
        variant: 'destructive'
      });
      return;
    }

    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      toast({
        title: 'File Too Large',
        description: 'File size must be less than 50MB',
        variant: 'destructive'
      });
      return;
    }

    setFileName(file.name);

    try {
      const text = await file.text();
      setCsvData(text);

      // Generate preview
      const preview = parseCSVPreview(text, 5);
      setCsvPreview(preview);

      // Auto-suggest unique key fields based on import type
      if (importType && IMPORT_TYPES[importType as keyof typeof IMPORT_TYPES]) {
        const typeConfig = IMPORT_TYPES[importType as keyof typeof IMPORT_TYPES];
        const suggestedKeys = typeConfig.requiredFields.filter(field =>
          preview.headers.some(header =>
            header.toLowerCase().includes(field.toLowerCase())
          )
        );
        setUniqueKeyFields(suggestedKeys.slice(0, 2)); // Max 2 key fields
      }

    } catch (error) {
      toast({
        title: 'File Read Error',
        description: 'Failed to read the CSV file',
        variant: 'destructive'
      });
    }
  };

  const addUniqueKeyField = (field: string) => {
    if (!uniqueKeyFields.includes(field)) {
      setUniqueKeyFields([...uniqueKeyFields, field]);
    }
  };

  const removeUniqueKeyField = (field: string) => {
    setUniqueKeyFields(uniqueKeyFields.filter(f => f !== field));
  };

  const addValidationRule = (field: string, rule: string, value: any) => {
    setValidationRules(prev => ({
      ...prev,
      [field]: {
        ...prev[field],
        [rule]: value
      }
    }));
  };

  const addFilter = (field: string, operator: string, value: any) => {
    setFilters(prev => ({
      ...prev,
      [field]: { operator, value }
    }));
  };

  const createImport = async () => {
    if (!importType) {
      toast({
        title: 'Missing Import Type',
        description: 'Please select an import type',
        variant: 'destructive'
      });
      return;
    }

    // Handle venue API imports differently
    if (isVenueApiImport) {
      setShowVenueImportDialog(true);
      return;
    }

    // Handle web scraping imports — invoke the scraper edge function with config
    if (sourceType === 'web_scraping' && importType) {
      try {
        let body: Record<string, any> = {};
        let description = '';
        if (importType === 'scrape-gaycities-events') {
          // Build city_info map from allCities for any cities not in the hardcoded list
          const cityInfoMap: Record<string, { displayName: string; country: string }> = {};
          for (const slug of scraperConfig.events.cities) {
            const match = allCities.find(c => c.name.toLowerCase().replace(/\s+/g, '-') === slug);
            if (match) {
              cityInfoMap[slug] = { displayName: match.name, country: match.country };
            }
          }
          body = {
            cities: scraperConfig.events.cities,
            max_cities: scraperConfig.events.maxCities,
            city_info: cityInfoMap,
          };
          description = `Event scraper triggered for ${scraperConfig.events.cities.length} cities`;
        } else if (importType === 'scrape-spartacus') {
          body = {
            venue_types: scraperConfig.spartacus.venueTypes,
            countries: scraperConfig.spartacus.countries,
            max_cities_per_country: scraperConfig.spartacus.maxCitiesPerCountry,
            discover_cities: scraperConfig.spartacus.discoverCities,
          };
          description = `Spartacus scraper triggered for ${scraperConfig.spartacus.countries.length} countries × ${scraperConfig.spartacus.venueTypes.length} venue types`;
        }
        const { data, error } = await supabase.functions.invoke(importType, { body });
        if (error) throw error;
        toast({
          title: 'Scraper Started',
          description: `${description}. Check the Pipeline tab for progress.`,
        });
        setImportType('');
        return;
      } catch (error) {
        toast({
          title: 'Scraper Failed',
          description: error instanceof Error ? error.message : 'Failed to trigger scraper',
          variant: 'destructive',
        });
        return;
      }
    }

    if (sourceType === 'csv' && !csvData) {
      toast({
        title: 'Missing CSV Data',
        description: 'Please upload a CSV file',
        variant: 'destructive'
      });
      return;
    }

    if (sourceType === 'api' && !apiEndpoint) {
      toast({
        title: 'Missing API Endpoint',
        description: 'Please provide an API endpoint',
        variant: 'destructive'
      });
      return;
    }

    try {
      await createImportJob(importType, sourceType, {
        duplicateStrategy,
        uniqueKeyFields,
        validationRules,
        filters,
        sourceData: sourceType === 'csv' ? csvData : undefined,
        fileName: sourceType === 'csv' ? fileName : undefined,
        fileSize: sourceType === 'csv' ? new Blob([csvData]).size : undefined,
        apiEndpoint: sourceType === 'api' ? apiEndpoint : undefined
      });

      // Reset form
      setImportType('');
      setCsvData('');
      setCsvPreview(null);
      setFileName('');
      setApiEndpoint('');
      setUniqueKeyFields([]);
      setValidationRules({});
      setFilters({});
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      // Error handled by the hook
    }
  };

  const handleVenueImport = async (config: any) => {
    try {
      await createImportJob(importType, 'api', {
        duplicateStrategy,
        uniqueKeyFields,
        validationRules,
        filters,
        venueImportConfig: config
      });

      // Reset form
      setImportType('');
      setShowVenueImportDialog(false);
      setUniqueKeyFields([]);
      setValidationRules({});
      setFilters({});

    } catch (error) {
      // Error handled by the hook
    }
  };

  const typeConfig = importType ? IMPORT_TYPES[importType as keyof typeof IMPORT_TYPES] : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card>
        <CardHeader>
          <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Upload style={{ height: 20, width: 20 }} />
            Create New Import Job
          </CardTitle>
          <CardDescription>
            Configure and start a new data import with advanced validation and duplicate handling
          </CardDescription>
        </CardHeader>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Import Type Selection */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Label>Import Type</Label>
            <Select value={importType} onValueChange={setImportType}>
              <SelectTrigger>
                <SelectValue placeholder="Select what type of data you want to import" />
              </SelectTrigger>
              <SelectContent sx={{ maxHeight: 384 }}>
                {Object.entries(IMPORT_TYPES).map(([key, config]) => {
                  const iconMap: Record<string, any> = {
                    MapPin, Calendar, Users, Building, Globe, Shield, Tag, ShoppingCart, BookOpen, Newspaper
                  };
                  const IconComponent = iconMap[config.icon];

                  return (
                    <SelectItem key={key} value={key}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5 }}>
                        {IconComponent && <IconComponent style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />}
                        <div>
                          <Box sx={{ fontWeight: 500 }}>{config.label}</Box>
                          <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>{config.description}</Box>
                        </div>
                      </Box>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {typeConfig && (
              <Alert>
                <Info style={{ height: 16, width: 16 }} />
                <AlertDescription>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <div>
                      <strong>Required fields:</strong> {typeConfig.requiredFields.join(', ')}
                    </div>
                    <div>
                      <strong>Optional fields:</strong> {typeConfig.optionalFields.join(', ')}
                    </div>
                  </Box>
                </AlertDescription>
              </Alert>
            )}
          </Box>

          {/* Source Type */}
          {!isVenueApiImport && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Label>Data Source</Label>
              <Tabs value={sourceType} onValueChange={(value) => setSourceType(value as any)}>
                <TabsList sx={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  <TabsTrigger value="csv" sx={{ gap: 1 }}>
                    <FileText style={{ height: 16, width: 16 }} />
                    CSV File
                  </TabsTrigger>
                <TabsTrigger value="api" sx={{ gap: 1 }}>
                  <Database style={{ height: 16, width: 16 }} />
                  API Import
                </TabsTrigger>
                <TabsTrigger value="web_scraping" sx={{ gap: 1 }}>
                  <Globe style={{ height: 16, width: 16 }} />
                  Web Scraping
                </TabsTrigger>
              </TabsList>

              <TabsContent value="csv" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Label htmlFor="csv-file">CSV File (Max 50MB)</Label>
                  <Input
                    id="csv-file"
                    type="file"
                    accept=".csv"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    disabled={loading}
                  />
                  {fileName && (
                    <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                      Selected file: {fileName}
                    </Box>
                  )}
                </Box>

                {csvPreview && (
                  <Card>
                    <CardHeader>
                      <CardTitle sx={{ fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Eye style={{ height: 16, width: 16 }} />
                        Data Preview
                      </CardTitle>
                      <CardDescription>
                        First 5 rows of your CSV data
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Box sx={{ overflowX: 'auto' }}>
                        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', border: 1, borderColor: 'divider' }}>
                          <thead>
                            <Box component="tr" sx={{ bgcolor: 'action.hover' }}>
                              {csvPreview.headers.map((header, index) => (
                                <Box component="th" key={index} sx={{ border: 1, borderColor: 'divider', p: 1, textAlign: 'left', fontWeight: 500 }}>
                                  {header}
                                </Box>
                              ))}
                            </Box>
                          </thead>
                          <tbody>
                            {csvPreview.rows.map((row, index) => (
                              <tr key={index} style={{ backgroundColor: index % 2 === 0 ? 'var(--background)' : 'rgba(var(--muted-rgb), 0.5)' }}>
                                {csvPreview.headers.map((header, colIndex) => (
                                  <Box component="td" key={colIndex} sx={{ border: 1, borderColor: 'divider', p: 1, fontSize: '0.875rem' }}>
                                    {row[header] || '-'}
                                  </Box>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="api" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Label htmlFor="api-endpoint">API Endpoint URL</Label>
                  <Input
                    id="api-endpoint"
                    type="url"
                    value={apiEndpoint}
                    onChange={(e) => setApiEndpoint(e.target.value)}
                    placeholder="https://api.example.com/data"
                  />
                </Box>

                <Alert>
                  <Info style={{ height: 16, width: 16 }} />
                  <AlertDescription>
                    API imports will fetch data from the provided endpoint. Ensure the API returns data in a compatible format.
                  </AlertDescription>
                </Alert>
              </TabsContent>

              <TabsContent value="web_scraping" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Alert>
                  <Info style={{ height: 16, width: 16 }} />
                  <AlertDescription>
                    Web scraping imports use the ingestion pipeline with AI validation, deduplication, and review queue support.
                  </AlertDescription>
                </Alert>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Label>Scraper Source</Label>
                  <Select value={importType} onValueChange={setImportType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a scraper source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scrape-gaycities-events">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Calendar style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                          <div>
                            <Box sx={{ fontWeight: 500 }}>LGBTQ+ Events (GayTravel4u)</Box>
                            <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Scrape LGBTQ+ events from 35+ cities worldwide</Box>
                          </div>
                        </Box>
                      </SelectItem>
                      <SelectItem value="scrape-spartacus">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <MapPin style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                          <div>
                            <Box sx={{ fontWeight: 500 }}>Spartacus Venues</Box>
                            <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Scrape saunas and bars from Spartacus Gay Guide by country/city</Box>
                          </div>
                        </Box>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Box>

                {/* Events Scraper Config (GayTravel4u) */}
                {importType === 'scrape-gaycities-events' && (
                  <Card>
                    <CardHeader>
                      <CardTitle sx={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Sliders style={{ height: 16, width: 16 }} />
                        Events Scraper Configuration
                      </CardTitle>
                      <CardDescription>Select cities to scrape LGBTQ+ events from GayTravel4u</CardDescription>
                    </CardHeader>
                    <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Label>Selected Cities ({scraperConfig.events.cities.length})</Label>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {scraperConfig.events.cities.map((city) => (
                            <Badge key={city} variant="secondary" sx={{ gap: 0.5 }}>
                              {city}
                              <Button
                                variant="ghost"
                                size="sm"
                                sx={{ height: 'auto', p: 0, '&:hover': { bgcolor: 'transparent' } }}
                                onClick={() => setScraperConfig(prev => ({
                                  ...prev,
                                  events: {
                                    ...prev.events,
                                    cities: prev.events.cities.filter(c => c !== city)
                                  }
                                }))}
                              >
                                <X style={{ height: 12, width: 12 }} />
                              </Button>
                            </Badge>
                          ))}
                        </Box>
                        <Input
                          placeholder="Search cities to add..."
                          value={citySearch}
                          onChange={(e) => setCitySearch(e.target.value)}
                          sx={{ maxWidth: 300 }}
                        />
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxHeight: 200, overflowY: 'auto' }}>
                          {allCities
                            .filter(c => {
                              const slug = c.name.toLowerCase().replace(/\s+/g, '-');
                              return !scraperConfig.events.cities.includes(slug) &&
                                (citySearch === '' || c.name.toLowerCase().includes(citySearch.toLowerCase()) || c.country.toLowerCase().includes(citySearch.toLowerCase()));
                            })
                            .slice(0, citySearch ? 50 : 30)
                            .map((city) => {
                              const slug = city.name.toLowerCase().replace(/\s+/g, '-');
                              return (
                                <Button
                                  key={slug}
                                  variant="outline"
                                  size="sm"
                                  sx={{ fontSize: '0.75rem', height: 28 }}
                                  onClick={() => setScraperConfig(prev => ({
                                    ...prev,
                                    events: {
                                      ...prev.events,
                                      cities: [...prev.events.cities, slug]
                                    }
                                  }))}
                                >
                                  <Plus style={{ height: 10, width: 10, marginRight: 2 }} />
                                  {city.name} <span style={{ opacity: 0.5, marginLeft: 4 }}>{city.country}</span>
                                </Button>
                              );
                            })}
                          {allCities.length === 0 && (
                            <Typography variant="body2" sx={{ color: 'text.secondary', py: 1 }}>Loading cities...</Typography>
                          )}
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Label>Max Cities to Scrape</Label>
                        <Select
                          value={scraperConfig.events.maxCities.toString()}
                          onValueChange={(v) => setScraperConfig(prev => ({
                            ...prev,
                            events: { ...prev.events, maxCities: parseInt(v) }
                          }))}
                        >
                          <SelectTrigger sx={{ width: 160 }}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="5">5 cities</SelectItem>
                            <SelectItem value="10">10 cities</SelectItem>
                            <SelectItem value="15">15 cities</SelectItem>
                            <SelectItem value="20">20 cities</SelectItem>
                          </SelectContent>
                        </Select>
                      </Box>
                    </CardContent>
                  </Card>
                )}

                {/* Spartacus Config */}
                {importType === 'scrape-spartacus' && (
                  <Card>
                    <CardHeader>
                      <CardTitle sx={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Sliders style={{ height: 16, width: 16 }} />
                        Spartacus Scraper Configuration
                      </CardTitle>
                      <CardDescription>Scrape venues by country and city from Spartacus Gay Guide</CardDescription>
                    </CardHeader>
                    <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Label>Venue Types</Label>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          {[
                            { type: 'saunas', label: 'Saunas' },
                            { type: 'goingout', label: 'Bars & Clubs (Going Out)' },
                          ].map(({ type, label }) => (
                            <Box key={type} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Checkbox
                                id={`vtype-${type}`}
                                checked={scraperConfig.spartacus.venueTypes.includes(type)}
                                onCheckedChange={(checked) => {
                                  setScraperConfig(prev => ({
                                    ...prev,
                                    spartacus: {
                                      ...prev.spartacus,
                                      venueTypes: checked
                                        ? [...prev.spartacus.venueTypes, type]
                                        : prev.spartacus.venueTypes.filter(t => t !== type)
                                    }
                                  }));
                                }}
                              />
                              <Label htmlFor={`vtype-${type}`}>{label}</Label>
                            </Box>
                          ))}
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Label>Countries ({scraperConfig.spartacus.countries.length})</Label>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {scraperConfig.spartacus.countries.map((country) => (
                            <Badge key={country} variant="secondary" sx={{ gap: 0.5 }}>
                              {country}
                              <Button
                                variant="ghost"
                                size="sm"
                                sx={{ height: 'auto', p: 0, '&:hover': { bgcolor: 'transparent' } }}
                                onClick={() => setScraperConfig(prev => ({
                                  ...prev,
                                  spartacus: {
                                    ...prev.spartacus,
                                    countries: prev.spartacus.countries.filter(c => c !== country)
                                  }
                                }))}
                              >
                                <X style={{ height: 12, width: 12 }} />
                              </Button>
                            </Badge>
                          ))}
                        </Box>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {['germany', 'spain', 'uk', 'france', 'netherlands', 'thailand', 'usa']
                            .filter(c => !scraperConfig.spartacus.countries.includes(c))
                            .map((country) => (
                              <Button
                                key={country}
                                variant="outline"
                                size="sm"
                                sx={{ fontSize: '0.75rem', height: 28 }}
                                onClick={() => setScraperConfig(prev => ({
                                  ...prev,
                                  spartacus: {
                                    ...prev.spartacus,
                                    countries: [...prev.spartacus.countries, country]
                                  }
                                }))}
                              >
                                <Plus style={{ height: 10, width: 10, marginRight: 2 }} />
                                {country}
                              </Button>
                            ))}
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 2 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
                          <Label>Max Cities per Country</Label>
                          <Select
                            value={scraperConfig.spartacus.maxCitiesPerCountry.toString()}
                            onValueChange={(v) => setScraperConfig(prev => ({
                              ...prev,
                              spartacus: { ...prev.spartacus, maxCitiesPerCountry: parseInt(v) }
                            }))}
                          >
                            <SelectTrigger sx={{ width: 160 }}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="3">3 cities</SelectItem>
                              <SelectItem value="5">5 cities</SelectItem>
                              <SelectItem value="10">10 cities</SelectItem>
                              <SelectItem value="20">All cities</SelectItem>
                            </SelectContent>
                          </Select>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'flex-end', pb: 0.25 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Checkbox
                              id="discover-cities"
                              checked={scraperConfig.spartacus.discoverCities}
                              onCheckedChange={(checked) => {
                                setScraperConfig(prev => ({
                                  ...prev,
                                  spartacus: { ...prev.spartacus, discoverCities: !!checked }
                                }));
                              }}
                            />
                            <Label htmlFor="discover-cities" style={{ fontSize: '0.875rem' }}>Discover cities from country pages</Label>
                          </Box>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </Box>
          )}

          {/* Duplicate Handling */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Label>Duplicate Handling Strategy</Label>
            <Select value={duplicateStrategy} onValueChange={(value) => setDuplicateStrategy(value as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DUPLICATE_STRATEGIES).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <div>
                      <Box sx={{ fontWeight: 500 }}>{config.label}</Box>
                      <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>{config.description}</Box>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>

          {/* Unique Key Fields */}
          {csvPreview && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Label>Unique Key Fields</Label>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                  Select fields that uniquely identify records for duplicate detection
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {uniqueKeyFields.map((field) => (
                    <Badge key={field} variant="secondary" sx={{ gap: 0.5 }}>
                      {field}
                      <Button
                        variant="ghost"
                        size="sm"
                        sx={{ height: 'auto', p: 0, '&:hover': { bgcolor: 'transparent' } }}
                        onClick={() => removeUniqueKeyField(field)}
                      >
                        <X style={{ height: 12, width: 12 }} />
                      </Button>
                    </Badge>
                  ))}
                </Box>
                <Select onValueChange={addUniqueKeyField}>
                  <SelectTrigger sx={{ width: 192 }}>
                    <SelectValue placeholder="Add field" />
                  </SelectTrigger>
                  <SelectContent>
                    {csvPreview.headers
                      .filter(header => !uniqueKeyFields.includes(header))
                      .map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Box>
            </Box>
          )}

          {/* Advanced Configuration */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" sx={{ width: '100%', gap: 1 }}>
                <Settings style={{ height: 16, width: 16 }} />
                Advanced Configuration
                {showAdvanced ? ' (Hide)' : ' (Show)'}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              {/* Validation Rules */}
              <Card>
                <CardHeader>
                  <CardTitle sx={{ fontSize: '1.125rem' }}>Validation Rules</CardTitle>
                  <CardDescription>
                    Configure data validation rules for better import quality
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert>
                    <Info style={{ height: 16, width: 16 }} />
                    <AlertDescription>
                      Validation rules will be applied during the pre-flight check phase
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>

              {/* Data Filters */}
              <Card>
                <CardHeader>
                  <CardTitle sx={{ fontSize: '1.125rem' }}>Data Filters</CardTitle>
                  <CardDescription>
                    Apply filters to import only specific records
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert>
                    <Info style={{ height: 16, width: 16 }} />
                    <AlertDescription>
                      Filters will be applied before validation and import
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {/* Venue API Import Notice */}
          {isVenueApiImport && (
            <Alert>
              <Info style={{ height: 16, width: 16 }} />
              <AlertDescription>
                This import type will open a specialized configuration dialog for {getVenueProvider()} venue imports with customizable search terms and locations.
              </AlertDescription>
            </Alert>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 3 }}>
            <Button
              onClick={createImport}
              disabled={loading}
              sx={{ gap: 1 }}
            >
              {loading ? (
                <>
                  <RefreshCw style={{ height: 16, width: 16, animation: 'spin 1s linear infinite' }} />
                  Creating Import...
                </>
              ) : (
                <>
                  <CheckCircle style={{ height: 16, width: 16 }} />
                  {isVenueApiImport ? 'Configure Import' : 'Create Import Job'}
                </>
              )}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Venue Import Dialog */}
      {showVenueImportDialog && getVenueProvider() && (
        <VenueImportDialog
          open={showVenueImportDialog}
          onOpenChange={setShowVenueImportDialog}
          provider={getVenueProvider()!}
          onImport={handleVenueImport}
          isImporting={loading}
        />
      )}
    </Box>
  );
};
