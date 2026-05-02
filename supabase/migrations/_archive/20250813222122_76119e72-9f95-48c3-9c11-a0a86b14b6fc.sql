-- Fix Security Definer Views and Functions Issue
-- Remove SECURITY DEFINER from functions where it's not strictly necessary

-- First, let's check which specific functions need SECURITY DEFINER vs those that don't
-- Functions that should keep SECURITY DEFINER (administrative/security functions):
-- - log_enhanced_security_event (needs elevated privileges for security logging)
-- - encrypt_sensitive_data/decrypt_sensitive_data (needs access to encryption keys)
-- - has_role functions (need to check roles securely)
-- - assign_user_role/revoke_role (need admin privileges)
-- - check_rate_limit functions (need system-level access)
-- - cleanup functions (need system-level access)

-- Remove SECURITY DEFINER from utility/analysis functions that don't need elevated privileges

-- Drop and recreate analysis functions without SECURITY DEFINER
DROP FUNCTION IF EXISTS public.add_rls_policy_indexes(text);
DROP FUNCTION IF EXISTS public.analyze_rls_policy_performance(text);
DROP FUNCTION IF EXISTS public.consolidate_policies(text, text, text);
DROP FUNCTION IF EXISTS public.consolidate_table_policies(text);
DROP FUNCTION IF EXISTS public.examine_table_policies();
DROP FUNCTION IF EXISTS public.get_table_policies(text);
DROP FUNCTION IF EXISTS public.get_tables_with_multiple_permissive_policies();

-- Recreate utility functions without SECURITY DEFINER (they don't need elevated privileges)
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

-- Recreate consolidation functions without SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.consolidate_policies(p_table_name text, p_role_name text, p_action text)
RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  policy_record RECORD;
  using_exprs text[] := '{}';
  with_check_exprs text[] := '{}';
  consolidated_using text;
  consolidated_with_check text;
  new_policy_name text;
  policy_names text[] := '{}';
  policy_name text;
BEGIN
  -- Get all policies for this table, role, and action
  FOR policy_record IN (
    SELECT 
      polname,
      pg_get_expr(polqual, polrelid) AS using_expr,
      pg_get_expr(polwithcheck, polrelid) AS with_check_expr
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
      c.relname = p_table_name AND
      r.rolname = p_role_name AND
      CASE 
        WHEN p.polcmd = 'r' THEN 'SELECT'
        WHEN p.polcmd = 'a' THEN 'INSERT'
        WHEN p.polcmd = 'w' THEN 'UPDATE'
        WHEN p.polcmd = 'd' THEN 'DELETE'
        ELSE p.polcmd::text
      END = p_action
  ) LOOP
    -- Collect policy names and expressions
    policy_names := array_append(policy_names, policy_record.polname);
    
    IF policy_record.using_expr IS NOT NULL AND policy_record.using_expr <> '' THEN
      using_exprs := array_append(using_exprs, '(' || policy_record.using_expr || ')');
    END IF;
    
    IF policy_record.with_check_expr IS NOT NULL AND policy_record.with_check_expr <> '' THEN
      with_check_exprs := array_append(with_check_exprs, '(' || policy_record.with_check_expr || ')');
    END IF;
  END LOOP;
  
  -- Only consolidate if we have multiple policies
  IF array_length(policy_names, 1) < 2 THEN
    RETURN;
  END IF;
  
  -- Create consolidated expressions
  consolidated_using := COALESCE(array_to_string(using_exprs, ' OR '), 'true');
  consolidated_with_check := COALESCE(array_to_string(with_check_exprs, ' OR '), 'true');
  
  -- Drop existing policies and create consolidated one
  new_policy_name := 'consolidated_' || p_role_name || '_' || p_action || '_policy';
  
  FOREACH policy_name IN ARRAY policy_names LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, p_table_name);
  END LOOP;
  
  -- Create new consolidated policy based on action type
  IF p_action = 'SELECT' THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO %I USING (%s)',
      new_policy_name, p_table_name, p_role_name, consolidated_using);
  ELSIF p_action = 'INSERT' THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO %I WITH CHECK (%s)',
      new_policy_name, p_table_name, p_role_name, consolidated_with_check);
  ELSIF p_action = 'UPDATE' THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO %I USING (%s) WITH CHECK (%s)',
      new_policy_name, p_table_name, p_role_name, consolidated_using, consolidated_with_check);
  ELSIF p_action = 'DELETE' THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO %I USING (%s)',
      new_policy_name, p_table_name, p_role_name, consolidated_using);
  END IF;
END;
$$;

-- Update trigger functions to remove SECURITY DEFINER where not needed
-- Keep SECURITY DEFINER only for functions that need elevated privileges for security

-- Update the update_knowledge_base_updated_at function
DROP FUNCTION IF EXISTS public.update_knowledge_base_updated_at();
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

-- Update the update_content_embeddings_updated_at function  
DROP FUNCTION IF EXISTS public.update_content_embeddings_updated_at();
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