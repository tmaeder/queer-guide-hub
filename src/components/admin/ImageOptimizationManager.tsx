import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Play, 
  RefreshCw, 
  Download, 
  FileImage, 
  HardDrive, 
  Zap, 
  CheckCircle, 
  AlertCircle,
  FolderOpen,
  Trash2,
  Eye,
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
  results?: any[];
}

export function ImageOptimizationManager() {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [jobs, setJobs] = useState<OptimizationJob[]>([]);
  const [currentJob, setCurrentJob] = useState<OptimizationJob | null>(null);
  const [selectedTab, setSelectedTab] = useState('scan');
  
  const { toast } = useToast();
  const { isAdmin } = useAdminRoles();

  // Load optimization jobs
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

  // Check job status
  const checkJobStatus = async (jobId: string) => {
    try {
      console.log('🔍 Checking job status for:', jobId);
      const { data, error } = await supabase.functions.invoke('optimize-images-batch', {
        body: { action: 'status', jobId }
      });
      
      console.log('📡 Status check response:', { data, error });
      
      if (error) throw error;
      
      const job = data?.job;
      if (!job) {
        console.warn('⚠️ No job data received for jobId:', jobId);
        return null;
      }
      
      console.log('✅ Job status updated:', job);
      setCurrentJob(job);
      
      // If job is completed or failed, reload the jobs list
      if (job.status === 'completed' || job.status === 'failed') {
        await loadJobs();
      }
      
      return job;
    } catch (error) {
      console.error('💥 Failed to check job status:', error);
      return null;
    }
  };

  // Poll active jobs
  useEffect(() => {
    const interval = setInterval(async () => {
      if (currentJob && (currentJob.status === 'pending' || currentJob.status === 'processing')) {
        await checkJobStatus(currentJob.id);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [currentJob]);

  // Load jobs on mount
  useEffect(() => {
    if (isAdmin) {
      loadJobs();
    }
  }, [isAdmin]);

  const scanForImages = async () => {
    setIsScanning(true);
    
    try {
      // Call the image scanning edge function
      const { data, error } = await supabase.functions.invoke('scan-project-images');
      
      if (error) throw error;
      
      const foundImages: ImageFile[] = data.images.map((img: any) => ({
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
    console.log('🚀 Starting optimization job...');
    
    try {
      console.log('📡 Calling optimize-images-batch edge function...');
      const { data, error } = await supabase.functions.invoke('optimize-images-batch', {
        body: { action: 'start', batchSize: 10 }
      });
      
      console.log('📡 Edge function response:', { data, error });
      
      if (error) {
        console.error('❌ Edge function error:', error);
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
      
      console.log('✅ Job created:', job);
      
      setCurrentJob(job);
      setSelectedTab('jobs');
      
      toast({
        title: "Optimization Started!",
        description: `Background optimization job started for ${data.totalImages} images. You can close this page and it will continue processing.`,
      });
      
    } catch (error) {
      console.error('💥 Failed to start optimization job:', error);
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
    <div sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 sx={{ fontSize: '1.5rem', fontWeight: 700 }}>🖼️ Image Optimization Manager</h2>
          <p style={{ color: 'var(--muted-foreground)' }}>Optimize all existing images for better performance</p>
        </div>
        <div sx={{ display: 'flex', gap: 1 }}>
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
          <CardContent sx={{ p: 3 }}>
            <div sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <div sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span>Processing {currentJob.total_images} images in background...</span>
                <span>{getJobProgress(currentJob)}%</span>
              </div>
              <Progress value={getJobProgress(currentJob)} style={{ height: 8 }} />
              <div sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'text.secondary' }}>
                <span>{currentJob.processed_images} processed</span>
                <span>{currentJob.successful_images} successful</span>
                <span>{currentJob.failed_images} failed</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={selectedTab} onValueChange={setSelectedTab} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <TabsList>
          <TabsTrigger value="scan">Images Found ({images.length})</TabsTrigger>
          <TabsTrigger value="jobs">Background Jobs ({jobs.length})</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="scan" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {images.length === 0 ? (
            <Card>
              <CardContent sx={{ p: 4, textAlign: 'center' }}>
                <FileImage style={{ height: 48, width: 48, margin: '0 auto 16px', color: 'var(--muted-foreground)' }} />
                <h3 sx={{ fontSize: '1.125rem', fontWeight: 600, mb: 1 }}>No Images Found</h3>
                <p sx={{ color: 'text.secondary', mb: 2 }}>Click "Scan Images" to find images in your project</p>
                <Button onClick={scanForImages} disabled={isScanning}>
                  <FolderOpen style={{ height: 16, width: 16, marginRight: 8 }} />
                  {isScanning ? 'Scanning...' : 'Scan for Images'}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Summary Cards */}
              <div sx={{ display: 'grid', gridTemplateColumns: { md: 'repeat(4, 1fr)' }, gap: 2 }}>
                <Card>
                  <CardContent sx={{ p: 3 }}>
                    <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <FileImage style={{ height: 20, width: 20, color: '#3b82f6' }} />
                      <div>
                        <p sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{images.length}</p>
                        <p sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Total Images</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent sx={{ p: 3 }}>
                    <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <HardDrive style={{ height: 20, width: 20, color: '#a855f7' }} />
                      <div>
                        <p sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                          {formatFileSize(images.reduce((sum, img) => sum + img.originalSize, 0))}
                        </p>
                        <p sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Total Size</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent sx={{ p: 3 }}>
                    <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Server style={{ height: 20, width: 20, color: '#22c55e' }} />
                      <div>
                        <p sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                          {jobs.filter(job => job.status === 'completed').length}
                        </p>
                        <p sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Completed Jobs</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent sx={{ p: 3 }}>
                    <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Zap style={{ height: 20, width: 20, color: '#f97316' }} />
                      <div>
                        <p sx={{ fontSize: '1.5rem', fontWeight: 700 }}>21</p>
                        <p sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Files per Image</p>
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
                  <ScrollArea sx={{ height: 384 }}>
                    <div sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      {images.map((image, index) => (
                        <div key={index} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                          <div sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            {getStatusIcon(image.status)}
                            <div>
                              <p sx={{ fontWeight: 500 }}>{image.fileName}</p>
                              <p sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                                {formatFileSize(image.originalSize)} • {image.bucket}
                              </p>
                            </div>
                          </div>
                          
                          <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Badge variant="outline" sx={{ textTransform: 'capitalize' }}>
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

        <TabsContent value="jobs" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {jobs.length === 0 ? (
            <Card>
              <CardContent sx={{ p: 4, textAlign: 'center' }}>
                <Server style={{ height: 48, width: 48, margin: '0 auto 16px', color: 'var(--muted-foreground)' }} />
                <h3 sx={{ fontSize: '1.125rem', fontWeight: 600, mb: 1 }}>No Background Jobs</h3>
                <p sx={{ color: 'text.secondary', mb: 2 }}>Start an optimization job to see it here</p>
                <Button onClick={startOptimizationJob}>
                  <Server style={{ height: 16, width: 16, marginRight: 8 }} />
                  Start Background Optimization
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {jobs.map((job, index) => (
                <Card key={index}>
                  <CardHeader>
                    <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getStatusIcon(job.status)}
                        <CardTitle sx={{ fontSize: '1.125rem' }}>Job {job.id.slice(0, 8)}</CardTitle>
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
                    <div sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {/* Progress bar for active jobs */}
                      {(job.status === 'processing' || job.status === 'pending') && (
                        <div sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <div sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                            <span>Processing {job.total_images} images...</span>
                            <span>{getJobProgress(job)}%</span>
                          </div>
                          <Progress value={getJobProgress(job)} style={{ height: 8 }} />
                        </div>
                      )}
                      
                      {/* Stats */}
                      <div sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, textAlign: 'center' }}>
                        <div>
                          <p sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{job.total_images}</p>
                          <p sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Total</p>
                        </div>
                        <div>
                          <p sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#2563eb' }}>{job.processed_images}</p>
                          <p sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Processed</p>
                        </div>
                        <div>
                          <p sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>{job.successful_images}</p>
                          <p sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Success</p>
                        </div>
                        <div>
                          <p sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626' }}>{job.failed_images}</p>
                          <p sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Failed</p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div sx={{ display: 'flex', gap: 1 }}>
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

        <TabsContent value="settings" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Card>
            <CardHeader>
              <CardTitle>Background Processing Settings</CardTitle>
              <CardDescription>Configure server-side optimization parameters</CardDescription>
            </CardHeader>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Alert>
                <Server style={{ height: 16, width: 16 }} />
                <AlertDescription>
                  Optimization runs on the server and continues even if you close this page or refresh.
                  Jobs process images in batches of 10 to prevent system overload.
                </AlertDescription>
              </Alert>
              
              <div sx={{ display: 'grid', gridTemplateColumns: { md: '1fr 1fr' }, gap: 2 }}>
                <div>
                  <label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>AVIF Quality</label>
                  <input type="range" min="20" max="80" defaultValue="50" sx={{ width: '100%' }} />
                  <p sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Lower = smaller files, higher = better quality</p>
                </div>
                <div>
                  <label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>WebP Quality</label>
                  <input type="range" min="50" max="90" defaultValue="75" sx={{ width: '100%' }} />
                  <p sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Lower = smaller files, higher = better quality</p>
                </div>
              </div>
              
              <div>
                <label sx={{ fontSize: '0.875rem', fontWeight: 500, display: 'block', mb: 1 }}>Responsive Breakpoints</label>
                <p sx={{ fontSize: '0.875rem', color: 'text.secondary', mb: 1 }}>
                  Current: 320px, 640px, 768px, 1024px, 1280px, 1440px, 1920px (21 files per image)
                </p>
              </div>
              
              <Button sx={{ width: '100%' }}>Save Settings</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}