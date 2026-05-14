-- Create table for image optimization jobs
CREATE TABLE IF NOT EXISTS public.image_optimization_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  total_images INTEGER NOT NULL DEFAULT 0,
  processed_images INTEGER NOT NULL DEFAULT 0,
  successful_images INTEGER NOT NULL DEFAULT 0,
  failed_images INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  results JSONB DEFAULT '[]'::jsonb,
  settings JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.image_optimization_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage optimization jobs" 
ON public.image_optimization_jobs 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_image_optimization_jobs_status ON public.image_optimization_jobs(status);
CREATE INDEX IF NOT EXISTS idx_image_optimization_jobs_created_at ON public.image_optimization_jobs(created_at DESC);