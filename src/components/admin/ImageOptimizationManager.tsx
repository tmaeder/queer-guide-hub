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
      const { data, error } = await supabase.functions.invoke('optimize-images-batch', {
        body: { action: 'status', jobId }
      });
      
      if (error) throw error;
      
      const job = data.job;
      setCurrentJob(job);
      
      // If job is completed or failed, reload the jobs list
      if (job.status === 'completed' || job.status === 'failed') {
        await loadJobs();
      }
      
      return job;
    } catch (error) {
      console.error('Failed to check job status:', error);
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
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'processing': return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'failed': return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'pending': return <Clock className="h-4 w-4 text-yellow-500" />;
      default: return <FileImage className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getJobProgress = (job: OptimizationJob) => {
    if (job.total_images === 0) return 0;
    return Math.round((job.processed_images / job.total_images) * 100);
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">You need admin privileges to access image optimization.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">🖼️ Image Optimization Manager</h2>
          <p className="text-muted-foreground">Optimize all existing images for better performance</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={scanForImages}
            disabled={isScanning}
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            {isScanning ? 'Scanning...' : 'Scan Images'}
          </Button>
          <Button 
            onClick={startOptimizationJob}
            disabled={currentJob?.status === 'processing'}
          >
            <Server className="h-4 w-4 mr-2" />
            Start Background Optimization
          </Button>
        </div>
      </div>

      {/* Current Job Progress */}
      {currentJob && (currentJob.status === 'pending' || currentJob.status === 'processing') && (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Processing {currentJob.total_images} images in background...</span>
                <span>{getJobProgress(currentJob)}%</span>
              </div>
              <Progress value={getJobProgress(currentJob)} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{currentJob.processed_images} processed</span>
                <span>{currentJob.successful_images} successful</span>
                <span>{currentJob.failed_images} failed</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="scan">Images Found ({images.length})</TabsTrigger>
          <TabsTrigger value="jobs">Background Jobs ({jobs.length})</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="scan" className="space-y-4">
          {images.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FileImage className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No Images Found</h3>
                <p className="text-muted-foreground mb-4">Click "Scan Images" to find images in your project</p>
                <Button onClick={scanForImages} disabled={isScanning}>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  {isScanning ? 'Scanning...' : 'Scan for Images'}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2">
                      <FileImage className="h-5 w-5 text-blue-500" />
                      <div>
                        <p className="text-2xl font-bold">{images.length}</p>
                        <p className="text-sm text-muted-foreground">Total Images</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-5 w-5 text-purple-500" />
                      <div>
                        <p className="text-2xl font-bold">
                          {formatFileSize(images.reduce((sum, img) => sum + img.originalSize, 0))}
                        </p>
                        <p className="text-sm text-muted-foreground">Total Size</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2">
                      <Server className="h-5 w-5 text-green-500" />
                      <div>
                        <p className="text-2xl font-bold">
                          {jobs.filter(job => job.status === 'completed').length}
                        </p>
                        <p className="text-sm text-muted-foreground">Completed Jobs</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-orange-500" />
                      <div>
                        <p className="text-2xl font-bold">21</p>
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
                  <ScrollArea className="h-96">
                    <div className="space-y-3">
                      {images.map((image, index) => (
                        <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
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
                            <Badge variant="outline" className="capitalize">
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

        <TabsContent value="jobs" className="space-y-4">
          {jobs.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Server className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No Background Jobs</h3>
                <p className="text-muted-foreground mb-4">Start an optimization job to see it here</p>
                <Button onClick={startOptimizationJob}>
                  <Server className="h-4 w-4 mr-2" />
                  Start Background Optimization
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {jobs.map((job, index) => (
                <Card key={index}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(job.status)}
                        <CardTitle className="text-lg">Job {job.id.slice(0, 8)}</CardTitle>
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
                    <div className="space-y-4">
                      {/* Progress bar for active jobs */}
                      {(job.status === 'processing' || job.status === 'pending') && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Processing {job.total_images} images...</span>
                            <span>{getJobProgress(job)}%</span>
                          </div>
                          <Progress value={getJobProgress(job)} className="h-2" />
                        </div>
                      )}
                      
                      {/* Stats */}
                      <div className="grid grid-cols-4 gap-4 text-center">
                        <div>
                          <p className="text-2xl font-bold">{job.total_images}</p>
                          <p className="text-xs text-muted-foreground">Total</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-blue-600">{job.processed_images}</p>
                          <p className="text-xs text-muted-foreground">Processed</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-green-600">{job.successful_images}</p>
                          <p className="text-xs text-muted-foreground">Success</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-red-600">{job.failed_images}</p>
                          <p className="text-xs text-muted-foreground">Failed</p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => checkJobStatus(job.id)}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Refresh
                        </Button>
                        {job.status === 'completed' && (
                          <Button variant="outline" size="sm">
                            <Download className="h-4 w-4 mr-2" />
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

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Background Processing Settings</CardTitle>
              <CardDescription>Configure server-side optimization parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Server className="h-4 w-4" />
                <AlertDescription>
                  Optimization runs on the server and continues even if you close this page or refresh.
                  Jobs process images in batches of 10 to prevent system overload.
                </AlertDescription>
              </Alert>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">AVIF Quality</label>
                  <input type="range" min="20" max="80" defaultValue="50" className="w-full" />
                  <p className="text-xs text-muted-foreground">Lower = smaller files, higher = better quality</p>
                </div>
                <div>
                  <label className="text-sm font-medium">WebP Quality</label>
                  <input type="range" min="50" max="90" defaultValue="75" className="w-full" />
                  <p className="text-xs text-muted-foreground">Lower = smaller files, higher = better quality</p>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium block mb-2">Responsive Breakpoints</label>
                <p className="text-sm text-muted-foreground mb-2">
                  Current: 320px, 640px, 768px, 1024px, 1280px, 1440px, 1920px (21 files per image)
                </p>
              </div>
              
              <Button className="w-full">Save Settings</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}