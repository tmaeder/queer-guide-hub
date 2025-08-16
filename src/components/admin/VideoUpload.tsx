import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Video, X, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
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
  const [isUploading, setIsUploading] = useState(false);

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

      // Upload to storage
      const filePath = `uploads/${video.id}/${video.file.name}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('videos')
        .upload(filePath, video.file);

      if (uploadError) throw uploadError;

      // Create video record
      const { data: videoRecord, error: dbError } = await supabase
        .from('videos')
        .insert([{
          id: video.id,
          title: video.title,
          description: video.description,
          original_filename: video.file.name,
          storage_path: filePath,
          status: 'uploaded'
        }])
        .select()
        .single();

      if (dbError) throw dbError;

      // Start processing
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

      // Poll for processing status
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

    // Clean up after 10 minutes
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
    <div className="space-y-6">
      {/* Upload Zone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Upload Videos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive 
                ? 'border-primary bg-primary/5' 
                : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            {isDragActive ? (
              <p className="text-lg">Drop video files here...</p>
            ) : (
              <div>
                <p className="text-lg mb-2">
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
        <div className="space-y-4">
          {videos.map((video) => (
            <Card key={video.id}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                      <Video className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </div>
                  
                  <div className="flex-1 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium">Title</label>
                        <Input
                          value={video.title}
                          onChange={(e) => updateVideoInfo(video.id, 'title', e.target.value)}
                          placeholder="Video title"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Status</label>
                        <div className="flex items-center gap-2 mt-2">
                          <div className={`w-2 h-2 rounded-full ${
                            video.status === 'completed' ? 'bg-green-500' :
                            video.status === 'error' ? 'bg-red-500' :
                            'bg-yellow-500'
                          }`} />
                          <span className="text-sm capitalize">{video.status}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium">Description</label>
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
                        <div className="flex justify-between text-sm mb-1">
                          <span>Uploading...</span>
                          <span>{Math.round(video.uploadProgress)}%</span>
                        </div>
                        <Progress value={video.uploadProgress} />
                      </div>
                    )}

                    {video.status === 'processing' && (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Processing video...</span>
                          <span>{video.processingProgress || 0}%</span>
                        </div>
                        <Progress value={video.processingProgress || 0} />
                      </div>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeVideo(video.id)}
                    className="flex-shrink-0"
                  >
                    <X className="h-4 w-4" />
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