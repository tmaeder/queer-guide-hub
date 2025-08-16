-- Create audio files table
CREATE TABLE public.audio_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  artist TEXT,
  album TEXT,
  duration_seconds INTEGER,
  created_by UUID REFERENCES auth.users(id),
  original_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'completed', 'failed')),
  processing_job_id UUID,
  poster_image_path TEXT,
  transcript_path TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create audio renditions table
CREATE TABLE public.audio_renditions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audio_id UUID NOT NULL REFERENCES public.audio_files(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('progressive', 'hls', 'dash')),
  codec TEXT NOT NULL CHECK (codec IN ('opus', 'aac', 'mp3')),
  container TEXT NOT NULL CHECK (container IN ('webm', 'mp4', 'm4a', 'mp3')),
  bitrate_kbps INTEGER,
  file_size INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create audio processing jobs table
CREATE TABLE public.audio_processing_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audio_id UUID NOT NULL REFERENCES public.audio_files(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  processing_config JSONB NOT NULL DEFAULT '{}',
  progress_percent INTEGER DEFAULT 0,
  current_stage TEXT,
  total_renditions INTEGER DEFAULT 0,
  completed_renditions INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audio_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_renditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_processing_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for audio_files
CREATE POLICY "Public can view completed audio files"
ON public.audio_files FOR SELECT
USING (status = 'completed');

CREATE POLICY "Users can manage their own audio files"
ON public.audio_files FOR ALL
USING (auth.uid() = created_by);

CREATE POLICY "Admins can manage all audio files"
ON public.audio_files FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- RLS Policies for audio_renditions  
CREATE POLICY "Public can view audio renditions"
ON public.audio_renditions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.audio_files 
    WHERE id = audio_renditions.audio_id 
    AND status = 'completed'
  )
);

CREATE POLICY "Users can manage renditions of their audio"
ON public.audio_renditions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.audio_files 
    WHERE id = audio_renditions.audio_id 
    AND created_by = auth.uid()
  )
);

-- RLS Policies for audio_processing_jobs
CREATE POLICY "Users can view their own processing jobs"
ON public.audio_processing_jobs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.audio_files 
    WHERE id = audio_processing_jobs.audio_id 
    AND created_by = auth.uid()
  )
);

CREATE POLICY "Admins can view all processing jobs"
ON public.audio_processing_jobs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Storage policies for audio bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('audio', 'audio', true);

CREATE POLICY "Public can view audio files"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio');

CREATE POLICY "Users can upload audio files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'audio' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own audio files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'audio' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Indexes for performance
CREATE INDEX idx_audio_files_status ON public.audio_files(status);
CREATE INDEX idx_audio_files_created_by ON public.audio_files(created_by);
CREATE INDEX idx_audio_renditions_audio_id ON public.audio_renditions(audio_id);
CREATE INDEX idx_audio_processing_jobs_audio_id ON public.audio_processing_jobs(audio_id);

-- Updated timestamp trigger
CREATE TRIGGER update_audio_files_updated_at
  BEFORE UPDATE ON public.audio_files
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_audio_processing_jobs_updated_at
  BEFORE UPDATE ON public.audio_processing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();