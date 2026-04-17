-- Fix the remaining security definer functions with missing search paths

CREATE OR REPLACE FUNCTION public.update_group_post_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.group_posts 
    SET likes_count = likes_count + 1 
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.group_posts 
    SET likes_count = GREATEST(likes_count - 1, 0)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_group_comment_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.group_post_comments 
    SET likes_count = likes_count + 1 
    WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.group_post_comments 
    SET likes_count = GREATEST(likes_count - 1, 0)
    WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_group_post_comments_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.group_posts 
    SET comments_count = comments_count + 1 
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.group_posts 
    SET comments_count = GREATEST(comments_count - 1, 0)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_listing_views(listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.marketplace_listings 
  SET views_count = COALESCE(views_count, 0) + 1 
  WHERE id = listing_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_unified_tag_usage_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Update usage counts for unified tags
  UPDATE public.unified_tags 
  SET usage_count = (
    SELECT COUNT(*)
    FROM public.unified_tag_assignments 
    WHERE tag_id = unified_tags.id
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Check what table is missing RLS and enable it if possible
DO $$
DECLARE
    table_name TEXT;
    table_exists BOOLEAN;
BEGIN
    -- Check for common tables that might need RLS
    FOR table_name IN 
        SELECT unnest(ARRAY['messages', 'profiles', 'user_role_audit_log', 'security_events', 'wrappers_fdw_stats'])
    LOOP
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = table_name
        ) INTO table_exists;
        
        IF table_exists THEN
            -- Check if RLS is already enabled
            IF NOT EXISTS (
                SELECT 1 FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' 
                AND c.relname = table_name
                AND c.relrowsecurity = true
            ) THEN
                -- Try to enable RLS (skip if we don't have permission)
                BEGIN
                    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
                    RAISE NOTICE 'Enabled RLS on table: %', table_name;
                EXCEPTION WHEN insufficient_privilege THEN
                    RAISE NOTICE 'No permission to enable RLS on table: %', table_name;
                END;
            END IF;
        END IF;
    END LOOP;
END $$;