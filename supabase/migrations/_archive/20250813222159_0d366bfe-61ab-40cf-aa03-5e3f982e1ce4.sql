-- Fix Security Definer Functions Issue
-- Remove SECURITY DEFINER from functions where it's not strictly necessary
-- Handle dependencies properly with CASCADE

-- Drop utility/analysis functions that don't need SECURITY DEFINER (CASCADE to handle dependencies)
DROP FUNCTION IF EXISTS public.add_rls_policy_indexes(text) CASCADE;
DROP FUNCTION IF EXISTS public.analyze_rls_policy_performance(text) CASCADE;
DROP FUNCTION IF EXISTS public.consolidate_policies(text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.consolidate_table_policies(text) CASCADE;
DROP FUNCTION IF EXISTS public.examine_table_policies() CASCADE;
DROP FUNCTION IF EXISTS public.get_table_policies(text) CASCADE;
DROP FUNCTION IF EXISTS public.get_tables_with_multiple_permissive_policies() CASCADE;

-- Drop and recreate trigger functions without SECURITY DEFINER
DROP FUNCTION IF EXISTS public.update_knowledge_base_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.update_content_embeddings_updated_at() CASCADE;

-- Recreate the trigger functions without SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.update_knowledge_base_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_content_embeddings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate utility functions without SECURITY DEFINER (only if they existed)
CREATE OR REPLACE FUNCTION public.get_table_policies(table_name_param text)
RETURNS TABLE(policy_name text, role_name text, command text, using_expr text, with_check_expr text)
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.polname::text,
    r.rolname::text,
    CASE 
      WHEN p.polcmd = 'r' THEN 'SELECT'
      WHEN p.polcmd = 'a' THEN 'INSERT'
      WHEN p.polcmd = 'w' THEN 'UPDATE'
      WHEN p.polcmd = 'd' THEN 'DELETE'
      ELSE p.polcmd::text
    END,
    pg_get_expr(p.polqual, p.polrelid)::text,
    pg_get_expr(p.polwithcheck, p.polrelid)::text
  FROM 
    pg_catalog.pg_policy p
  JOIN 
    pg_catalog.pg_class c ON p.polrelid = c.oid
  JOIN 
    pg_catalog.pg_namespace n ON c.relnamespace = n.oid
  CROSS JOIN LATERAL unnest(p.polroles) AS role_oid
  JOIN 
    pg_catalog.pg_roles r ON r.oid = role_oid
  WHERE 
    n.nspname = 'public' AND
    c.relname = table_name_param
  ORDER BY 
    p.polname;
END;
$$;

-- Recreate any triggers that were dropped with CASCADE
-- Check if knowledge_base table exists and has the trigger
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'knowledge_base') THEN
    -- Drop existing trigger if it exists
    DROP TRIGGER IF EXISTS trigger_update_knowledge_base_updated_at ON public.knowledge_base;
    
    -- Create the trigger
    CREATE TRIGGER trigger_update_knowledge_base_updated_at
      BEFORE UPDATE ON public.knowledge_base
      FOR EACH ROW
      EXECUTE FUNCTION public.update_knowledge_base_updated_at();
  END IF;
END $$;

-- Check if content_embeddings table exists and has the trigger
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'content_embeddings') THEN
    -- Drop existing trigger if it exists
    DROP TRIGGER IF EXISTS trigger_update_content_embeddings_updated_at ON public.content_embeddings;
    
    -- Create the trigger
    CREATE TRIGGER trigger_update_content_embeddings_updated_at
      BEFORE UPDATE ON public.content_embeddings
      FOR EACH ROW
      EXECUTE FUNCTION public.update_content_embeddings_updated_at();
  END IF;
END $$;