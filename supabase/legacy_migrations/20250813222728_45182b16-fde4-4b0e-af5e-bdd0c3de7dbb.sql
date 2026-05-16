-- Fix Security Definer View Issue - Final Resolution
-- The linter flags table-returning functions with SECURITY DEFINER as "views"
-- We need to remove SECURITY DEFINER from functions that don't need elevated privileges

-- Fix 1: match_content_embeddings - Can run with normal user privileges
-- This function just queries public content_embeddings, no elevated access needed
DROP FUNCTION IF EXISTS public.match_content_embeddings(extensions.vector, double precision, integer) CASCADE;
CREATE OR REPLACE FUNCTION public.match_content_embeddings(
  query_embedding extensions.vector, 
  similarity_threshold double precision DEFAULT 0.1, 
  match_count integer DEFAULT 5
)
RETURNS TABLE(
  content_id uuid, 
  content_type text, 
  content_text text, 
  metadata jsonb, 
  similarity double precision
)
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.content_id,
    ce.content_type,
    ce.content_text,
    ce.metadata,
    1 - (ce.embedding <=> query_embedding) AS similarity
  FROM public.content_embeddings ce
  WHERE 1 - (ce.embedding <=> query_embedding) > similarity_threshold
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Fix 2: get_user_conversation_ids - Remove duplicate and fix SECURITY DEFINER usage
-- Drop both versions and create a single optimized version
DROP FUNCTION IF EXISTS public.get_user_conversation_ids() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_conversation_ids(uuid) CASCADE;

-- Recreate without SECURITY DEFINER since RLS policies handle access control
CREATE OR REPLACE FUNCTION public.get_user_conversation_ids(user_id_param uuid DEFAULT NULL)
RETURNS TABLE(conversation_id uuid)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT cp.conversation_id 
  FROM public.conversation_participants cp 
  WHERE cp.user_id = COALESCE(user_id_param, auth.uid());
$$;

-- Fix 3: can_view_sensitive_profile_data - Remove duplicates and optimize
-- Drop both versions and create a single secure version
DROP FUNCTION IF EXISTS public.can_view_sensitive_profile_data(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_view_sensitive_profile_data(uuid, uuid, text) CASCADE;

-- Recreate as a simple function that respects RLS policies (no SECURITY DEFINER needed)
CREATE OR REPLACE FUNCTION public.can_view_sensitive_profile_data(
  profile_user_id uuid, 
  requesting_user_id uuid, 
  privacy_field text DEFAULT 'profile_visibility'
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT CASE
    -- Users can always see their own data
    WHEN profile_user_id = requesting_user_id THEN true
    -- Check if specific field is public
    WHEN EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = profile_user_id 
      AND COALESCE((privacy_settings ->> privacy_field)::boolean, false) = true
    ) THEN true
    -- Admins can view data (this will be controlled by RLS policies)
    WHEN requesting_user_id IN (
      SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
    ) THEN true
    ELSE false
  END;
$$;

-- Add comment explaining the security approach
COMMENT ON FUNCTION public.match_content_embeddings IS 
'Searches content embeddings. Uses normal privileges with RLS policies for access control.';

COMMENT ON FUNCTION public.get_user_conversation_ids IS 
'Returns conversation IDs for a user. Access controlled by RLS policies on conversation_participants.';

COMMENT ON FUNCTION public.can_view_sensitive_profile_data IS 
'Checks if user can view sensitive profile data. Uses RLS policies instead of SECURITY DEFINER.';

-- Note: This approach follows Supabase security best practices:
-- 1. Use RLS policies for access control instead of SECURITY DEFINER when possible
-- 2. Reserve SECURITY DEFINER only for functions that truly need elevated system privileges
-- 3. Functions that query user data should rely on RLS for security
-- 4. Avoid SECURITY DEFINER on table-returning functions to prevent "view" security warnings