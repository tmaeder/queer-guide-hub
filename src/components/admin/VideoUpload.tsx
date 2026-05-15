import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { insertRow } from '@/hooks/usePageFetchers';
import { toast } from 'sonner';

interface VideoUploadProps {
  onUploadComplete?: (videoId: string) => void;
}

interface UploadedVideo {
  id: string;
  title: string;
  description: string;
  file: File;
  uploadProgress: number;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  processingProgress?: number;
}

export function VideoUpload({ onUploadComplete }: VideoUploadProps) {
  const [videos, setVideos] = useState<UploadedVideo[]>([]);
  const [_isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const videoFiles = acceptedFiles.filter(file => file.type.startsWith('video/'));

    if (videoFiles.length === 0) {
      toast.error('Please upload video files only');
      return;
    }

    const newVideos = videoFiles.map(file => ({
      id: crypto.randomUUID(),
      title: file.name.split('.')[0],
      description: '',
      file,
      uploadProgress: 0,
      status: 'uploading' as const
    }));

    setVideos(prev => [...prev, ...newVideos]);
    newVideos.forEach(video => uploadVideo(video));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uploadVideo defined below, stable in practice
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm']
    },
    multiple: true
  });

  const uploadVideo = async (video: UploadedVideo) => {
    try {
      setIsUploading(true);

      const filePath = `uploads/${video.id}/${video.file.name}`;

      const { data: _uploadData, error: uploadError } = await supabase.storage
        .from('videos')
        .upload(filePath, video.file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await insertRow('videos', {
        id: video.id,
        title: video.title,
        description: video.description,
        original_filename: video.file.name,
        storage_path: filePath,
        status: 'uploaded',
      });

      if (dbError) throw dbError;

      const { error: processError } = await supabase.functions.invoke('process-video', {
        body: {
          action: 'start',
          videoId: video.id,
          config: {
            progressive: { av1: true, vp9: true, h264: true },
            adaptive: { hls: true, dash: false },
            resolutions: ['1080p', '720p', '540p', '360p'],
            generateCaptions: true,
            generateThumbnails: true
          }
        }
      });

      if (processError) throw processError;

      setVideos(prev => prev.map(v =>
        v.id === video.id ? { ...v, status: 'processing' } : v
      ));

      pollProcessingStatus(video.id);

      toast.success(`Started processing "${video.title}"`);
      onUploadComplete?.(video.id);

    } catch (error) {
      console.error('Upload error:', error);
      toast.error(`Failed to upload "${video.title}"`);
      setVideos(prev => prev.map(v =>
        v.id === video.id ? { ...v, status: 'error' } : v
      ));
    } finally {
      setIsUploading(false);
    }
  };

  const pollProcessingStatus = async (videoId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const { data: job } = await supabase.functions.invoke('process-video', {
          body: { action: 'status', jobId: videoId }
        });

        if (job?.job) {
          const { status, progress_percent } = job.job;

          setVideos(prev => prev.map(v =>
            v.id === videoId ? {
              ...v,
              processingProgress: progress_percent,
              status: status === 'completed' ? 'completed' :
                      status === 'failed' ? 'error' : 'processing'
            } : v
          ));

          if (status === 'completed' || status === 'failed') {
            clearInterval(pollInterval);
            if (status === 'completed') {
              toast.success('Video processing completed!');
            }
          }
        }
      } catch (error) {
        console.error('Status poll error:', error);
      }
    }, 2000);

    setTimeout(() => clearInterval(pollInterval), 600000);
  };

  const updateVideoInfo = (id: string, field: 'title' | 'description', value: string) => {
    setVideos(prev => prev.map(v =>
      v.id === id ? { ...v, [field]: value } : v
    ));
  };

  const removeVideo = (id: string) => {
    setVideos(prev => prev.filter(v => v.id !== id));
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Upload Zone */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Video style={{ width: 20, height: 20 }} />
            Upload Videos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-element p-8 text-center cursor-pointer transition-all hover:border-primary ${
              isDragActive ? 'border-primary bg-primary/10' : 'border-border'
            }`}
          >
            <input {...getInputProps()} />
            <Upload style={{ width: 48, height: 48, margin: '0 auto 16px', color: 'var(--muted-foreground)' }} />
            {isDragActive ? (
              <p className="text-base font-medium">Drop video files here...</p>
            ) : (
              <div>
                <p className="text-base font-medium mb-2">
                  Drag & drop video files here, or click to select
                </p>
                <p className="text-sm text-muted-foreground">
                  Supports MP4, MOV, AVI, MKV, WebM
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Video List */}
      {videos.length > 0 && (
        <div className="flex flex-col gap-4">
          {videos.map((video) => (
            <Card key={video.id}>
              <CardContent>
                <div className="flex items-start gap-4">
                  <div className="shrink-0">
                    <div className="w-16 h-16 bg-muted rounded-element flex items-center justify-center">
                      <Video style={{ width: 32, height: 32, color: 'var(--muted-foreground)' }} />
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium">Title</p>
                        <Input
                          value={video.title}
                          onChange={(e) => updateVideoInfo(video.id, 'title', e.target.value)}
                          placeholder="Video title"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Status</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{
                              backgroundColor:
                                video.status === 'completed' ? '#16a34a' :
                                video.status === 'error' ? 'hsl(var(--destructive))' :
                                '#f59e0b',
                            }}
                          />
                          <p className="text-sm capitalize">{video.status}</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium">Description</p>
                      <Textarea
                        value={video.description}
                        onChange={(e) => updateVideoInfo(video.id, 'description', e.target.value)}
                        placeholder="Video description"
                        rows={2}
                      />
                    </div>

                    {/* Progress */}
                    {video.status === 'uploading' && (
                      <div>
                        <div className="flex justify-between mb-1">
                          <p className="text-sm">Uploading...</p>
                          <p className="text-sm">{Math.round(video.uploadProgress)}%</p>
                        </div>
                        <Progress value={video.uploadProgress} />
                      </div>
                    )}

                    {video.status === 'processing' && (
                      <div>
                        <div className="flex justify-between mb-1">
                          <p className="text-sm">Processing video...</p>
                          <p className="text-sm">{video.processingProgress || 0}%</p>
                        </div>
                        <Progress value={video.processingProgress || 0} />
                      </div>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeVideo(video.id)}
                  >
                    <X style={{ width: 16, height: 16 }} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
