-- Add new columns to import_jobs table for enhanced duplicate and error handling
ALTER TABLE public.import_jobs 
ADD COLUMN IF NOT EXISTS successful_items integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS failed_items integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS duplicate_items integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS import_config jsonb DEFAULT '{}'::jsonb;

-- Add index for better performance on import_config queries
CREATE INDEX IF NOT EXISTS idx_import_jobs_config ON public.import_jobs USING gin(import_config);

-- Add index for status and type for better filtering
CREATE INDEX IF NOT EXISTS idx_import_jobs_status_type ON public.import_jobs (status, type);

-- Update existing jobs to have default config
UPDATE public.import_jobs 
SET import_config = '{
  "duplicateStrategy": "skip",
  "errorStrategy": "continue",
  "validation": {
    "strict": false,
    "required_fields": [],
    "custom_validations": {}
  },
  "filters": {
    "limit": 1000
  },
  "advanced": {
    "enable_geocoding": false,
    "enable_image_processing": true,
    "enable_ai_enhancement": false,
    "concurrent_limit": 3,
    "timeout_seconds": 60
  }
}'::jsonb
WHERE import_config IS NULL OR import_config = '{}'::jsonb;