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
  Settings, Filter, CheckCircle, X, Plus
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const IMPORT_TYPES = {
  'venues-csv': {
    label: 'Venues CSV',
    description: 'Import venue data from CSV files',
    requiredFields: ['name', 'address', 'city', 'country'],
    optionalFields: ['description', 'website', 'phone', 'latitude', 'longitude', 'tags']
  },
  'events-csv': {
    label: 'Events CSV',
    description: 'Import event data from CSV files',
    requiredFields: ['title', 'start_date', 'venue_name', 'city', 'country'],
    optionalFields: ['description', 'end_date', 'website', 'ticket_url', 'price_min', 'price_max']
  },
  'personalities-csv': {
    label: 'Personalities CSV',
    description: 'Import personality/people data from CSV files',
    requiredFields: ['name'],
    optionalFields: ['description', 'image_url', 'website', 'social_links', 'birth_date', 'death_date']
  },
  'tags-csv': {
    label: 'Tags CSV',
    description: 'Import tags and categories from CSV files',
    requiredFields: ['name', 'category'],
    optionalFields: ['description', 'color', 'icon']
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
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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
              <SelectContent>
                {Object.entries(IMPORT_TYPES).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <div>
                      <div className="font-medium">{config.label}</div>
                      <div className="text-sm text-muted-foreground">{config.description}</div>
                    </div>
                  </SelectItem>
                ))}
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

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={createImport}
              disabled={loading || !importType || (sourceType === 'csv' && !csvData) || (sourceType === 'api' && !apiEndpoint)}
              className="flex-1"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                  Creating Import Job...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Create Import Job
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
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
              }}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};