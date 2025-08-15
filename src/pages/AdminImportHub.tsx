import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Download, Rss, Globe, MapPin, Calendar, Building2, Newspaper, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NewsSourcesManager } from "@/components/admin/NewsSourcesManager";
import { BulkCreatePersonalities } from "@/components/personalities/BulkCreatePersonalities";
import BulkCreateAITags from "@/components/admin/BulkCreateAITags";

export default function AdminImportHub() {
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);
  const [eventSeeds, setEventSeeds] = useState<string>('');
  const [eventLimit, setEventLimit] = useState<string>('100');

  const handleFileImport = async (type: string, file: File) => {
    if (!file) return;
    
    setLoading(type);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const { data, error } = await supabase.functions.invoke(`import-${type}-csv`, {
        body: formData,
      });

      if (error) throw error;

      toast({
        title: "Import Successful",
        description: `${type} data imported successfully. Processed ${data?.imported || 'unknown'} items.`,
      });
    } catch (error) {
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const handleApiImport = async (functionName: string, params: any = {}) => {
    setLoading(functionName);
    try {
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: params,
      });

      if (error) throw error;

      toast({
        title: "Import Successful", 
        description: `Data imported successfully. ${data?.message || `Processed ${data?.imported || data?.processed_articles || 'items'} successfully.`}`,
      });
    } catch (error) {
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Download className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Import Hub</h1>
          <p className="text-muted-foreground">Centralized data import management for all content types</p>
        </div>
      </div>

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
            <Upload className="h-4 w-4" />
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
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Import Personalities
              </CardTitle>
              <CardDescription>Bulk create personalities from names and enrich with Wikipedia/Wikidata</CardDescription>
            </CardHeader>
            <CardContent>
              <BulkCreatePersonalities />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Import Events
              </CardTitle>
              <CardDescription>Import events from CSV files or external APIs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="events-csv">CSV File Import</Label>
                <Input
                  id="events-csv"
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileImport('events', file);
                  }}
                  disabled={loading === 'events'}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Expected columns: title, description, start_date, end_date, venue_name, address, city, country
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Bulk Web Scraper (Firecrawl)
              </CardTitle>
              <CardDescription>Scrape events from websites using Firecrawl and import them</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="event-seeds">Seed URLs (one per line)</Label>
                <Textarea
                  id="event-seeds"
                  value={eventSeeds}
                  onChange={(e) => setEventSeeds(e.target.value)}
                  placeholder={"https://example.com/events\nhttps://another-site.com/whats-on"}
                  className="min-h-[120px]"
                />
              </div>
              <div className="space-y-2 w-56">
                <Label htmlFor="event-limit">Max pages per seed</Label>
                <Input
                  id="event-limit"
                  type="number"
                  min={1}
                  max={500}
                  value={eventLimit}
                  onChange={(e) => setEventLimit(e.target.value)}
                />
              </div>
              <Button
                onClick={() => {
                  const seeds = eventSeeds
                    .split(/\n|,/)
                    .map((s) => s.trim())
                    .filter(Boolean);
                  if (seeds.length === 0) {
                    toast({ title: 'No seeds provided', description: 'Add at least one URL', variant: 'destructive' });
                    return;
                  }
                  handleApiImport('bulk-scrape-events', { seeds, limit: Number(eventLimit) || 100 });
                }}
                disabled={loading === 'bulk-scrape-events'}
                className="w-full"
              >
                {loading === 'bulk-scrape-events' ? 'Scraping…' : 'Scrape & Import from URLs'}
              </Button>
              <p className="text-sm text-muted-foreground">
                Extracts schema.org Event data from crawled pages, normalizes and de-duplicates before inserting into the Events table.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tags" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                AI Bulk Tag Creation
              </CardTitle>
              <CardDescription>Create tags with AI-generated descriptions and images from Wikimedia/Unsplash</CardDescription>
            </CardHeader>
            <CardContent>
              <BulkCreateAITags />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="venues" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  CSV Import
                </CardTitle>
                <CardDescription>Import venues from CSV file</CardDescription>
              </CardHeader>
              <CardContent>
                <Label htmlFor="venues-csv">CSV File</Label>
                <Input
                  id="venues-csv"
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileImport('venues', file);
                  }}
                  disabled={loading === 'venues'}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Foursquare Import</CardTitle>
                <CardDescription>Import venues from Foursquare API</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => handleApiImport('import-foursquare-venues')}
                  disabled={loading === 'import-foursquare-venues'}
                  className="w-full"
                >
                  {loading === 'import-foursquare-venues' ? 'Importing...' : 'Import from Foursquare'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>TripAdvisor Import</CardTitle>
                <CardDescription>Import venues from TripAdvisor API</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => handleApiImport('import-tripadvisor-venues')}
                  disabled={loading === 'import-tripadvisor-venues'}
                  className="w-full"
                >
                  {loading === 'import-tripadvisor-venues' ? 'Importing...' : 'Import from TripAdvisor'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>TomTom Import</CardTitle>
                <CardDescription>Import venues from TomTom API</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => handleApiImport('import-tomtom-venues')}
                  disabled={loading === 'import-tomtom-venues'}
                  className="w-full"
                >
                  {loading === 'import-tomtom-venues' ? 'Importing...' : 'Import from TomTom'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Refuge Restrooms Import</CardTitle>
                <CardDescription>Import safe public restrooms from Refuge Restrooms API</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => handleApiImport('import-refuge-restrooms')}
                  disabled={loading === 'import-refuge-restrooms'}
                  className="w-full"
                >
                  {loading === 'import-refuge-restrooms' ? 'Importing...' : 'Import Restrooms'}
                </Button>
              </CardContent>
            </Card>
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
              <CardDescription>Trigger immediate news import from all active sources</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={() => handleApiImport('fetch-news')}
                disabled={loading === 'fetch-news'}
                className="w-full"
              >
                {loading === 'fetch-news' ? 'Importing...' : 'Import News Now'}
              </Button>
              <p className="text-sm text-muted-foreground">
                This will fetch news from all active RSS feeds and API sources. Automatic import runs every 2 hours.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cities" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                City Data Import
              </CardTitle>
              <CardDescription>Import city information and images</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Button
                  onClick={() => handleApiImport('import-city-data', { action: 'fetch_images' })}
                  disabled={loading === 'import-city-data'}
                >
                  {loading === 'import-city-data' ? 'Fetching...' : 'Fetch All City Images'}
                </Button>
                <Button
                  onClick={() => handleApiImport('import-city-data', { action: 'fetch_wikipedia' })}
                  disabled={loading === 'import-city-data'}
                >
                  {loading === 'import-city-data' ? 'Fetching...' : 'Fetch Wikipedia Data'}
                </Button>
                <Button
                  onClick={() => handleApiImport('import-city-data', { action: 'fetch_all' })}
                  disabled={loading === 'import-city-data'}
                >
                  {loading === 'import-city-data' ? 'Processing...' : 'Import All City Data'}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Import city images from Pexels/Unsplash and descriptions from Wikipedia
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="countries" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                REST Countries Import
              </CardTitle>
              <CardDescription>Import country data from REST Countries API</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={() => handleApiImport('import-country-data')}
                disabled={loading === 'import-country-data'}
                className="w-full"
              >
                {loading === 'import-country-data' ? 'Importing...' : 'Import Countries & Capitals'}
              </Button>
              <p className="text-sm text-muted-foreground">
                Imports all countries and capital cities from REST Countries API, preserving existing LGBTI data
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Weather Data Import
              </CardTitle>
              <CardDescription>Update weather forecast data for cities and countries</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={() => handleApiImport('get-weather-forecast')}
                disabled={loading === 'get-weather-forecast'}
                className="w-full"
              >
                {loading === 'get-weather-forecast' ? 'Fetching...' : 'Update Weather Data'}
              </Button>
              <p className="text-sm text-muted-foreground">
                Updates weather forecast data for all cities and countries
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                ILGA LGBT+ Rights Data
              </CardTitle>
              <CardDescription>Import LGBT+ jurisdiction data from ILGA World Database</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={() => handleApiImport('import-ilga-data', { batchSize: 10, startIndex: 0 })}
                disabled={loading === 'import-ilga-data'}
                className="w-full"
              >
                {loading === 'import-ilga-data' ? 'Importing...' : 'Import ILGA Data for All Countries'}
              </Button>
              <p className="text-sm text-muted-foreground">
                Imports real LGBT+ rights and legal status data from ILGA World Database for all countries. This includes criminalization status, same-sex marriage, anti-discrimination laws, and more.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Location Linking
              </CardTitle>
              <CardDescription>Link venues and events to cities and countries</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={() => handleApiImport('link-locations')}
                disabled={loading === 'link-locations'}
                className="w-full"
              >
                {loading === 'link-locations' ? 'Processing...' : 'Link Locations Now'}
              </Button>
              <p className="text-sm text-muted-foreground">
                Automatically links venues and events to cities/countries, creating missing ones. Runs hourly via cron job.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-primary">Import Status & Logs</CardTitle>
          <CardDescription>Monitor import operations and view logs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p className="text-sm">
              <strong>Active Operation:</strong> {loading || 'None'}
            </p>
            <p className="text-sm text-muted-foreground">
              Check the Supabase Edge Functions logs for detailed import information and error messages.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}