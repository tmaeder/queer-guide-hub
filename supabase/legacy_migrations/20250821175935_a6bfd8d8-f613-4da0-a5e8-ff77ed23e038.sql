-- Simple fix for invalid JSON data in personalities table
-- Update any rows where JSON fields are invalid
BEGIN;

-- Handle fields column - convert any invalid JSON to empty array
UPDATE personalities 
SET fields = '[]'::jsonb 
WHERE fields IS NOT NULL 
  AND fields::text !~ '^\[.*\]$' 
  AND fields::text !~ '^\{.*\}$';

-- Handle achievements column - convert any invalid JSON to empty array  
UPDATE personalities 
SET achievements = '[]'::jsonb 
WHERE achievements IS NOT NULL 
  AND achievements::text !~ '^\[.*\]$' 
  AND achievements::text !~ '^\{.*\}$';

-- Handle social_links column - convert any invalid JSON to empty object
UPDATE personalities 
SET social_links = '{}'::jsonb 
WHERE social_links IS NOT NULL 
  AND social_links::text !~ '^\[.*\]$' 
  AND social_links::text !~ '^\{.*\}$';

-- Handle tags column - convert any invalid JSON to empty array
UPDATE personalities 
SET tags = '[]'::jsonb 
WHERE tags IS NOT NULL 
  AND tags::text !~ '^\[.*\]$' 
  AND tags::text !~ '^\{.*\}$';

COMMIT;