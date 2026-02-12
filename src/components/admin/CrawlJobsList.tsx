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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
            <RefreshCw style={{ height: 24, width: 24, animation: 'spin 1s linear infinite' }} />
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <CardTitle>Crawl Jobs ({jobs.length})</CardTitle>
        <Button onClick={fetchJobs} variant="outline" size="sm">
          <RefreshCw style={{ height: 16, width: 16, marginRight: 8 }} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <Box sx={{ textAlign: 'center', p: 4, color: 'text.secondary' }}>
            No crawl jobs found. Start by crawling a website above.
          </Box>
        ) : (
          <Box sx={{ borderRadius: 1.5, border: 1, borderColor: 'divider' }}>
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
                    <TableCell sx={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Box
                        component="a"
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ color: 'primary.main', '&:hover': { textDecoration: 'underline' }, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                      >
                        {job.url}
                        <ExternalLink style={{ height: 12, width: 12 }} />
                      </Box>
                    </TableCell>
                    <TableCell>{getStatusBadge(job.status)}</TableCell>
                    <TableCell>{job.pages_crawled}/{job.total_pages}</TableCell>
                    <TableCell>{job.credits_used}</TableCell>
                    <TableCell>
                      {new Date(job.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedJob(job)}
                            >
                              <Eye style={{ height: 12, width: 12 }} />
                            </Button>
                          </DialogTrigger>
                          <DialogContent style={{ maxWidth: 896 }}>
                            <DialogHeader>
                              <DialogTitle>Crawl Results: {job.url}</DialogTitle>
                            </DialogHeader>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, fontSize: '0.875rem' }}>
                                <Box>
                                  <strong>Status:</strong> {getStatusBadge(job.status)}
                                </Box>
                                <Box>
                                  <strong>Pages:</strong> {job.pages_crawled}/{job.total_pages}
                                </Box>
                                <Box>
                                  <strong>Credits:</strong> {job.credits_used}
                                </Box>
                                <Box>
                                  <strong>Created:</strong> {new Date(job.created_at).toLocaleString()}
                                </Box>
                              </Box>

                              {job.result_data && (
                                <Box>
                                  <Typography component="strong" variant="body2">Crawled Data ({job.result_data.length} pages):</Typography>
                                  <ScrollArea style={{ height: 384, marginTop: 8 }}>
                                    <Box
                                      component="pre"
                                      sx={{ fontSize: '0.75rem', bgcolor: 'action.hover', p: 2, borderRadius: 1.5 }}
                                    >
                                      {JSON.stringify(job.result_data, null, 2)}
                                    </Box>
                                  </ScrollArea>
                                </Box>
                              )}
                            </Box>
                          </DialogContent>
                        </Dialog>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteJob(job.id)}
                        >
                          <Trash2 style={{ height: 12, width: 12 }} />
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};
