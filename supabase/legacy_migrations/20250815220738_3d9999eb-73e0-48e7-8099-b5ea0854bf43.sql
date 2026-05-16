-- Create comprehensive import management tables

-- Enhanced import jobs table with validation and security features
CREATE TABLE IF NOT EXISTS public.import_jobs_enhanced (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'venues-csv', 'events-csv', 'tags-csv', 'personalities-csv',
    'api-venues', 'api-events', 'api-news', 'api-personalities',
    'file-upload', 'web-scraping'
  )),
  source_type TEXT NOT NULL CHECK (source_type IN ('csv', 'api', 'web_scraping', 'file_upload')),
  
  -- Import configuration
  duplicate_strategy TEXT NOT NULL DEFAULT 'skip' CHECK (duplicate_strategy IN ('skip', 'overwrite', 'create_new')),
  unique_key_fields TEXT[] NOT NULL DEFAULT '{}',
  validation_rules JSONB NOT NULL DEFAULT '{}',
  filters JSONB NOT NULL DEFAULT '{}',
  
  -- Status and progress
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validating', 'processing', 'completed', 'failed', 'cancelled')),
  phase TEXT NOT NULL DEFAULT 'queued' CHECK (phase IN ('queued', 'pre_validation', 'processing', 'post_validation', 'cleanup')),
  progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  
  -- Counts and statistics
  total_records INTEGER DEFAULT 0,
  valid_records INTEGER DEFAULT 0,
  invalid_records INTEGER DEFAULT 0,
  processed_records INTEGER DEFAULT 0,
  successful_records INTEGER DEFAULT 0,
  failed_records INTEGER DEFAULT 0,
  duplicate_records INTEGER DEFAULT 0,
  
  -- Data and results
  source_data JSONB,
  validation_report JSONB DEFAULT '{}',
  error_report JSONB DEFAULT '{}',
  import_summary JSONB DEFAULT '{}',
  
  -- Metadata
  file_name TEXT,
  file_size BIGINT,
  file_hash TEXT,
  api_endpoint TEXT,
  user_agent TEXT,
  ip_address INET,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create import validation results table
CREATE TABLE IF NOT EXISTS public.import_validation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id UUID NOT NULL REFERENCES public.import_jobs_enhanced(id) ON DELETE CASCADE,
  record_index INTEGER NOT NULL,
  record_data JSONB NOT NULL,
  is_valid BOOLEAN NOT NULL DEFAULT false,
  validation_errors JSONB DEFAULT '[]',
  validation_warnings JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create import audit log
CREATE TABLE IF NOT EXISTS public.import_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id UUID NOT NULL REFERENCES public.import_jobs_enhanced(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_import_jobs_enhanced_user_id ON public.import_jobs_enhanced(user_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_enhanced_status ON public.import_jobs_enhanced(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_enhanced_type ON public.import_jobs_enhanced(type);
CREATE INDEX IF NOT EXISTS idx_import_jobs_enhanced_created_at ON public.import_jobs_enhanced(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_validation_results_job_id ON public.import_validation_results(import_job_id);
CREATE INDEX IF NOT EXISTS idx_import_audit_log_job_id ON public.import_audit_log(import_job_id);
CREATE INDEX IF NOT EXISTS idx_import_audit_log_user_id ON public.import_audit_log(user_id);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_import_jobs_enhanced_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER trigger_update_import_jobs_enhanced_updated_at
  BEFORE UPDATE ON public.import_jobs_enhanced
  FOR EACH ROW
  EXECUTE FUNCTION public.update_import_jobs_enhanced_updated_at();

-- Enable RLS
ALTER TABLE public.import_jobs_enhanced ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_validation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_audit_log ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for import_jobs_enhanced
CREATE POLICY "Users can manage their own import jobs"
  ON public.import_jobs_enhanced
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Admins can manage all import jobs"
  ON public.import_jobs_enhanced
  FOR ALL
  USING (has_role((SELECT auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role));

-- Create RLS policies for import_validation_results
CREATE POLICY "Users can view validation results for their imports"
  ON public.import_validation_results
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.import_jobs_enhanced 
      WHERE id = import_job_id AND user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can manage all validation results"
  ON public.import_validation_results
  FOR ALL
  USING (has_role((SELECT auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role));

-- Create RLS policies for import_audit_log
CREATE POLICY "Users can view their own import audit logs"
  ON public.import_audit_log
  FOR SELECT
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Admins can view all import audit logs"
  ON public.import_audit_log
  FOR SELECT
  USING (has_role((SELECT auth.uid()), 'admin'::app_role));

CREATE POLICY "System can insert audit logs"
  ON public.import_audit_log
  FOR INSERT
  WITH CHECK (true);

-- Create functions for import management
CREATE OR REPLACE FUNCTION public.validate_import_data(
  job_id UUID,
  validation_rules JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  job_record RECORD;
  validation_result JSONB;
  record_count INTEGER := 0;
  valid_count INTEGER := 0;
  invalid_count INTEGER := 0;
BEGIN
  -- Get the import job
  SELECT * INTO job_record 
  FROM public.import_jobs_enhanced 
  WHERE id = job_id AND user_id = (SELECT auth.uid());
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import job not found or access denied';
  END IF;
  
  -- Update job status to validating
  UPDATE public.import_jobs_enhanced 
  SET status = 'validating', phase = 'pre_validation', started_at = now()
  WHERE id = job_id;
  
  -- Log audit event
  INSERT INTO public.import_audit_log (import_job_id, user_id, action, details)
  VALUES (job_id, (SELECT auth.uid()), 'validation_started', jsonb_build_object('timestamp', now()));
  
  -- This is a simplified validation - in production this would be more comprehensive
  validation_result := jsonb_build_object(
    'total_records', record_count,
    'valid_records', valid_count,
    'invalid_records', invalid_count,
    'validation_timestamp', now()
  );
  
  -- Update job with validation results
  UPDATE public.import_jobs_enhanced 
  SET 
    validation_report = validation_result,
    valid_records = valid_count,
    invalid_records = invalid_count,
    total_records = record_count,
    status = CASE WHEN invalid_count = 0 THEN 'pending' ELSE 'failed' END,
    phase = 'post_validation'
  WHERE id = job_id;
  
  RETURN validation_result;
END;
$$;

-- Create function to get import statistics
CREATE OR REPLACE FUNCTION public.get_import_statistics(user_id_param UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_user_id UUID;
  stats JSONB;
BEGIN
  target_user_id := COALESCE(user_id_param, (SELECT auth.uid()));
  
  -- Check permissions
  IF target_user_id != (SELECT auth.uid()) AND NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  SELECT jsonb_build_object(
    'total_jobs', COUNT(*),
    'completed_jobs', COUNT(*) FILTER (WHERE status = 'completed'),
    'failed_jobs', COUNT(*) FILTER (WHERE status = 'failed'),
    'pending_jobs', COUNT(*) FILTER (WHERE status IN ('pending', 'validating', 'processing')),
    'total_records_processed', COALESCE(SUM(processed_records), 0),
    'total_successful_records', COALESCE(SUM(successful_records), 0),
    'total_failed_records', COALESCE(SUM(failed_records), 0),
    'total_duplicate_records', COALESCE(SUM(duplicate_records), 0),
    'last_import_date', MAX(created_at)
  ) INTO stats
  FROM public.import_jobs_enhanced
  WHERE user_id = target_user_id;
  
  RETURN COALESCE(stats, '{}');
END;
$$;