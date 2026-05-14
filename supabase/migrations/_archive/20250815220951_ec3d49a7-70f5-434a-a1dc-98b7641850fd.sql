-- Fix specific functions that may be missing search_path
ALTER FUNCTION public.validate_import_data(UUID, JSONB) SET search_path = '';
ALTER FUNCTION public.get_import_statistics(UUID) SET search_path = '';