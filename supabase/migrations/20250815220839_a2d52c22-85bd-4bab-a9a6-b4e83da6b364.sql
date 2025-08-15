-- Fix function search path security warning
ALTER FUNCTION public.update_import_jobs_enhanced_updated_at() SET search_path = '';