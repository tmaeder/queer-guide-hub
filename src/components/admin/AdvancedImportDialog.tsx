import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
    custom_validations: Record<string, unknown>;
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
      <DialogContent sx={{ maxWidth: 896, maxHeight: '90vh', overflowY: 'auto' }}>
        <DialogHeader>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Settings style={{ height: 20, width: 20 }} />
            Advanced Import Configuration - {importType}
          </DialogTitle>
          <DialogDescription>
            Configure advanced settings for handling duplicates, errors, and filtering data
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="duplicates" sx={{ width: '100%' }}>
          <TabsList sx={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <TabsTrigger value="duplicates" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Shield style={{ height: 16, width: 16 }} />
              Duplicates
            </TabsTrigger>
            <TabsTrigger value="errors" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Shield style={{ height: 16, width: 16 }} />
              Errors
            </TabsTrigger>
            <TabsTrigger value="filters" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Filter style={{ height: 16, width: 16 }} />
              Filters
            </TabsTrigger>
            <TabsTrigger value="advanced" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Zap style={{ height: 16, width: 16 }} />
              Advanced
            </TabsTrigger>
          </TabsList>

          <TabsContent value="duplicates" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Card>
              <CardHeader>
                <CardTitle>Duplicate Handling Strategy</CardTitle>
                <CardDescription>
                  Choose how to handle items that already exist in the database
                </CardDescription>
              </CardHeader>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'grid', gap: 2 }}>
                  {DUPLICATE_STRATEGIES.map((strategy) => (
                    <div
                      key={strategy.value}
                      role="button"
                      tabIndex={0}
                      style={{ padding: 16, borderRadius: 8, cursor: 'pointer', transition: 'opacity 0.2s', backgroundColor: config.duplicateStrategy === strategy.value ? 'rgba(var(--primary-rgb), 0.1)' : 'var(--muted)' }}
                      onClick={() => setConfig(prev => ({ ...prev, duplicateStrategy: strategy.value as 'skip' | 'update' | 'merge' }))}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setConfig(prev => ({ ...prev, duplicateStrategy: strategy.value as 'skip' | 'update' | 'merge' })); } }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <div style={{ height: 16, width: 16, borderRadius: 4, backgroundColor: config.duplicateStrategy === strategy.value ? 'hsl(var(--primary))' : 'var(--muted)' }} />
                        <Box>
                          <Typography sx={{ fontWeight: 500 }}>{strategy.label}</Typography>
                          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>{strategy.description}</Typography>
                        </Box>
                      </Box>
                    </div>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="errors" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Card>
              <CardHeader>
                <CardTitle>Error Handling Strategy</CardTitle>
                <CardDescription>
                  Choose how to handle errors during the import process
                </CardDescription>
              </CardHeader>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'grid', gap: 2 }}>
                  {ERROR_STRATEGIES.map((strategy) => (
                    <div
                      key={strategy.value}
                      role="button"
                      tabIndex={0}
                      style={{ padding: 16, borderRadius: 8, cursor: 'pointer', transition: 'opacity 0.2s', backgroundColor: config.errorStrategy === strategy.value ? 'rgba(var(--primary-rgb), 0.1)' : 'var(--muted)' }}
                      onClick={() => setConfig(prev => ({ ...prev, errorStrategy: strategy.value as 'continue' | 'stop' | 'retry_batch' }))}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setConfig(prev => ({ ...prev, errorStrategy: strategy.value as 'continue' | 'stop' | 'retry_batch' })); } }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <div style={{ height: 16, width: 16, borderRadius: 4, backgroundColor: config.errorStrategy === strategy.value ? 'hsl(var(--primary))' : 'var(--muted)' }} />
                        <Box>
                          <Typography sx={{ fontWeight: 500 }}>{strategy.label}</Typography>
                          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>{strategy.description}</Typography>
                        </Box>
                      </Box>
                    </div>
                  ))}
                </Box>

                <Separator />

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                  </Box>
                  <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                    Enable strict validation to ensure all data meets quality standards before import
                  </Typography>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Label>Required Fields</Label>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Input
                        placeholder="Add required field..."
                        value={newRequiredField}
                        onChange={(e) => setNewRequiredField(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && addRequiredField()}
                      />
                      <Button onClick={addRequiredField} size="sm">Add</Button>
                    </Box>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {requiredFields.map((field) => (
                        <Badge key={field} variant="secondary" sx={{ cursor: 'pointer' }}>
                          {field}
                          <X
                            style={{ height: 12, width: 12, marginLeft: 4 }}
                            onClick={() => deleteRequiredField(field)}
                          />
                        </Badge>
                      ))}
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="filters" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Card>
              <CardHeader>
                <CardTitle>Import Filters</CardTitle>
                <CardDescription>
                  Filter and limit the data to be imported
                </CardDescription>
              </CardHeader>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { md: '1fr 1fr' } }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Label>Keywords</Label>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Input
                      placeholder="Add keyword..."
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
                    />
                    <Button onClick={addKeyword} size="sm">Add</Button>
                  </Box>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {keywords.map((keyword) => (
                      <Badge key={keyword} variant="secondary" sx={{ cursor: 'pointer' }}>
                        {keyword}
                        <X
                          style={{ height: 12, width: 12, marginLeft: 4 }}
                          onClick={() => deleteKeyword(keyword)}
                        />
                      </Badge>
                    ))}
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Label>Categories</Label>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {COMMON_CATEGORIES.map((category) => (
                      <Badge
                        key={category}
                        variant={categories.includes(category) ? "default" : "outline"}
                        sx={{ cursor: 'pointer' }}
                        onClick={() => toggleCategory(category)}
                      >
                        {category}
                      </Badge>
                    ))}
                  </Box>
                </Box>

                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { md: '1fr 1fr' } }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="advanced" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Card>
              <CardHeader>
                <CardTitle>Advanced Processing Options</CardTitle>
                <CardDescription>
                  Configure advanced processing features and performance settings
                </CardDescription>
              </CardHeader>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                  </Box>
                  <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', ml: 3 }}>
                    Automatically geocode addresses to get latitude/longitude coordinates
                  </Typography>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                  </Box>
                  <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', ml: 3 }}>
                    Download and process images during import
                  </Typography>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                  </Box>
                  <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', ml: 3 }}>
                    Use AI to enhance and validate imported data
                  </Typography>
                </Box>

                <Separator />

                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { md: '1fr 1fr' } }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 2 }}>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport}>
            Start Advanced Import
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
};