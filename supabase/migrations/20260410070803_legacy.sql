-- Feedback board v2: GitHub issue tracking + feedback count in admin RPC

-- 1. Add GitHub issue tracking columns to community_submissions
ALTER TABLE public.community_submissions
  ADD COLUMN IF NOT EXISTS github_issue_url text,
  ADD COLUMN IF NOT EXISTS github_issue_number integer,
  ADD COLUMN IF NOT EXISTS forwarded_at timestamptz;

-- 2. Create storage bucket for feedback screenshots (public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feedback-screenshots',
  'feedback-screenshots',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: anyone can read, anyone can upload (same as feedback submission permissions)
DROP POLICY IF EXISTS "Public read feedback screenshots" ON storage.objects;
CREATE POLICY "Public read feedback screenshots"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'feedback-screenshots');

DROP POLICY IF EXISTS "Anyone can upload feedback screenshots" ON storage.objects;
CREATE POLICY "Anyone can upload feedback screenshots"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'feedback-screenshots');

-- 3. Update get_admin_counts to include feedback count
CREATE OR REPLACE FUNCTION public.get_admin_counts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    -- Sidebar content counts
    'venues', (SELECT count(*) FROM venues),
    'events', (SELECT count(*) FROM events),
    'news_articles', (SELECT count(*) FROM news_articles),
    'personalities', (SELECT count(*) FROM personalities),
    'cities', (SELECT count(*) FROM cities),
    'countries', (SELECT count(*) FROM countries),
    'hotels', (SELECT count(*) FROM hotels),
    'queer_villages', (SELECT count(*) FROM queer_villages),
    'marketplace_listings', (SELECT count(*) FROM marketplace_listings),
    'community_groups', (SELECT count(*) FROM community_groups),
    'unified_tags', (SELECT count(*) FROM unified_tags),
    'cms_pages', (SELECT count(*) FROM cms_pages),
    'email_ingestions', (SELECT count(*) FROM email_ingestions),
    'workflow_runs', (SELECT count(*) FROM workflow_runs),
    'scrape_sources', (SELECT count(*) FROM scrape_sources),
    'content_links', (SELECT count(*) FROM content_links),
    'community_submissions', (SELECT count(*) FROM community_submissions),
    'redirects', (SELECT count(*) FROM redirects),
    -- Review queue counts
    'review_staging', (SELECT count(*) FROM ingestion_staging WHERE review_status = 'pending_review' AND disposition = 'pending'),
    'review_cms', (SELECT count(*) FROM cms_content_metadata WHERE workflow_state = 'review'),
    'review_moderation', (SELECT count(*) FROM moderation_flags WHERE status = 'OPEN'),
    'review_tags', (SELECT count(*) FROM tag_suggestions WHERE status = 'pending'),
    'review_duplicates', (SELECT count(*) FROM scraper_dedupe_decisions WHERE decision = 'pending'),
    'review_feedback', (SELECT count(*) FROM community_submissions WHERE content_type = 'feedback' AND feedback_status IN ('new', 'under_review'))
  ) INTO result;

  RETURN result;
END;
$function$;
