import { useState, useRef } from 'react';
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
import { 
  Upload, FileText, Globe, Database, AlertTriangle, Info, Eye, 
  Settings, Filter, CheckCircle, X, Plus, RefreshCw, MapPin, Calendar,
  Users, Building, Shield, Tag, ShoppingCart, BookOpen, Newspaper
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { VenueImportDialog } from './venues/VenueImportDialog';

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
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Create New Import Job
          </CardTitle>
          <CardDescription>
            Configure and start a new data import with advanced validation and duplicate handling
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Import Type Selection */}
          <div className="space-y-3">
            <Label>Import Type</Label>
            <Select value={importType} onValueChange={setImportType}>
              <SelectTrigger>
                <SelectValue placeholder="Select what type of data you want to import" />
              </SelectTrigger>
              <SelectContent className="max-h-96">
                {Object.entries(IMPORT_TYPES).map(([key, config]) => {
                  const iconMap: Record<string, any> = {
                    MapPin, Calendar, Users, Building, Globe, Shield, Tag, ShoppingCart, BookOpen, Newspaper
                  };
                  const IconComponent = iconMap[config.icon];
                  
                  return (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-3 py-1">
                        {IconComponent && <IconComponent className="h-4 w-4 text-muted-foreground" />}
                        <div>
                          <div className="font-medium">{config.label}</div>
                          <div className="text-sm text-muted-foreground">{config.description}</div>
                        </div>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            
            {typeConfig && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <div>
                      <strong>Required fields:</strong> {typeConfig.requiredFields.join(', ')}
                    </div>
                    <div>
                      <strong>Optional fields:</strong> {typeConfig.optionalFields.join(', ')}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Source Type */}
          {!isVenueApiImport && (
            <div className="space-y-3">
              <Label>Data Source</Label>
              <Tabs value={sourceType} onValueChange={(value) => setSourceType(value as any)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="csv" className="gap-2">
                    <FileText className="h-4 w-4" />
                    CSV File
                  </TabsTrigger>
                <TabsTrigger value="api" className="gap-2">
                  <Database className="h-4 w-4" />
                  API Import
                </TabsTrigger>
                <TabsTrigger value="web_scraping" className="gap-2">
                  <Globe className="h-4 w-4" />
                  Web Scraping
                </TabsTrigger>
              </TabsList>

              <TabsContent value="csv" className="space-y-4">
                <div className="space-y-2">
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
                    <div className="text-sm text-muted-foreground">
                      Selected file: {fileName}
                    </div>
                  )}
                </div>

                {csvPreview && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        Data Preview
                      </CardTitle>
                      <CardDescription>
                        First 5 rows of your CSV data
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-border">
                          <thead>
                            <tr className="bg-muted">
                              {csvPreview.headers.map((header, index) => (
                                <th key={index} className="border border-border p-2 text-left font-medium">
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {csvPreview.rows.map((row, index) => (
                              <tr key={index} className={index % 2 === 0 ? 'bg-background' : 'bg-muted/50'}>
                                {csvPreview.headers.map((header, colIndex) => (
                                  <td key={colIndex} className="border border-border p-2 text-sm">
                                    {row[header] || '-'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="api" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="api-endpoint">API Endpoint URL</Label>
                  <Input
                    id="api-endpoint"
                    type="url"
                    value={apiEndpoint}
                    onChange={(e) => setApiEndpoint(e.target.value)}
                    placeholder="https://api.example.com/data"
                  />
                </div>
                
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    API imports will fetch data from the provided endpoint. Ensure the API returns data in a compatible format.
                  </AlertDescription>
                </Alert>
              </TabsContent>

              <TabsContent value="web_scraping" className="space-y-4">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Web scraping functionality is currently in development. Please use CSV or API import for now.
                  </AlertDescription>
                </Alert>
              </TabsContent>
            </Tabs>
          </div>
          )}

          {/* Duplicate Handling */}
          <div className="space-y-3">
            <Label>Duplicate Handling Strategy</Label>
            <Select value={duplicateStrategy} onValueChange={(value) => setDuplicateStrategy(value as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DUPLICATE_STRATEGIES).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <div>
                      <div className="font-medium">{config.label}</div>
                      <div className="text-sm text-muted-foreground">{config.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Unique Key Fields */}
          {csvPreview && (
            <div className="space-y-3">
              <Label>Unique Key Fields</Label>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Select fields that uniquely identify records for duplicate detection
                </p>
                <div className="flex flex-wrap gap-2">
                  {uniqueKeyFields.map((field) => (
                    <Badge key={field} variant="secondary" className="gap-1">
                      {field}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 hover:bg-transparent"
                        onClick={() => removeUniqueKeyField(field)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
                <Select onValueChange={addUniqueKeyField}>
                  <SelectTrigger className="w-48">
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
              </div>
            </div>
          )}

          {/* Advanced Configuration */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full gap-2">
                <Settings className="h-4 w-4" />
                Advanced Configuration
                {showAdvanced ? ' (Hide)' : ' (Show)'}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 mt-4">
              {/* Validation Rules */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Validation Rules</CardTitle>
                  <CardDescription>
                    Configure data validation rules for better import quality
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Validation rules will be applied during the pre-flight check phase
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>

              {/* Data Filters */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Data Filters</CardTitle>
                  <CardDescription>
                    Apply filters to import only specific records
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert>
                    <Info className="h-4 w-4" />
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
              <Info className="h-4 w-4" />
              <AlertDescription>
                This import type will open a specialized configuration dialog for {getVenueProvider()} venue imports with customizable search terms and locations.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between pt-6">
            <Button
              onClick={createImport}
              disabled={loading}
              className="gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Creating Import...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  {isVenueApiImport ? 'Configure Import' : 'Create Import Job'}
                </>
              )}
            </Button>
          </div>
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
    </div>
  );
};