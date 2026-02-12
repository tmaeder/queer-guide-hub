import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Upload Zone */}
      <Card>
        <CardHeader>
          <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Video style={{ width: 20, height: 20 }} />
            Upload Videos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box
            {...getRootProps()}
            sx={{
              border: 2,
              borderStyle: 'dashed',
              borderRadius: 2,
              p: 4,
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
              borderColor: isDragActive ? 'primary.main' : 'divider',
              bgcolor: isDragActive ? 'primary.light' : 'transparent',
              '&:hover': { borderColor: 'primary.main' },
            }}
          >
            <input {...getInputProps()} />
            <Upload style={{ width: 48, height: 48, margin: '0 auto 16px', color: 'var(--muted-foreground)' }} />
            {isDragActive ? (
              <Typography variant="subtitle1">Drop video files here...</Typography>
            ) : (
              <Box>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Drag & drop video files here, or click to select
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Supports MP4, MOV, AVI, MKV, WebM
                </Typography>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Video List */}
      {videos.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {videos.map((video) => (
            <Card key={video.id}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Box sx={{ flexShrink: 0 }}>
                    <Box sx={{ width: 64, height: 64, bgcolor: 'grey.100', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Video style={{ width: 32, height: 32, color: 'var(--muted-foreground)' }} />
                    </Box>
                  </Box>

                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>Title</Typography>
                        <Input
                          value={video.title}
                          onChange={(e) => updateVideoInfo(video.id, 'title', e.target.value)}
                          placeholder="Video title"
                        />
                      </Box>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>Status</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                          <Box sx={{
                            width: 8, height: 8, borderRadius: '50%',
                            bgcolor: video.status === 'completed' ? 'success.main' :
                                     video.status === 'error' ? 'error.main' : 'warning.main'
                          }} />
                          <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{video.status}</Typography>
                        </Box>
                      </Box>
                    </Box>

                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>Description</Typography>
                      <Textarea
                        value={video.description}
                        onChange={(e) => updateVideoInfo(video.id, 'description', e.target.value)}
                        placeholder="Video description"
                        rows={2}
                      />
                    </Box>

                    {/* Progress */}
                    {video.status === 'uploading' && (
                      <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2">Uploading...</Typography>
                          <Typography variant="body2">{Math.round(video.uploadProgress)}%</Typography>
                        </Box>
                        <Progress value={video.uploadProgress} />
                      </Box>
                    )}

                    {video.status === 'processing' && (
                      <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2">Processing video...</Typography>
                          <Typography variant="body2">{video.processingProgress || 0}%</Typography>
                        </Box>
                        <Progress value={video.processingProgress || 0} />
                      </Box>
                    )}
                  </Box>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeVideo(video.id)}
                    sx={{ flexShrink: 0 }}
                  >
                    <X style={{ width: 16, height: 16 }} />
                  </Button>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
}
