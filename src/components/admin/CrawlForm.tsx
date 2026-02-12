import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { FirecrawlService } from '@/utils/FirecrawlService';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Settings, ExternalLink, Server, Wifi } from 'lucide-react';
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
  const [localEndpoint, setLocalEndpoint] = useState(FirecrawlService.getLocalEndpoint());
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [crawlResult, setCrawlResult] = useState<CrawlResult | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleConnectionTest = async () => {
    if (!localEndpoint) {
      toast({
        title: "Error",
        description: "Please enter a local endpoint",
        variant: "destructive",
      });
      return;
    }

    setIsTesting(true);
    try {
      const isConnected = await FirecrawlService.testConnection(localEndpoint);
      if (isConnected) {
        FirecrawlService.setLocalEndpoint(localEndpoint);
        toast({
          title: "Success",
          description: "Connected to local Firecrawl instance",
        });
        setIsSettingsOpen(false);
      } else {
        toast({
          title: "Error",
          description: "Cannot connect to local Firecrawl instance",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to test connection",
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
      // Test connection to local instance first
      const isConnected = await FirecrawlService.testConnection(localEndpoint);
      if (!isConnected) {
        toast({
          title: "Error",
          description: "Cannot connect to local Firecrawl instance. Please check if it's running.",
          variant: "destructive",
        });
        setIsSettingsOpen(true);
        return;
      }

      console.log('Starting crawl for URL:', url);
      setProgress(25);

      const result = await FirecrawlService.crawlWebsite(url, { endpoint: localEndpoint });
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
      <CardHeader sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            Local Website Crawler
            <Server style={{ width: 16, height: 16 }} />
          </CardTitle>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Crawl websites using your local Firecrawl instance
          </Typography>
        </Box>
        <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings style={{ width: 16, height: 16, marginRight: 8 }} />
              Connection Settings
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Server style={{ width: 20, height: 20 }} />
                Local Firecrawl Configuration
              </DialogTitle>
            </DialogHeader>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Label htmlFor="localEndpoint">Local Endpoint</Label>
                <Input
                  id="localEndpoint"
                  type="url"
                  value={localEndpoint}
                  onChange={(e) => setLocalEndpoint(e.target.value)}
                  placeholder="http://localhost:3002"
                />
                <Typography variant="caption" color="text.secondary">
                  Make sure your local Firecrawl instance is running. Default port is 3002.{' '}
                  <a
                    href="https://github.com/mendableai/firecrawl#-installation"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'inherit', textDecoration: 'underline' }}
                  >
                    Setup instructions
                  </a>
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  onClick={handleConnectionTest}
                  disabled={isTesting || !localEndpoint}
                  sx={{ flex: 1 }}
                >
                  <Wifi style={{ width: 16, height: 16, marginRight: 8 }} />
                  {isTesting ? "Testing..." : "Test Connection"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsSettingsOpen(false)}
                >
                  Cancel
                </Button>
              </Box>
            </Box>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label htmlFor="url">Website URL</Label>
              <Input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                required
              />
            </Box>

            {isLoading && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Label>Crawl Progress</Label>
                <Progress value={progress} sx={{ width: '100%' }} />
              </Box>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              sx={{ width: '100%' }}
            >
              {isLoading ? "Crawling..." : "Start Crawl"}
            </Button>
          </Box>
        </form>

        {crawlResult && (
          <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="h6">Crawl Results</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box>
                <Label>Status</Label>
                <Typography sx={{ fontFamily: 'monospace' }}>{crawlResult.status}</Typography>
              </Box>
              <Box>
                <Label>Pages Crawled</Label>
                <Typography sx={{ fontFamily: 'monospace' }}>{crawlResult.completed}/{crawlResult.total}</Typography>
              </Box>
              <Box>
                <Label>Credits Used</Label>
                <Typography sx={{ fontFamily: 'monospace' }}>{crawlResult.creditsUsed}</Typography>
              </Box>
              <Box>
                <Label>Expires At</Label>
                <Typography sx={{ fontFamily: 'monospace' }}>
                  {crawlResult.expiresAt ? new Date(crawlResult.expiresAt).toLocaleString() : 'N/A'}
                </Typography>
              </Box>
            </Box>

            {crawlResult.data && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Label>Crawled Data ({crawlResult.data.length} pages)</Label>
                <Box sx={{ bgcolor: 'grey.100', p: 2, borderRadius: 1, maxHeight: 240, overflow: 'auto' }}>
                  <pre style={{ fontSize: '0.75rem' }}>
                    {JSON.stringify(crawlResult.data, null, 2)}
                  </pre>
                </Box>
              </Box>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};
