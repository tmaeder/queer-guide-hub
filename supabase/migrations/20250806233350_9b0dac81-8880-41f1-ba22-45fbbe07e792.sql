-- Create crawl_jobs table to store website crawling job results
CREATE TABLE IF NOT EXISTS public.crawl_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  pages_crawled INTEGER DEFAULT 0,
  total_pages INTEGER DEFAULT 0,
  credits_used INTEGER DEFAULT 0,
  result_data JSONB DEFAULT '[]'::JSONB,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crawl_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies for crawl_jobs
CREATE POLICY "Admins can manage crawl jobs" 
ON public.crawl_jobs 
FOR ALL 
USING (has_role((SELECT auth.uid()), 'admin'::app_role))
WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role));

-- Create updated_at trigger
CREATE TRIGGER update_crawl_jobs_updated_at
  BEFORE UPDATE ON public.crawl_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();