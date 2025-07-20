-- Add new columns to news_sources table for status tracking and keyword management
ALTER TABLE news_sources 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS articles_fetched INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT ARRAY['LGBT', 'Gay', 'Lesbian', 'Bisexual', 'Intersex', 'Transgender', 'Sexual Orientation'];

-- Update existing API sources to have keywords
UPDATE news_sources 
SET keywords = ARRAY['LGBT', 'Gay', 'Lesbian', 'Bisexual', 'Intersex', 'Transgender', 'Sexual Orientation']
WHERE source_type = 'api' AND keywords IS NULL;