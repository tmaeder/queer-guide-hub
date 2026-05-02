-- Fix invalid JSON data in personalities table
-- First, identify and fix rows with invalid JSON in fields column
UPDATE personalities 
SET fields = '[]'::jsonb 
WHERE fields IS NOT NULL 
  AND NOT (
    CASE 
      WHEN fields::text = '' THEN true
      WHEN fields::text = 'null' THEN true
      ELSE 
        CASE 
          WHEN fields::text ~ '^[\[\{].*[\]\}]$' THEN 
            (SELECT fields::jsonb IS NOT NULL)
          ELSE false
        END
    END
  );

-- Fix invalid JSON data in achievements column
UPDATE personalities 
SET achievements = '[]'::jsonb 
WHERE achievements IS NOT NULL 
  AND NOT (
    CASE 
      WHEN achievements::text = '' THEN true
      WHEN achievements::text = 'null' THEN true
      ELSE 
        CASE 
          WHEN achievements::text ~ '^[\[\{].*[\]\}]$' THEN 
            (SELECT achievements::jsonb IS NOT NULL)
          ELSE false
        END
    END
  );

-- Fix invalid JSON data in social_links column
UPDATE personalities 
SET social_links = '{}'::jsonb 
WHERE social_links IS NOT NULL 
  AND NOT (
    CASE 
      WHEN social_links::text = '' THEN true
      WHEN social_links::text = 'null' THEN true
      ELSE 
        CASE 
          WHEN social_links::text ~ '^[\[\{].*[\]\}]$' THEN 
            (SELECT social_links::jsonb IS NOT NULL)
          ELSE false
        END
    END
  );

-- Fix invalid JSON data in tags column
UPDATE personalities 
SET tags = '[]'::jsonb 
WHERE tags IS NOT NULL 
  AND NOT (
    CASE 
      WHEN tags::text = '' THEN true
      WHEN tags::text = 'null' THEN true
      ELSE 
        CASE 
          WHEN tags::text ~ '^[\[\{].*[\]\}]$' THEN 
            (SELECT tags::jsonb IS NOT NULL)
          ELSE false
        END
    END
  );

-- Look for any specific problematic entries with "healthcare" and fix them
UPDATE personalities 
SET fields = '["healthcare"]'::jsonb
WHERE fields IS NOT NULL 
  AND fields::text LIKE '%healthcare%'
  AND NOT (fields::text ~ '^[\[\{].*[\]\}]$');

UPDATE personalities 
SET achievements = '[]'::jsonb
WHERE achievements IS NOT NULL 
  AND achievements::text LIKE '%healthcare%'
  AND NOT (achievements::text ~ '^[\[\{].*[\]\}]$');

UPDATE personalities 
SET tags = '["healthcare"]'::jsonb
WHERE tags IS NOT NULL 
  AND tags::text LIKE '%healthcare%'
  AND NOT (tags::text ~ '^[\[\{].*[\]\}]$');