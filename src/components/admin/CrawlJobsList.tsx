import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ExternalLink, Eye, Trash2, RefreshCw } from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CrawlJob {
  id: string;
  url: string;
  status: string;
  pages_crawled: number;
  total_pages: number;
  credits_used: number;
  result_data: any[];
  expires_at: string | null;
  created_at: string;
}

export const CrawlJobsList = () => {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<CrawlJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<CrawlJob | null>(null);

  const fetchJobs = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('crawl_jobs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setJobs((data || []) as CrawlJob[]);
    } catch (error) {
      console.error('Error fetching crawl jobs:', error);
      toast({
        title: "Error",
        description: "Failed to fetch crawl jobs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteJob = async (id: string) => {
    try {
      const { error } = await (supabase as any)
        .from('crawl_jobs')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setJobs(jobs.filter(job => job.id !== id));
      toast({
        title: "Success",
        description: "Crawl job deleted successfully",
      });
    } catch (error) {
      console.error('Error deleting crawl job:', error);
      toast({
        title: "Error",
        description: "Failed to delete crawl job",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const getStatusBadge = (status: string) => {
    const variant = status === 'completed' ? 'default' : 
                   status === 'failed' ? 'destructive' : 'secondary';
    return <Badge variant={variant}>{status}</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Crawl Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Crawl Jobs ({jobs.length})</CardTitle>
        <Button onClick={fetchJobs} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <div className="text-center p-8 text-muted-foreground">
            No crawl jobs found. Start by crawling a website above.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pages</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="max-w-xs truncate">
                      <a 
                        href={job.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {job.url}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </TableCell>
                    <TableCell>{getStatusBadge(job.status)}</TableCell>
                    <TableCell>{job.pages_crawled}/{job.total_pages}</TableCell>
                    <TableCell>{job.credits_used}</TableCell>
                    <TableCell>
                      {new Date(job.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setSelectedJob(job)}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl">
                            <DialogHeader>
                              <DialogTitle>Crawl Results: {job.url}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="grid grid-cols-4 gap-4 text-sm">
                                <div>
                                  <strong>Status:</strong> {getStatusBadge(job.status)}
                                </div>
                                <div>
                                  <strong>Pages:</strong> {job.pages_crawled}/{job.total_pages}
                                </div>
                                <div>
                                  <strong>Credits:</strong> {job.credits_used}
                                </div>
                                <div>
                                  <strong>Created:</strong> {new Date(job.created_at).toLocaleString()}
                                </div>
                              </div>
                              
                              {job.result_data && (
                                <div>
                                  <strong className="text-sm">Crawled Data ({job.result_data.length} pages):</strong>
                                  <ScrollArea className="h-96 mt-2">
                                    <pre className="text-xs bg-muted p-4 rounded-md">
                                      {JSON.stringify(job.result_data, null, 2)}
                                    </pre>
                                  </ScrollArea>
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                        
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => deleteJob(job.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};