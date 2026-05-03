import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  RefreshCw,
  Download,
  FileImage,
  HardDrive,
  Zap,
  CheckCircle,
  AlertCircle,
  FolderOpen,
  Clock,
  Server
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { supabase } from '@/integrations/supabase/client';
import { AdminRoleRequest } from './AdminRoleRequest';

interface ImageFile {
  fileName: string;
  baseName: string;
  originalSize: number;
  optimizedSizes?: {
    avif: number;
    webp: number;
    jpeg: number;
  };
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  generated?: number;
  savings?: number;
  bucket?: string;
}

interface OptimizationJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_images: number;
  processed_images: number;
  successful_images: number;
  failed_images: number;
  created_at: string;
  updated_at: string;
  results?: Array<{ fileName: string; status: string }>;
}

export function ImageOptimizationManager() {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [jobs, setJobs] = useState<OptimizationJob[]>([]);
  const [currentJob, setCurrentJob] = useState<OptimizationJob | null>(null);
  const [selectedTab, setSelectedTab] = useState('scan');

  const { toast } = useToast();
  const { isAdmin } = useAdminRoles();

  const loadJobs = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('optimize-images-batch', {
        body: { action: 'list' }
      });

      if (error) throw error;
      setJobs(data.jobs || []);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    }
  };

  const checkJobStatus = async (jobId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('optimize-images-batch', {
        body: { action: 'status', jobId }
      });

      if (error) throw error;

      const job = data?.job;
      if (!job) {
        console.warn('No job data received for jobId:', jobId);
        return null;
      }

      setCurrentJob(job);

      if (job.status === 'completed' || job.status === 'failed') {
        await loadJobs();
      }

      return job;
    } catch (error) {
      console.error('Failed to check job status:', error);
      return null;
    }
  };

  useEffect(() => {
    const interval = setInterval(async () => {
      if (currentJob && (currentJob.status === 'pending' || currentJob.status === 'processing')) {
        await checkJobStatus(currentJob.id);
      }
    }, 3000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentJob]);

  useEffect(() => {
    if (isAdmin) {
      loadJobs();
    }
  }, [isAdmin]);

  const scanForImages = async () => {
    setIsScanning(true);

    try {
      const { data, error } = await supabase.functions.invoke('scan-project-images');

      if (error) throw error;

      const foundImages: ImageFile[] = data.images.map((img: { fileName: string; baseName: string; size: number; bucket: string }) => ({
        fileName: img.fileName,
        baseName: img.baseName,
        originalSize: img.size,
        bucket: img.bucket,
        status: 'pending' as const
      }));

      setImages(foundImages);
      toast({
        title: "Scan Complete",
        description: `Found ${foundImages.length} images ready for optimization`,
      });

    } catch (error) {
      console.error('Scan error:', error);
      toast({
        title: "Scan Failed",
        description: "Failed to scan for images",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const startOptimizationJob = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('optimize-images-batch', {
        body: { action: 'start', batchSize: 10 }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      const job = {
        id: data.jobId,
        status: 'pending' as const,
        total_images: data.totalImages,
        processed_images: 0,
        successful_images: 0,
        failed_images: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      setCurrentJob(job);
      setSelectedTab('jobs');

      toast({
        title: "Optimization Started!",
        description: `Background optimization job started for ${data.totalImages} images. You can close this page and it will continue processing.`,
      });

    } catch (error) {
      console.error('Failed to start optimization job:', error);
      toast({
        title: "Failed to Start Optimization",
        description: `Could not start the optimization job: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />;
      case 'processing': return <RefreshCw style={{ height: 16, width: 16, color: '#3b82f6', animation: 'spin 1s linear infinite' }} />;
      case 'failed': return <AlertCircle style={{ height: 16, width: 16, color: '#ef4444' }} />;
      case 'pending': return <Clock style={{ height: 16, width: 16, color: '#eab308' }} />;
      default: return <FileImage style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />;
    }
  };

  const getJobProgress = (job: OptimizationJob) => {
    if (job.total_images === 0) return 0;
    return Math.round((job.processed_images / job.total_images) * 100);
  };

  if (!isAdmin) {
    return <AdminRoleRequest />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold" style={{ fontSize: '1.5rem' }}>🖼️ Image Optimization Manager</h2>
          <p className="text-muted-foreground">Optimize all existing images for better performance</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={scanForImages}
            disabled={isScanning}
          >
            <FolderOpen style={{ height: 16, width: 16, marginRight: 8 }} />
            {isScanning ? 'Scanning...' : 'Scan Images'}
          </Button>
          <Button
            onClick={startOptimizationJob}
            disabled={currentJob?.status === 'processing'}
          >
            <Server style={{ height: 16, width: 16, marginRight: 8 }} />
            Start Background Optimization
          </Button>
        </div>
      </div>

      {/* Current Job Progress */}
      {currentJob && (currentJob.status === 'pending' || currentJob.status === 'processing') && (
        <Card>
          <CardContent>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-sm">
                <span>Processing {currentJob.total_images} images in background...</span>
                <span>{getJobProgress(currentJob)}%</span>
              </div>
              <Progress value={getJobProgress(currentJob)} style={{ height: 8 }} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{currentJob.processed_images} processed</span>
                <span>{currentJob.successful_images} successful</span>
                <span>{currentJob.failed_images} failed</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="scan">Images Found ({images.length})</TabsTrigger>
          <TabsTrigger value="jobs">Background Jobs ({jobs.length})</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="scan">
          {images.length === 0 ? (
            <Card>
              <CardContent>
                <FileImage style={{ height: 48, width: 48, margin: '0 auto 16px', color: 'var(--muted-foreground)' }} />
                <h3 className="font-semibold mb-2" style={{ fontSize: '1.125rem' }}>No Images Found</h3>
                <p className="text-muted-foreground mb-4">Click "Scan Images" to find images in your project</p>
                <Button onClick={scanForImages} disabled={isScanning}>
                  <FolderOpen style={{ height: 16, width: 16, marginRight: 8 }} />
                  {isScanning ? 'Scanning...' : 'Scan for Images'}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Summary Cards */}
              <div className="grid md:grid-cols-4 gap-4">
                <Card>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <FileImage style={{ height: 20, width: 20, color: '#3b82f6' }} />
                      <div>
                        <p className="font-bold" style={{ fontSize: '1.5rem' }}>{images.length}</p>
                        <p className="text-sm text-muted-foreground">Total Images</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <HardDrive style={{ height: 20, width: 20, color: '#555555' }} />
                      <div>
                        <p className="font-bold" style={{ fontSize: '1.5rem' }}>
                          {formatFileSize(images.reduce((sum, img) => sum + img.originalSize, 0))}
                        </p>
                        <p className="text-sm text-muted-foreground">Total Size</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Server style={{ height: 20, width: 20, color: '#22c55e' }} />
                      <div>
                        <p className="font-bold" style={{ fontSize: '1.5rem' }}>
                          {jobs.filter(job => job.status === 'completed').length}
                        </p>
                        <p className="text-sm text-muted-foreground">Completed Jobs</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Zap style={{ height: 20, width: 20, color: '#f97316' }} />
                      <div>
                        <p className="font-bold" style={{ fontSize: '1.5rem' }}>21</p>
                        <p className="text-sm text-muted-foreground">Files per Image</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Images List */}
              <Card>
                <CardHeader>
                  <CardTitle>Image Files</CardTitle>
                  <CardDescription>Images found in storage buckets ready for optimization</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea>
                    <div className="flex flex-col gap-3">
                      {images.map((image, index) => (
                        <div key={index} className="flex items-center justify-between p-3 border border-border rounded-lg">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(image.status)}
                            <div>
                              <p className="font-medium">{image.fileName}</p>
                              <p className="text-sm text-muted-foreground">
                                {formatFileSize(image.originalSize)} • {image.bucket}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              Ready
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="jobs">
          {jobs.length === 0 ? (
            <Card>
              <CardContent>
                <Server style={{ height: 48, width: 48, margin: '0 auto 16px', color: 'var(--muted-foreground)' }} />
                <h3 className="font-semibold mb-2" style={{ fontSize: '1.125rem' }}>No Background Jobs</h3>
                <p className="text-muted-foreground mb-4">Start an optimization job to see it here</p>
                <Button onClick={startOptimizationJob}>
                  <Server style={{ height: 16, width: 16, marginRight: 8 }} />
                  Start Background Optimization
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {jobs.map((job, index) => (
                <Card key={index}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(job.status)}
                        <CardTitle>Job {job.id.slice(0, 8)}</CardTitle>
                      </div>
                      <Badge variant={
                        job.status === 'completed' ? 'default' :
                        job.status === 'processing' ? 'secondary' :
                        job.status === 'failed' ? 'destructive' : 'outline'
                      }>
                        {job.status}
                      </Badge>
                    </div>
                    <CardDescription>
                      Started {new Date(job.created_at).toLocaleString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-4">
                      {(job.status === 'processing' || job.status === 'pending') && (
                        <div className="flex flex-col gap-2">
                          <div className="flex justify-between text-sm">
                            <span>Processing {job.total_images} images...</span>
                            <span>{getJobProgress(job)}%</span>
                          </div>
                          <Progress value={getJobProgress(job)} style={{ height: 8 }} />
                        </div>
                      )}

                      <div className="grid grid-cols-4 gap-4 text-center">
                        <div>
                          <p className="font-bold" style={{ fontSize: '1.5rem' }}>{job.total_images}</p>
                          <p className="text-xs text-muted-foreground">Total</p>
                        </div>
                        <div>
                          <p className="font-bold" style={{ fontSize: '1.5rem', color: '#2563eb' }}>{job.processed_images}</p>
                          <p className="text-xs text-muted-foreground">Processed</p>
                        </div>
                        <div>
                          <p className="font-bold" style={{ fontSize: '1.5rem', color: '#16a34a' }}>{job.successful_images}</p>
                          <p className="text-xs text-muted-foreground">Success</p>
                        </div>
                        <div>
                          <p className="font-bold" style={{ fontSize: '1.5rem', color: '#dc2626' }}>{job.failed_images}</p>
                          <p className="text-xs text-muted-foreground">Failed</p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => checkJobStatus(job.id)}
                        >
                          <RefreshCw style={{ height: 16, width: 16, marginRight: 8 }} />
                          Refresh
                        </Button>
                        {job.status === 'completed' && (
                          <Button variant="outline" size="sm">
                            <Download style={{ height: 16, width: 16, marginRight: 8 }} />
                            Download Report
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Background Processing Settings</CardTitle>
              <CardDescription>Configure server-side optimization parameters</CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <Server style={{ height: 16, width: 16 }} />
                <AlertDescription>
                  Optimization runs on the server and continues even if you close this page or refresh.
                  Jobs process images in batches of 10 to prevent system overload.
                </AlertDescription>
              </Alert>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">AVIF Quality</label>
                  <input type="range" min="20" max="80" defaultValue="50" style={{ width: '100%' }} />
                  <p className="text-xs text-muted-foreground">Lower = smaller files, higher = better quality</p>
                </div>
                <div>
                  <label className="text-sm font-medium">WebP Quality</label>
                  <input type="range" min="50" max="90" defaultValue="75" style={{ width: '100%' }} />
                  <p className="text-xs text-muted-foreground">Lower = smaller files, higher = better quality</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Responsive Breakpoints</label>
                <p className="text-sm text-muted-foreground mb-2">
                  Current: 320px, 640px, 768px, 1024px, 1280px, 1440px, 1920px (21 files per image)
                </p>
              </div>

              <Button>Save Settings</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
