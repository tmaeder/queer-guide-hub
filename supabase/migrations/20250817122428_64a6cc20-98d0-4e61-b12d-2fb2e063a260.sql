-- Create table to track media optimization status
CREATE TABLE public.media_optimization_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_path TEXT NOT NULL UNIQUE,
  bucket_name TEXT NOT NULL,
  original_format TEXT NOT NULL,
  original_size INTEGER NOT NULL,
  optimization_status TEXT NOT NULL DEFAULT 'not_optimized',
  optimized_formats JSONB DEFAULT '[]'::jsonb,
  compression_data JSONB DEFAULT '{}'::jsonb,
  optimized_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.media_optimization_status ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view optimization status" 
ON public.media_optimization_status 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage optimization status" 
ON public.media_optimization_status 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create function to update timestamps
CREATE TRIGGER update_media_optimization_status_updated_at
BEFORE UPDATE ON public.media_optimization_status
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();