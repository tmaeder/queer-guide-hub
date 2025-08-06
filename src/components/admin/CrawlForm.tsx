import { useState } from 'react';
import { useToast } from "@/hooks/use-toast"; 
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { FirecrawlService } from '@/utils/FirecrawlService';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Settings, ExternalLink, Key } from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";

interface CrawlResult {
  success: boolean;
  status?: string;
  completed?: number;
  total?: number;
  creditsUsed?: number;
  expiresAt?: string;
  data?: any[];
}

export const CrawlForm = () => {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState(FirecrawlService.getApiKey() || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [crawlResult, setCrawlResult] = useState<CrawlResult | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleApiKeyTest = async () => {
    if (!apiKey) {
      toast({
        title: "Error",
        description: "Please enter an API key",
        variant: "destructive",
      });
      return;
    }

    setIsTesting(true);
    try {
      const isValid = await FirecrawlService.testApiKey(apiKey);
      if (isValid) {
        FirecrawlService.saveApiKey(apiKey);
        toast({
          title: "Success",
          description: "API key is valid and saved",
        });
        setIsSettingsOpen(false);
      } else {
        toast({
          title: "Error",
          description: "Invalid API key",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to test API key",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setProgress(0);
    setCrawlResult(null);
    
    try {
      const currentApiKey = FirecrawlService.getApiKey();
      if (!currentApiKey) {
        toast({
          title: "Error",
          description: "Please set your API key first",
          variant: "destructive",
        });
        setIsSettingsOpen(true);
        return;
      }

      console.log('Starting crawl for URL:', url);
      setProgress(25);
      
      const result = await FirecrawlService.crawlWebsite(url);
      setProgress(75);
      
      if (result.success) {
        // Save crawl job to database
        const { error: saveError } = await (supabase as any)
          .from('crawl_jobs')
          .insert({
            url,
            status: result.data.status,
            pages_crawled: result.data.completed,
            total_pages: result.data.total,
            credits_used: result.data.creditsUsed,
            result_data: result.data.data,
            expires_at: result.data.expiresAt ? new Date(result.data.expiresAt).toISOString() : null
          });

        if (saveError) {
          console.error('Error saving crawl job:', saveError);
        }

        toast({
          title: "Success",
          description: "Website crawled successfully and saved",
        });
        setCrawlResult(result.data);
        setProgress(100);
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to crawl website",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error crawling website:', error);
      toast({
        title: "Error",
        description: "Failed to crawl website",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setProgress(100);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            Website Crawler
            <ExternalLink className="h-4 w-4" />
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Crawl websites to extract content and data using Firecrawl
          </p>
        </div>
        <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              API Settings
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Firecrawl API Configuration
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Firecrawl API key"
                />
                <p className="text-xs text-muted-foreground">
                  Get your API key from{' '}
                  <a 
                    href="https://firecrawl.dev" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    firecrawl.dev
                  </a>
                </p>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={handleApiKeyTest} 
                  disabled={isTesting || !apiKey}
                  className="flex-1"
                >
                  {isTesting ? "Testing..." : "Test & Save"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setIsSettingsOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url">Website URL</Label>
            <Input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
            />
          </div>
          
          {isLoading && (
            <div className="space-y-2">
              <Label>Crawl Progress</Label>
              <Progress value={progress} className="w-full" />
            </div>
          )}
          
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? "Crawling..." : "Start Crawl"}
          </Button>
        </form>

        {crawlResult && (
          <div className="mt-6 space-y-4">
            <h3 className="text-lg font-semibold">Crawl Results</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label>Status</Label>
                <p className="font-mono">{crawlResult.status}</p>
              </div>
              <div>
                <Label>Pages Crawled</Label>
                <p className="font-mono">{crawlResult.completed}/{crawlResult.total}</p>
              </div>
              <div>
                <Label>Credits Used</Label>
                <p className="font-mono">{crawlResult.creditsUsed}</p>
              </div>
              <div>
                <Label>Expires At</Label>
                <p className="font-mono">
                  {crawlResult.expiresAt ? new Date(crawlResult.expiresAt).toLocaleString() : 'N/A'}
                </p>
              </div>
            </div>
            
            {crawlResult.data && (
              <div className="space-y-2">
                <Label>Crawled Data ({crawlResult.data.length} pages)</Label>
                <div className="bg-muted p-4 rounded-md max-h-60 overflow-auto">
                  <pre className="text-xs">
                    {JSON.stringify(crawlResult.data, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};