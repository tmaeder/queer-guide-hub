import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Download, Rss, Globe, MapPin, Calendar, Building2, Newspaper, Users, RefreshCw, AlertCircle, CheckCircle, Clock, FileText, Zap, Settings, Database, Info, Activity } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NewsSourcesManager } from "@/components/admin/NewsSourcesManager";
import { BulkCreatePersonalities } from "@/components/personalities/BulkCreatePersonalities";
import BackgroundImportManager, { BackgroundImportManagerRef } from "@/components/admin/BackgroundImportManager";
import { useRef } from "react";
interface ImportStats {
  totalImports: number;
  successfulImports: number;
  failedImports: number;
  lastImport: string | null;
}
interface ImportJob {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  message: string;
  createdAt: Date;
}
export default function AdminImportHub() {
  const {
    toast
  } = useToast();
  const [loading, setLoading] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    [key: string]: number;
  }>({});
  const [eventSeeds, setEventSeeds] = useState<string>('');
  const [eventLimit, setEventLimit] = useState<string>('100');
  const [aiTagsInput, setAiTagsInput] = useState<string>('');
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [stats, setStats] = useState<ImportStats>({
    totalImports: 0,
    successfulImports: 0,
    failedImports: 0,
    lastImport: null
  });
  const backgroundManagerRef = useRef<BackgroundImportManagerRef>(null);
  const updateProgress = (jobId: string, progress: number) => {
    setProgress(prev => ({
      ...prev,
      [jobId]: progress
    }));
  };
  const addImportJob = (type: string, status: ImportJob['status'] = 'pending') => {
    const job: ImportJob = {
      id: `${type}-${Date.now()}`,
      type,
      status,
      progress: 0,
      message: `${type} import started`,
      createdAt: new Date()
    };
    setImportJobs(prev => [job, ...prev.slice(0, 9)]); // Keep last 10 jobs
    return job.id;
  };
  const updateImportJob = (jobId: string, updates: Partial<ImportJob>) => {
    setImportJobs(prev => prev.map(job => job.id === jobId ? {
      ...job,
      ...updates
    } : job));
  };
  const handleFileImport = async (type: string, file: File) => {
    if (!file || !backgroundManagerRef.current) return;
    
    try {
      // Validate file
      if (!file.name.endsWith('.csv')) {
        throw new Error('Please select a valid CSV file');
      }
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('File size must be less than 10MB');
      }

      // Read file as text for processing
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      await backgroundManagerRef.current.createBackgroundJob(
        `${type}-csv`,
        { csvData: text, lines },
        5 // batch size set to 5
      );
      
      toast({
        title: "Import Job Created",
        description: `Background import job for ${type} has been queued and will process in batches of 5 items.`
      });
      
    } catch (error) {
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive"
      });
    }
  };
  const handleApiImport = async (functionName: string, params: any = {}) => {
    if (!backgroundManagerRef.current) {
      toast({
        title: "Error",
        description: "Background manager not initialized",
        variant: "destructive"
      });
      return;
    }
    
    try {
      await backgroundManagerRef.current.createBackgroundJob(
        functionName,
        params,
        5 // batch size set to 5 for API imports
      );
      
      toast({
        title: "Import Job Created",
        description: `Background import job for ${functionName} has been queued and will process in batches of 5 items.`
      });
      
    } catch (error) {
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive"
      });
    }
  };
  const getStatusIcon = (status: ImportJob['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'running':
        return <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };
  const getStatusBadge = (status: ImportJob['status']) => {
    const variants = {
      completed: 'default',
      failed: 'destructive',
      running: 'secondary',
      pending: 'outline'
    } as const;
    return <Badge variant={variants[status]}>{status}</Badge>;
  };
  return <div className="w-full min-h-screen bg-background">
      {/* Enhanced Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary rounded border">
                <Database className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Import Hub</h1>
                <p className="text-muted-foreground">
                  Centralized data import management for all content types
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-green-600">{stats.successfulImports}</div>
                  <div className="text-xs text-muted-foreground">Successful</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">{stats.failedImports}</div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{stats.totalImports}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
              </div>
              
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto p-6">
        {/* Background Import Manager */}
        <BackgroundImportManager 
          ref={backgroundManagerRef}
          onJobUpdate={(job) => {
            // Update stats when jobs complete
            if (job.status === 'completed') {
              setStats(prev => ({
                ...prev,
                totalImports: prev.totalImports + 1,
                successfulImports: prev.successfulImports + 1,
                lastImport: new Date().toISOString()
              }));
            } else if (job.status === 'failed') {
              setStats(prev => ({
                ...prev,
                totalImports: prev.totalImports + 1,
                failedImports: prev.failedImports + 1
              }));
            }
          }}
        />

        <Tabs defaultValue="personalities" className="space-y-6">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="personalities" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Personalities
            </TabsTrigger>
            <TabsTrigger value="events" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Events
            </TabsTrigger>
            <TabsTrigger value="venues" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Venues
            </TabsTrigger>
            <TabsTrigger value="tags" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Tags
            </TabsTrigger>
            <TabsTrigger value="news" className="flex items-center gap-2">
              <Newspaper className="h-4 w-4" />
              News
            </TabsTrigger>
            <TabsTrigger value="cities" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Cities
            </TabsTrigger>
            <TabsTrigger value="countries" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Countries
            </TabsTrigger>
          </TabsList>

          <TabsContent value="personalities" className="space-y-6">
            <Card>
              <CardContent>
                <BulkCreatePersonalities />
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5" />
                  Wikipedia Image Reimport
                </CardTitle>
                <CardDescription>
                  Reimport all personality images from Wikipedia (processes in batches of 5)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    This will search Wikipedia for updated images for all personalities and update their image URLs. Processing is done in batches to avoid overwhelming the Wikipedia API.
                  </AlertDescription>
                </Alert>
                
                <Button 
                  onClick={() => handleApiImport('reimport-personality-images')} 
                  disabled={loading === 'reimport-personality-images'} 
                  className="w-full"
                >
                  {loading === 'reimport-personality-images' ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Reimporting Images...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Reimport All Wikipedia Images
                    </>
                  )}
                </Button>
                
                {loading === 'reimport-personality-images' && progress['reimport-personality-images'] > 0 && (
                  <Progress value={progress['reimport-personality-images']} className="h-2" />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    CSV Import
                  </CardTitle>
                  <CardDescription>Import events from CSV files</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Required columns:</strong> title, description, start_date, end_date, venue_name, address, city, country
                    </AlertDescription>
                  </Alert>
                  
                  <div className="space-y-2">
                    <Label htmlFor="events-csv">CSV File (Max 10MB)</Label>
                    <Input id="events-csv" type="file" accept=".csv" onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFileImport('events', file);
                  }} disabled={loading === 'events'} />
                    {loading === 'events' && progress['events-csv'] > 0 && <Progress value={progress['events-csv']} className="h-2" />}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Web Scraper (Firecrawl)
                  </CardTitle>
                  <CardDescription>
                    Scrape events from websites using AI-powered extraction
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="event-seeds">Seed URLs (one per line)</Label>
                    <Textarea id="event-seeds" value={eventSeeds} onChange={e => setEventSeeds(e.target.value)} placeholder={"https://example.com/events\nhttps://another-site.com/whats-on"} className="min-h-[100px]" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="event-limit">Max pages per URL</Label>
                      <Select value={eventLimit} onValueChange={setEventLimit}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10 pages</SelectItem>
                          <SelectItem value="25">25 pages</SelectItem>
                          <SelectItem value="50">50 pages</SelectItem>
                          <SelectItem value="100">100 pages</SelectItem>
                          <SelectItem value="250">250 pages</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button onClick={() => {
                  const seeds = eventSeeds.split(/\n|,/).map(s => s.trim()).filter(Boolean);
                  if (seeds.length === 0) {
                    toast({
                      title: 'No URLs provided',
                      description: 'Add at least one URL to scrape',
                      variant: 'destructive'
                    });
                    return;
                  }
                  handleApiImport('bulk-scrape-events', {
                    seeds,
                    limit: Number(eventLimit) || 100
                  });
                }} disabled={loading === 'bulk-scrape-events'} className="w-full">
                    {loading === 'bulk-scrape-events' ? <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Scraping...
                      </> : <>
                        <Zap className="h-4 w-4 mr-2" />
                        Scrape & Import Events
                      </>}
                  </Button>
                  
                  {loading === 'bulk-scrape-events' && progress['bulk-scrape-events'] > 0 && <Progress value={progress['bulk-scrape-events']} className="h-2" />}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="tags" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  AI-Powered Tag Creation
                </CardTitle>
                <CardDescription>
                  Create tags with AI-generated descriptions and images from Wikimedia/Unsplash
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Each term will be automatically categorized and enhanced with AI-generated descriptions using Wikipedia and OpenAI.
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="ai-tags-textarea">Enter terms (one per line)</Label>
                  <Textarea id="ai-tags-textarea" placeholder={"pride\nrainbow flag\ncoming out\ndrag show\nqueer history"} value={aiTagsInput} onChange={e => setAiTagsInput(e.target.value)} className="min-h-32" disabled={loading === 'bulk-create-ai-tags'} />
                </div>

                <Button onClick={() => {
                if (!aiTagsInput.trim()) {
                  toast({
                    title: "Error",
                    description: "Please enter some terms to create tags",
                    variant: "destructive"
                  });
                  return;
                }
                const termsList = aiTagsInput.split('\n').map(term => term.trim()).filter(term => term.length > 0);
                if (termsList.length === 0) {
                  toast({
                    title: "Error",
                    description: "No valid terms found",
                    variant: "destructive"
                  });
                  return;
                }
                handleApiImport('bulk-create-ai-tags', {
                  terms: termsList
                });
              }} disabled={loading === 'bulk-create-ai-tags'} className="w-full">
                  {loading === 'bulk-create-ai-tags' ? <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Creating Tags with AI...
                    </> : <>
                      <Zap className="h-4 w-4 mr-2" />
                      Create Tags with AI
                    </>}
                </Button>
                
                {loading === 'bulk-create-ai-tags' && progress['bulk-create-ai-tags'] > 0 && <Progress value={progress['bulk-create-ai-tags']} className="h-2" />}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="venues" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    CSV Import
                  </CardTitle>
                  <CardDescription className="text-sm">Import from CSV file</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input type="file" accept=".csv" onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleFileImport('venues', file);
                }} disabled={loading === 'venues'} className="text-sm" />
                  {loading === 'venues' && progress['venues-csv'] > 0 && <Progress value={progress['venues-csv']} className="h-1" />}
                </CardContent>
              </Card>

              {[{
              name: 'Foursquare',
              key: 'import-foursquare-venues',
              icon: Building2
            }, {
              name: 'TripAdvisor',
              key: 'import-tripadvisor-venues',
              icon: Globe
            }, {
              name: 'TomTom',
              key: 'import-tomtom-venues',
              icon: MapPin
            }, {
              name: 'Google Places',
              key: 'import-google-places-venues',
              icon: Globe
            }, {
              name: 'Refuge Restrooms',
              key: 'import-refuge-restrooms',
              icon: Building2
            }].map(({
              name,
              key,
              icon: Icon
            }) => <Card key={key}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {name}
                    </CardTitle>
                    <CardDescription className="text-sm">Import from {name} API</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={() => handleApiImport(key)} disabled={loading === key} size="sm" className="w-full">
                      {loading === key ? <>
                          <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
                          Importing...
                        </> : <>
                          <Download className="h-3 w-3 mr-2" />
                          Import
                        </>}
                    </Button>
                    {loading === key && progress[key] > 0 && <Progress value={progress[key]} className="h-1 mt-2" />}
                  </CardContent>
                </Card>)}
            </div>
          </TabsContent>

          <TabsContent value="news" className="space-y-6">
            <NewsSourcesManager />
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Rss className="h-5 w-5" />
                  Manual News Import
                </CardTitle>
                <CardDescription>
                  Trigger immediate news import from all active sources
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Clock className="h-4 w-4" />
                  <AlertDescription>
                    Automatic import runs every 2 hours. Use manual import for immediate updates.
                  </AlertDescription>
                </Alert>
                
                <Button onClick={() => handleApiImport('fetch-news')} disabled={loading === 'fetch-news'} className="w-full">
                  {loading === 'fetch-news' ? <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Importing News...
                    </> : <>
                      <Download className="h-4 w-4 mr-2" />
                      Import News Now
                    </>}
                </Button>
                
                {loading === 'fetch-news' && progress['fetch-news'] > 0 && <Progress value={progress['fetch-news']} className="h-2" />}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cities" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  City Data Enhancement
                </CardTitle>
                <CardDescription>
                  Import city images and Wikipedia information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  {[{
                  label: 'Fetch City Images',
                  action: 'fetch_images',
                  icon: FileText
                }, {
                  label: 'Fetch Wikipedia Data',
                  action: 'fetch_wikipedia',
                  icon: Globe
                }, {
                  label: 'Import All Data',
                  action: 'fetch_all',
                  icon: Download
                }].map(({
                  label,
                  action,
                  icon: Icon
                }) => <Button key={action} onClick={() => handleApiImport('import-city-data', {
                  action
                })} disabled={loading === 'import-city-data'} variant="outline" className="h-auto p-4 flex-col gap-2">
                      <Icon className="h-5 w-5" />
                      <span className="text-sm">{label}</span>
                      {loading === 'import-city-data' && <RefreshCw className="h-3 w-3 animate-spin" />}
                    </Button>)}
                </div>
                
                {loading === 'import-city-data' && progress['import-city-data'] > 0 && <Progress value={progress['import-city-data']} className="h-2" />}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="countries" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              {[{
              title: 'REST Countries Import',
              description: 'Import country data from REST Countries API',
              function: 'import-country-data',
              buttonText: 'Import Countries & Capitals',
              icon: Globe
            }, {
              title: 'Weather Data Import',
              description: 'Update weather forecast data for cities and countries',
              function: 'get-weather-forecast',
              buttonText: 'Update Weather Data',
              icon: Globe
            }, {
              title: 'ILGA LGBT+ Rights Data',
              description: 'Import LGBT+ jurisdiction data from ILGA World Database',
              function: 'import-ilga-data',
              buttonText: 'Import ILGA Data',
              icon: Globe,
              params: {
                batchSize: 10,
                startIndex: 0
              }
            }].map(({
              title,
              description,
              function: func,
              buttonText,
              icon: Icon,
              params
            }) => <Card key={func}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icon className="h-5 w-5" />
                      {title}
                    </CardTitle>
                    <CardDescription>{description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button onClick={() => handleApiImport(func, params)} disabled={loading === func} className="w-full">
                      {loading === func ? <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </> : <>
                          <Download className="h-4 w-4 mr-2" />
                          {buttonText}
                        </>}
                    </Button>
                    {loading === func && progress[func] > 0 && <Progress value={progress[func]} className="h-2" />}
                  </CardContent>
                </Card>)}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>;
}