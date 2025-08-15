import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Settings, Filter, Shield, Zap, X } from "lucide-react";

export interface ImportConfig {
  duplicateStrategy: 'skip' | 'update' | 'fail' | 'create_new';
  errorStrategy: 'continue' | 'stop' | 'retry_batch';
  validation: {
    strict: boolean;
    required_fields: string[];
    custom_validations: Record<string, any>;
  };
  filters: {
    location?: string;
    date_range?: { start: string; end: string };
    keywords?: string[];
    categories?: string[];
    limit?: number;
    offset?: number;
  };
  advanced: {
    enable_geocoding: boolean;
    enable_image_processing: boolean;
    enable_ai_enhancement: boolean;
    concurrent_limit: number;
    timeout_seconds: number;
  };
}

interface AdvancedImportDialogProps {
  importType: string;
  onImport: (config: ImportConfig) => void;
  children: React.ReactNode;
}

const DEFAULT_CONFIG: ImportConfig = {
  duplicateStrategy: 'skip',
  errorStrategy: 'continue',
  validation: {
    strict: false,
    required_fields: [],
    custom_validations: {}
  },
  filters: {
    limit: 1000
  },
  advanced: {
    enable_geocoding: false,
    enable_image_processing: true,
    enable_ai_enhancement: false,
    concurrent_limit: 3,
    timeout_seconds: 60
  }
};

const DUPLICATE_STRATEGIES = [
  { value: 'skip', label: 'Skip Duplicates', description: 'Skip items that already exist in the database' },
  { value: 'update', label: 'Update Existing', description: 'Update existing records with new data' },
  { value: 'fail', label: 'Fail on Duplicate', description: 'Stop the import when duplicates are found' },
  { value: 'create_new', label: 'Create New', description: 'Always create new records, ignore duplicates' }
];

const ERROR_STRATEGIES = [
  { value: 'continue', label: 'Continue on Error', description: 'Skip failed items and continue importing' },
  { value: 'stop', label: 'Stop on Error', description: 'Stop the entire import when an error occurs' },
  { value: 'retry_batch', label: 'Retry Failed Batch', description: 'Retry the entire batch when errors occur' }
];

const COMMON_CATEGORIES = [
  'Restaurant', 'Bar', 'Club', 'Hotel', 'Event', 'Pride', 'Community Center', 
  'Health', 'Entertainment', 'Shopping', 'Arts', 'Sports', 'Education'
];

export const AdvancedImportDialog = ({ importType, onImport, children }: AdvancedImportDialogProps) => {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<ImportConfig>(DEFAULT_CONFIG);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [requiredFields, setRequiredFields] = useState<string[]>([]);
  const [newRequiredField, setNewRequiredField] = useState('');

  const handleImport = () => {
    const finalConfig = {
      ...config,
      filters: {
        ...config.filters,
        keywords: keywords.length > 0 ? keywords : undefined,
        categories: categories.length > 0 ? categories : undefined
      },
      validation: {
        ...config.validation,
        required_fields: requiredFields
      }
    };
    
    onImport(finalConfig);
    setOpen(false);
  };

  const addKeyword = () => {
    if (newKeyword && !keywords.includes(newKeyword)) {
      setKeywords([...keywords, newKeyword]);
      setNewKeyword('');
    }
  };

  const deleteKeyword = (keyword: string) => {
    setKeywords(keywords.filter(k => k !== keyword));
  };

  const toggleCategory = (category: string) => {
    if (categories.includes(category)) {
      setCategories(categories.filter(c => c !== category));
    } else {
      setCategories([...categories, category]);
    }
  };

  const addRequiredField = () => {
    if (newRequiredField && !requiredFields.includes(newRequiredField)) {
      setRequiredFields([...requiredFields, newRequiredField]);
      setNewRequiredField('');
    }
  };

  const deleteRequiredField = (field: string) => {
    setRequiredFields(requiredFields.filter(f => f !== field));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Advanced Import Configuration - {importType}
          </DialogTitle>
          <DialogDescription>
            Configure advanced settings for handling duplicates, errors, and filtering data
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="duplicates" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="duplicates" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Duplicates
            </TabsTrigger>
            <TabsTrigger value="errors" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Errors
            </TabsTrigger>
            <TabsTrigger value="filters" className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </TabsTrigger>
            <TabsTrigger value="advanced" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Advanced
            </TabsTrigger>
          </TabsList>

          <TabsContent value="duplicates" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Duplicate Handling Strategy</CardTitle>
                <CardDescription>
                  Choose how to handle items that already exist in the database
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  {DUPLICATE_STRATEGIES.map((strategy) => (
                    <div 
                      key={strategy.value}
                      className={`p-4 rounded-lg cursor-pointer transition-opacity ${
                        config.duplicateStrategy === strategy.value 
                          ? 'bg-primary/10' 
                          : 'bg-muted hover:opacity-80'
                      }`}
                      onClick={() => setConfig(prev => ({ ...prev, duplicateStrategy: strategy.value as any }))}
                    >
                      <div className="flex items-center space-x-2">
                        <div className={`h-4 w-4 rounded-sm ${
                          config.duplicateStrategy === strategy.value 
                            ? 'bg-primary' 
                            : 'bg-muted'
                        }`} />
                        <div>
                          <p className="font-medium">{strategy.label}</p>
                          <p className="text-sm text-muted-foreground">{strategy.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="errors" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Error Handling Strategy</CardTitle>
                <CardDescription>
                  Choose how to handle errors during the import process
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  {ERROR_STRATEGIES.map((strategy) => (
                    <div 
                      key={strategy.value}
                      className={`p-4 rounded-lg cursor-pointer transition-opacity ${
                        config.errorStrategy === strategy.value 
                          ? 'bg-primary/10' 
                          : 'bg-muted hover:opacity-80'
                      }`}
                      onClick={() => setConfig(prev => ({ ...prev, errorStrategy: strategy.value as any }))}
                    >
                      <div className="flex items-center space-x-2">
                        <div className={`h-4 w-4 rounded-sm ${
                          config.errorStrategy === strategy.value 
                            ? 'bg-primary' 
                            : 'bg-muted'
                        }`} />
                        <div>
                          <p className="font-medium">{strategy.label}</p>
                          <p className="text-sm text-muted-foreground">{strategy.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="strict"
                      checked={config.validation.strict}
                      onCheckedChange={(checked) => 
                        setConfig(prev => ({ 
                          ...prev, 
                          validation: { ...prev.validation, strict: checked as boolean }
                        }))
                      }
                    />
                    <Label htmlFor="strict">Strict Validation</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Enable strict validation to ensure all data meets quality standards before import
                  </p>

                  <div className="space-y-2">
                    <Label>Required Fields</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add required field..."
                        value={newRequiredField}
                        onChange={(e) => setNewRequiredField(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && addRequiredField()}
                      />
                      <Button onClick={addRequiredField} size="sm">Add</Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {requiredFields.map((field) => (
                        <Badge key={field} variant="secondary" className="cursor-pointer">
                          {field}
                          <X 
                            className="h-3 w-3 ml-1" 
                            onClick={() => deleteRequiredField(field)}
                          />
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="filters" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Import Filters</CardTitle>
                <CardDescription>
                  Filter and limit the data to be imported
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      placeholder="e.g., San Francisco, CA"
                      value={config.filters.location || ''}
                      onChange={(e) => setConfig(prev => ({ 
                        ...prev, 
                        filters: { ...prev.filters, location: e.target.value }
                      }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="limit">Import Limit</Label>
                    <Input
                      id="limit"
                      type="number"
                      placeholder="1000"
                      value={config.filters.limit || ''}
                      onChange={(e) => setConfig(prev => ({ 
                        ...prev, 
                        filters: { ...prev.filters, limit: parseInt(e.target.value) || undefined }
                      }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Keywords</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add keyword..."
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
                    />
                    <Button onClick={addKeyword} size="sm">Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {keywords.map((keyword) => (
                      <Badge key={keyword} variant="secondary" className="cursor-pointer">
                        {keyword}
                        <X 
                          className="h-3 w-3 ml-1" 
                          onClick={() => deleteKeyword(keyword)}
                        />
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Categories</Label>
                  <div className="flex flex-wrap gap-2">
                    {COMMON_CATEGORIES.map((category) => (
                      <Badge 
                        key={category}
                        variant={categories.includes(category) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleCategory(category)}
                      >
                        {category}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="start-date">Start Date</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={config.filters.date_range?.start || ''}
                      onChange={(e) => setConfig(prev => ({ 
                        ...prev, 
                        filters: { 
                          ...prev.filters, 
                          date_range: { 
                            ...prev.filters.date_range, 
                            start: e.target.value,
                            end: prev.filters.date_range?.end || ''
                          }
                        }
                      }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="end-date">End Date</Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={config.filters.date_range?.end || ''}
                      onChange={(e) => setConfig(prev => ({ 
                        ...prev, 
                        filters: { 
                          ...prev.filters, 
                          date_range: { 
                            start: prev.filters.date_range?.start || '',
                            end: e.target.value
                          }
                        }
                      }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Advanced Processing Options</CardTitle>
                <CardDescription>
                  Configure advanced processing features and performance settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="geocoding"
                      checked={config.advanced.enable_geocoding}
                      onCheckedChange={(checked) => 
                        setConfig(prev => ({ 
                          ...prev, 
                          advanced: { ...prev.advanced, enable_geocoding: checked as boolean }
                        }))
                      }
                    />
                    <Label htmlFor="geocoding">Enable Geocoding</Label>
                  </div>
                  <p className="text-sm text-muted-foreground ml-6">
                    Automatically geocode addresses to get latitude/longitude coordinates
                  </p>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="image-processing"
                      checked={config.advanced.enable_image_processing}
                      onCheckedChange={(checked) => 
                        setConfig(prev => ({ 
                          ...prev, 
                          advanced: { ...prev.advanced, enable_image_processing: checked as boolean }
                        }))
                      }
                    />
                    <Label htmlFor="image-processing">Enable Image Processing</Label>
                  </div>
                  <p className="text-sm text-muted-foreground ml-6">
                    Download and process images during import
                  </p>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="ai-enhancement"
                      checked={config.advanced.enable_ai_enhancement}
                      onCheckedChange={(checked) => 
                        setConfig(prev => ({ 
                          ...prev, 
                          advanced: { ...prev.advanced, enable_ai_enhancement: checked as boolean }
                        }))
                      }
                    />
                    <Label htmlFor="ai-enhancement">Enable AI Enhancement</Label>
                  </div>
                  <p className="text-sm text-muted-foreground ml-6">
                    Use AI to enhance and validate imported data
                  </p>
                </div>

                <Separator />

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="concurrent-limit">Concurrent Processing Limit</Label>
                    <Select 
                      value={config.advanced.concurrent_limit.toString()}
                      onValueChange={(value) => setConfig(prev => ({ 
                        ...prev, 
                        advanced: { ...prev.advanced, concurrent_limit: parseInt(value) }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 (Slowest, Most Reliable)</SelectItem>
                        <SelectItem value="3">3 (Recommended)</SelectItem>
                        <SelectItem value="5">5 (Faster)</SelectItem>
                        <SelectItem value="10">10 (Fastest, Less Reliable)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="timeout">Timeout (seconds)</Label>
                    <Select 
                      value={config.advanced.timeout_seconds.toString()}
                      onValueChange={(value) => setConfig(prev => ({ 
                        ...prev, 
                        advanced: { ...prev.advanced, timeout_seconds: parseInt(value) }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 seconds</SelectItem>
                        <SelectItem value="60">60 seconds (Recommended)</SelectItem>
                        <SelectItem value="120">2 minutes</SelectItem>
                        <SelectItem value="300">5 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport}>
            Start Advanced Import
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};