-- Create video management tables
CREATE TABLE IF NOT EXISTS public.videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_filename TEXT NOT NULL,
  title TEXT,
  description TEXT,
  duration_seconds NUMERIC,
  original_size BIGINT,
  original_width INTEGER,
  original_height INTEGER,
  storage_path TEXT NOT NULL,
  poster_image_path TEXT,
  captions_path TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'completed', 'failed')),
  processing_job_id UUID,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create video renditions table for different formats/qualities
CREATE TABLE IF NOT EXISTS public.video_renditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  format TEXT NOT NULL, -- 'progressive' or 'hls' or 'dash'
  codec TEXT NOT NULL, -- 'av1', 'vp9', 'h264'
  container TEXT NOT NULL, -- 'webm', 'mp4', 'm3u8', 'mpd'
  resolution TEXT NOT NULL, -- '1080p', '720p', '540p', '360p'
  width INTEGER,
  height INTEGER,
  bitrate_kbps INTEGER,
  file_size BIGINT,
  file_path TEXT NOT NULL,
  segment_count INTEGER, -- for adaptive streaming
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create video processing jobs table
CREATE TABLE IF NOT EXISTS public.video_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  progress_percent INTEGER DEFAULT 0,
  current_stage TEXT, -- 'analyzing', 'encoding_progressive', 'encoding_adaptive', 'generating_thumbnails'
  total_renditions INTEGER DEFAULT 0,
  completed_renditions INTEGER DEFAULT 0,
  failed_renditions INTEGER DEFAULT 0,
  error_message TEXT,
  processing_config JSONB DEFAULT '{}'::jsonb,
  results JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_renditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_processing_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies for videos
CREATE POLICY "Public videos are viewable by all" 
ON public.videos 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can upload videos" 
ON public.videos 
FOR INSERT 
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Video creators and admins can update videos" 
ON public.videos 
FOR UPDATE 
USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Video creators and admins can delete videos" 
ON public.videos 
FOR DELETE 
USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role));

-- Create policies for video renditions
CREATE POLICY "Video renditions are viewable by all" 
ON public.video_renditions 
FOR SELECT 
USING (true);

CREATE POLICY "System can manage video renditions" 
ON public.video_renditions 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create policies for processing jobs
CREATE POLICY "Users can view processing jobs for their videos" 
ON public.video_processing_jobs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.videos 
    WHERE videos.id = video_processing_jobs.video_id 
    AND (videos.created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "System can manage processing jobs" 
ON public.video_processing_jobs 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_videos_status ON public.videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_created_by ON public.videos(created_by);
CREATE INDEX IF NOT EXISTS idx_video_renditions_video_id ON public.video_renditions(video_id);
CREATE INDEX IF NOT EXISTS idx_video_renditions_format_codec ON public.video_renditions(format, codec);
CREATE INDEX IF NOT EXISTS idx_video_processing_jobs_video_id ON public.video_processing_jobs(video_id);
CREATE INDEX IF NOT EXISTS idx_video_processing_jobs_status ON public.video_processing_jobs(status);

-- Create storage bucket for videos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for videos bucket
CREATE POLICY "Video files are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'videos');

CREATE POLICY "Authenticated users can upload videos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'videos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Video uploaders and admins can update videos" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'videos' AND (auth.uid()::text = (storage.foldername(name))[1] OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Video uploaders and admins can delete videos" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'videos' AND (auth.uid()::text = (storage.foldername(name))[1] OR has_role(auth.uid(), 'admin'::app_role)));