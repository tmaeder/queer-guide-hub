-- Create image_optimization_jobs table to track batch optimization progress
CREATE TABLE public.image_optimization_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  total_images INTEGER NOT NULL DEFAULT 0,
  processed_images INTEGER NOT NULL DEFAULT 0,
  successful_images INTEGER NOT NULL DEFAULT 0,
  failed_images INTEGER NOT NULL DEFAULT 0,
  results JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.image_optimization_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies for admin access only
CREATE POLICY "Only admins can view optimization jobs" 
ON public.image_optimization_jobs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.uid() = auth.users.id 
    AND auth.users.raw_user_meta_data->>'role' = 'admin'
  )
);

CREATE POLICY "Only admins can create optimization jobs" 
ON public.image_optimization_jobs 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.uid() = auth.users.id 
    AND auth.users.raw_user_meta_data->>'role' = 'admin'
  )
);

CREATE POLICY "Only admins can update optimization jobs" 
ON public.image_optimization_jobs 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.uid() = auth.users.id 
    AND auth.users.raw_user_meta_data->>'role' = 'admin'
  )
);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_image_optimization_jobs_updated_at
BEFORE UPDATE ON public.image_optimization_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();