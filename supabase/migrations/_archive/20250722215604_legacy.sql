-- Complete remaining security fixes

-- Fix the last remaining security definer functions
CREATE OR REPLACE FUNCTION public.increment_post_likes(post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.community_posts 
  SET likes_count = COALESCE(likes_count, 0) + 1 
  WHERE id = post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_post_likes(post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.community_posts 
  SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0)
  WHERE id = post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_post_comments(post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.community_posts 
  SET comments_count = COALESCE(comments_count, 0) + 1 
  WHERE id = post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_article_views(article_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.news_articles 
  SET views_count = COALESCE(views_count, 0) + 1 
  WHERE id = article_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_tag_relationships_table_if_not_exists()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Create the tag_relationships table if it doesn't exist
  CREATE TABLE IF NOT EXISTS public.tag_relationships (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tag1_id UUID NOT NULL,
    tag2_id UUID NOT NULL,
    similarity_score NUMERIC(5,4) NOT NULL,
    relationship_type TEXT NOT NULL DEFAULT 'semantic',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(tag1_id, tag2_id)
  );

  -- Enable RLS
  ALTER TABLE public.tag_relationships ENABLE ROW LEVEL SECURITY;

  -- Create RLS policy for viewing relationships
  DROP POLICY IF EXISTS "Tag relationships are viewable by everyone" ON public.tag_relationships;
  CREATE POLICY "Tag relationships are viewable by everyone" 
  ON public.tag_relationships 
  FOR SELECT 
  USING (true);

  -- Create indexes for better performance
  CREATE INDEX IF NOT EXISTS idx_tag_relationships_tag1_id ON public.tag_relationships(tag1_id);
  CREATE INDEX IF NOT EXISTS idx_tag_relationships_tag2_id ON public.tag_relationships(tag2_id);
  CREATE INDEX IF NOT EXISTS idx_tag_relationships_similarity ON public.tag_relationships(similarity_score DESC);
END;
$$;

-- Check and enable RLS on any remaining tables without it
DO $$
DECLARE
    tbl_name TEXT;
BEGIN
    -- Loop through all tables in public schema that don't have RLS enabled
    FOR tbl_name IN 
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' 
        AND c.relkind = 'r'  -- Only regular tables
        AND c.relrowsecurity = false  -- RLS not enabled
        AND c.relname NOT LIKE 'wrappers_%'  -- Skip wrapper tables we can't modify
    LOOP
        BEGIN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl_name);
            RAISE NOTICE 'Enabled RLS on table: %', tbl_name;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'No permission to enable RLS on table: %', tbl_name;
        WHEN OTHERS THEN
            RAISE NOTICE 'Could not enable RLS on table: % - %', tbl_name, SQLERRM;
        END;
    END LOOP;
END $$;