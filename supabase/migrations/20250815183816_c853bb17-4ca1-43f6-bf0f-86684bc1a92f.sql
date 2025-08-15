-- Create import_jobs table for background job management
CREATE TABLE public.import_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_batch INTEGER NOT NULL DEFAULT 0,
  total_batches INTEGER NOT NULL DEFAULT 1,
  processed_items INTEGER NOT NULL DEFAULT 0,
  total_items INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  error_details TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  data JSONB NOT NULL DEFAULT '{}',
  batch_size INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies for import jobs (admin only)
CREATE POLICY "Import jobs are viewable by admins" 
ON public.import_jobs 
FOR SELECT 
USING (
  auth.uid() IN (
    SELECT user_id FROM public.profiles 
    WHERE role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "Import jobs can be created by admins" 
ON public.import_jobs 
FOR INSERT 
WITH CHECK (
  auth.uid() IN (
    SELECT user_id FROM public.profiles 
    WHERE role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "Import jobs can be updated by admins" 
ON public.import_jobs 
FOR UPDATE 
USING (
  auth.uid() IN (
    SELECT user_id FROM public.profiles 
    WHERE role IN ('admin', 'super_admin')
  )
);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_import_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_import_jobs_updated_at
  BEFORE UPDATE ON public.import_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_import_jobs_updated_at();

-- Create index for performance
CREATE INDEX idx_import_jobs_status ON public.import_jobs(status);
CREATE INDEX idx_import_jobs_created_at ON public.import_jobs(created_at DESC);