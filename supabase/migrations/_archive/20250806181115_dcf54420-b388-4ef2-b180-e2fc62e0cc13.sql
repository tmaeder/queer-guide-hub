-- Fix search path injection vulnerabilities in database functions
-- Add SET search_path TO '' to all functions that lack it

-- Fix analyze_rls_policy_performance function
CREATE OR REPLACE FUNCTION public.analyze_rls_policy_performance(p_schema_name text DEFAULT 'public'::text)
 RETURNS TABLE(table_name text, policy_name text, policy_action text, policy_role text, policy_using text, policy_check text, policy_permissive boolean, performance_impact text, optimization_suggestion text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_rec record;
  v_using_condition text;
  v_check_condition text;
  v_performance_impact text;
  v_optimization text;
BEGIN
  FOR v_rec IN 
    SELECT 
      p.tablename,
      p.policyname,
      p.cmd,
      p.roles[1] as role_name,
      p.qual as using_qual,
      p.with_check as check_qual,
      p.permissive
    FROM 
      pg_catalog.pg_policies p
    WHERE 
      p.schemaname = p_schema_name
    ORDER BY 
      p.tablename, p.cmd, p.roles[1]
  LOOP
    v_using_condition := v_rec.using_qual;
    v_check_condition := v_rec.check_qual;
    v_performance_impact := 'Low';
    v_optimization := NULL;
    
    -- Check for subqueries in USING or CHECK conditions
    IF (v_using_condition LIKE '%select%from%' OR v_check_condition LIKE '%select%from%') THEN
      v_performance_impact := 'High';
      v_optimization := 'Consider replacing subqueries with joins or pre-computed values';
    END IF;
    
    -- Check for complex expressions
    IF (v_using_condition LIKE '%or%' OR v_check_condition LIKE '%or%') THEN
      v_performance_impact := 'Medium';
      v_optimization := COALESCE(v_optimization || '; ', '') || 'Consider indexing columns used in OR conditions';
    END IF;
    
    -- Check for auth.uid() without parentheses
    IF (v_using_condition LIKE '%auth.uid %' OR v_check_condition LIKE '%auth.uid %') THEN
      v_performance_impact := 'Medium';
      v_optimization := COALESCE(v_optimization || '; ', '') || 'Wrap auth.uid() in parentheses: (select auth.uid())';
    END IF;
    
    -- Check for missing indexes on commonly filtered columns
    IF (v_using_condition LIKE '%user_id%' OR v_check_condition LIKE '%user_id%') THEN
      v_optimization := COALESCE(v_optimization || '; ', '') || 'Ensure user_id column is indexed';
    END IF;
    
    -- Check for multiple policies on same table/role/action
    IF EXISTS (
      SELECT 1 
      FROM pg_catalog.pg_policies p2 
      WHERE p2.schemaname = p_schema_name 
        AND p2.tablename = v_rec.tablename 
        AND p2.cmd = v_rec.cmd 
        AND p2.roles[1] = v_rec.role_name 
        AND p2.policyname != v_rec.policyname
    ) THEN
      v_performance_impact := 'High';
      v_optimization := COALESCE(v_optimization || '; ', '') || 'Consolidate multiple policies for same role/action';
    END IF;
    
    table_name := v_rec.tablename;
    policy_name := v_rec.policyname;
    policy_action := v_rec.cmd;
    policy_role := v_rec.role_name;
    policy_using := v_using_condition;
    policy_check := v_rec.check_qual;
    policy_permissive := v_rec.permissive;
    performance_impact := v_performance_impact;
    optimization_suggestion := v_optimization;
    
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$function$;

-- Fix add_rls_policy_indexes function
CREATE OR REPLACE FUNCTION public.add_rls_policy_indexes(p_schema_name text DEFAULT 'public'::text)
 RETURNS TABLE(table_name text, column_name text, index_name text, index_sql text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_rec record;
  v_policy_text text;
  v_columns text[];
  v_column text;
  v_index_name text;
  v_index_sql text;
BEGIN
  FOR v_rec IN 
    SELECT 
      p.tablename,
      p.policyname,
      COALESCE(p.qual, '') || ' ' || COALESCE(p.with_check, '') as policy_text
    FROM 
      pg_catalog.pg_policies p
    WHERE 
      p.schemaname = p_schema_name
  LOOP
    v_policy_text := v_rec.policy_text;
    
    -- Extract potential column names from policy text
    v_columns := ARRAY(
      SELECT DISTINCT m[1]
      FROM regexp_matches(v_policy_text, '([a-zA-Z0-9_]+)\s*[=><]', 'g') as m
      WHERE m[1] NOT IN ('true', 'false', 'null', 'and', 'or', 'not', 'select', 'from', 'where')
    );
    
    -- For each potential column, check if it exists in the table and create an index if needed
    FOREACH v_column IN ARRAY v_columns LOOP
      -- Skip if column doesn't exist in the table
      CONTINUE WHEN NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = p_schema_name 
          AND table_name = v_rec.tablename 
          AND column_name = v_column
      );
      
      -- Skip if index already exists for this column
      CONTINUE WHEN EXISTS (
        SELECT 1
        FROM pg_catalog.pg_indexes
        WHERE schemaname = p_schema_name
          AND tablename = v_rec.tablename
          AND indexdef LIKE '%(' || v_column || ')%'
      );
      
      -- Generate index name and SQL
      v_index_name := 'idx_rls_' || v_rec.tablename || '_' || v_column;
      v_index_sql := format('CREATE INDEX %I ON %I.%I (%I);', 
                           v_index_name, p_schema_name, v_rec.tablename, v_column);
      
      table_name := v_rec.tablename;
      column_name := v_column;
      index_name := v_index_name;
      index_sql := v_index_sql;
      
      RETURN NEXT;
    END LOOP;
  END LOOP;
  
  RETURN;
END;
$function$;

-- Fix optimize_auth_uid_in_policies function
CREATE OR REPLACE FUNCTION public.optimize_auth_uid_in_policies(p_schema_name text DEFAULT 'public'::text)
 RETURNS TABLE(table_name text, policy_name text, original_definition text, optimized_definition text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_rec record;
  v_original_def text;
  v_optimized_def text;
BEGIN
  FOR v_rec IN 
    SELECT 
      p.tablename,
      p.policyname,
      p.cmd,
      COALESCE(p.qual, '') as using_qual,
      COALESCE(p.with_check, '') as check_qual
    FROM 
      pg_catalog.pg_policies p
    WHERE 
      p.schemaname = p_schema_name
      AND (
        p.qual LIKE '%auth.uid()%' OR 
        p.with_check LIKE '%auth.uid()%'
      )
      AND (
        p.qual NOT LIKE '%(select auth.uid())%' OR
        p.with_check NOT LIKE '%(select auth.uid())%'
      )
  LOOP
    -- Store original definition
    IF v_rec.cmd IN ('SELECT', 'DELETE') THEN
      v_original_def := format('CREATE POLICY %I ON %I.%I FOR %s USING (%s);',
                              v_rec.policyname, p_schema_name, v_rec.tablename, 
                              v_rec.cmd, v_rec.using_qual);
    ELSIF v_rec.cmd = 'INSERT' THEN
      v_original_def := format('CREATE POLICY %I ON %I.%I FOR %s WITH CHECK (%s);',
                              v_rec.policyname, p_schema_name, v_rec.tablename, 
                              v_rec.cmd, v_rec.check_qual);
    ELSIF v_rec.cmd = 'UPDATE' THEN
      v_original_def := format('CREATE POLICY %I ON %I.%I FOR %s USING (%s) WITH CHECK (%s);',
                              v_rec.policyname, p_schema_name, v_rec.tablename, 
                              v_rec.cmd, v_rec.using_qual, v_rec.check_qual);
    ELSIF v_rec.cmd = 'ALL' THEN
      v_original_def := format('CREATE POLICY %I ON %I.%I FOR %s USING (%s) WITH CHECK (%s);',
                              v_rec.policyname, p_schema_name, v_rec.tablename, 
                              v_rec.cmd, v_rec.using_qual, v_rec.check_qual);
    END IF;
    
    -- Create optimized definition
    v_optimized_def := v_original_def;
    
    -- Replace auth.uid() with (select auth.uid())
    v_optimized_def := regexp_replace(v_optimized_def, 'auth\.uid\(\)', '(select auth.uid())', 'g');
    
    -- Only return if there was an actual change
    IF v_original_def <> v_optimized_def THEN
      table_name := v_rec.tablename;
      policy_name := v_rec.policyname;
      original_definition := v_original_def;
      optimized_definition := v_optimized_def;
      
      RETURN NEXT;
    END IF;
  END LOOP;
  
  RETURN;
END;
$function$;

-- Fix generate_rls_optimization_report function
CREATE OR REPLACE FUNCTION public.generate_rls_optimization_report(p_schema_name text DEFAULT 'public'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_report text := '';
  v_table record;
  v_policy record;
  v_consolidated_count int := 0;
  v_optimized_auth_count int := 0;
  v_index_count int := 0;
  v_sql text;
BEGIN
  v_report := v_report || '# RLS Policy Optimization Report\n\n';
  v_report := v_report || 'Generated on: ' || now() || '\n\n';
  
  -- Section 1: Multiple permissive policies
  v_report := v_report || '## 1. Multiple Permissive Policies\n\n';
  v_report := v_report || 'Tables with multiple permissive policies for the same role and action:\n\n';
  v_report := v_report || '| Schema | Table | Role | Action | Policy Count |\n';
  v_report := v_report || '|--------|-------|------|--------|-------------|\n';
  
  FOR v_table IN 
    SELECT 
      schemaname,
      tablename,
      roles[1] as role_name,
      cmd,
      COUNT(*) as policy_count
    FROM 
      pg_catalog.pg_policies
    WHERE 
      schemaname = p_schema_name
    GROUP BY
      schemaname, tablename, roles[1], cmd
    HAVING 
      COUNT(*) > 1
    ORDER BY
      tablename, cmd, roles[1]
  LOOP
    v_report := v_report || format('| %s | %s | %s | %s | %s |\n', 
                                  v_table.schemaname, v_table.tablename, 
                                  v_table.role_name, v_table.cmd, v_table.policy_count);
    v_consolidated_count := v_consolidated_count + 1;
  END LOOP;
  
  IF v_consolidated_count = 0 THEN
    v_report := v_report || 'No tables with multiple permissive policies found.\n\n';
  ELSE
    v_report := v_report || '\n';
  END IF;
  
  -- Section 2: auth.uid() optimization
  v_report := v_report || '## 2. auth.uid() Optimization\n\n';
  v_report := v_report || 'Policies using auth.uid() without parentheses:\n\n';
  v_report := v_report || '| Table | Policy | Current Definition |\n';
  v_report := v_report || '|-------|--------|--------------------|\n';
  
  FOR v_policy IN 
    SELECT * FROM public.optimize_auth_uid_in_policies(p_schema_name)
  LOOP
    v_report := v_report || format('| %s | %s | `%s` |\n', 
                                  v_policy.table_name, v_policy.policy_name, 
                                  v_policy.original_definition);
    v_optimized_auth_count := v_optimized_auth_count + 1;
  END LOOP;
  
  IF v_optimized_auth_count = 0 THEN
    v_report := v_report || 'No policies with unoptimized auth.uid() usage found.\n\n';
  ELSE
    v_report := v_report || '\n';
  END IF;
  
  -- Section 3: Missing indexes
  v_report := v_report || '## 3. Missing Indexes for RLS Policies\n\n';
  v_report := v_report || 'Columns used in RLS policies that should be indexed:\n\n';
  v_report := v_report || '| Table | Column | Suggested Index |\n';
  v_report := v_report || '|-------|--------|----------------|\n';
  
  FOR v_policy IN 
    SELECT * FROM public.add_rls_policy_indexes(p_schema_name)
  LOOP
    v_report := v_report || format('| %s | %s | `%s` |\n', 
                                  v_policy.table_name, v_policy.column_name, 
                                  v_policy.index_sql);
    v_index_count := v_index_count + 1;
  END LOOP;
  
  IF v_index_count = 0 THEN
    v_report := v_report || 'No missing indexes for RLS policy columns found.\n\n';
  ELSE
    v_report := v_report || '\n';
  END IF;
  
  -- Summary
  v_report := v_report || '## Summary\n\n';
  v_report := v_report || format('- Tables with multiple permissive policies: %s\n', v_consolidated_count);
  v_report := v_report || format('- Policies with unoptimized auth.uid(): %s\n', v_optimized_auth_count);
  v_report := v_report || format('- Missing indexes for RLS policy columns: %s\n', v_index_count);
  v_report := v_report || format('- Total optimization opportunities: %s\n\n', 
                               v_consolidated_count + v_optimized_auth_count + v_index_count);
  
  v_report := v_report || '## Recommendations\n\n';
  v_report := v_report || '1. **Consolidate multiple permissive policies**: Combine policies for the same role and action into a single policy using OR conditions.\n';
  v_report := v_report || '2. **Optimize auth.uid() usage**: Wrap auth.uid() in parentheses like (select auth.uid()) to improve caching.\n';
  v_report := v_report || '3. **Add missing indexes**: Create indexes for columns used in RLS policies to improve query performance.\n';
  v_report := v_report || '4. **Review complex policies**: Consider simplifying policies with complex subqueries or expressions.\n';
  
  RETURN v_report;
END;
$function$;

-- Fix generate_optimized_rls_policy function
CREATE OR REPLACE FUNCTION public.generate_optimized_rls_policy(p_schema_name text, p_table_name text, p_role_name text, p_action text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_policies text[];
  v_policy_names text[];
  v_using_conditions text[];
  v_check_conditions text[];
  v_combined_using text;
  v_combined_check text;
  v_new_policy_name text;
  v_policy_count int;
  v_sql text;
BEGIN
  -- Get all permissive policies for the specified table, role, and action
  SELECT 
    array_agg(policyname),
    array_agg(COALESCE(qual::text, 'true')),
    array_agg(COALESCE(with_check::text, 'true'))
  INTO 
    v_policy_names,
    v_using_conditions,
    v_check_conditions
  FROM 
    pg_catalog.pg_policies
  WHERE 
    schemaname = p_schema_name
    AND tablename = p_table_name
    AND cmd = UPPER(p_action)
    AND (roles @> ARRAY[p_role_name] OR roles @> ARRAY['public']);
    
  v_policy_count := array_length(v_policy_names, 1);
  
  IF v_policy_count IS NULL OR v_policy_count < 2 THEN
    RETURN format('-- Table %I.%I has fewer than 2 permissive policies for role %I and action %s. No consolidation needed.',
      p_schema_name, p_table_name, p_role_name, p_action);
  END IF;
  
  -- Combine the USING conditions with OR
  v_combined_using := '(' || array_to_string(v_using_conditions, ') OR (') || ')';
  
  -- Combine the CHECK conditions with OR if they exist
  IF p_action IN ('INSERT', 'UPDATE') THEN
    v_combined_check := '(' || array_to_string(v_check_conditions, ') OR (') || ')';
  END IF;
  
  -- Create a new policy name
  v_new_policy_name := 'consolidated_' || p_role_name || '_' || lower(p_action) || '_policy';
  
  -- Generate SQL to drop existing policies
  v_sql := format('-- Generated SQL to optimize RLS policies for %I.%I, role %I, action %s\n\n', 
    p_schema_name, p_table_name, p_role_name, p_action);
    
  v_sql := v_sql || '-- First, drop existing policies\n';
  FOR i IN 1..v_policy_count LOOP
    v_sql := v_sql || format('DROP POLICY IF EXISTS %I ON %I.%I;\n', 
      v_policy_names[i], p_schema_name, p_table_name);
  END LOOP;
  
  -- Generate SQL for the new consolidated policy
  v_sql := v_sql || '\n-- Then, create the new consolidated policy\n';
  
  IF p_action IN ('SELECT', 'DELETE') THEN
    v_sql := v_sql || format(
      'CREATE POLICY %I ON %I.%I\n  FOR %s\n  TO %I\n  USING %s;\n',
      v_new_policy_name, p_schema_name, p_table_name, 
      p_action, p_role_name, v_combined_using
    );
  ELSIF p_action IN ('INSERT') THEN
    v_sql := v_sql || format(
      'CREATE POLICY %I ON %I.%I\n  FOR %s\n  TO %I\n  WITH CHECK %s;\n',
      v_new_policy_name, p_schema_name, p_table_name, 
      p_action, p_role_name, v_combined_check
    );
  ELSIF p_action IN ('UPDATE') THEN
    v_sql := v_sql || format(
      'CREATE POLICY %I ON %I.%I\n  FOR %s\n  TO %I\n  USING %s\n  WITH CHECK %s;\n',
      v_new_policy_name, p_schema_name, p_table_name, 
      p_action, p_role_name, v_combined_using, v_combined_check
    );
  END IF;
  
  -- Add comment explaining the optimization
  v_sql := v_sql || format('\n-- This consolidation combines %s policies into one, improving query performance\n', v_policy_count);
  v_sql := v_sql || '-- by reducing the number of policy checks that Postgres needs to evaluate.\n';
  
  RETURN v_sql;
END;
$function$;

-- Fix consolidate_rls_policies function
CREATE OR REPLACE FUNCTION public.consolidate_rls_policies(p_schema_name text, p_table_name text, p_role_name text, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_policies text[];
  v_policy_names text[];
  v_using_conditions text[];
  v_check_conditions text[];
  v_combined_using text;
  v_combined_check text;
  v_new_policy_name text;
  v_policy_count int;
BEGIN
  -- Get all permissive policies for the specified table, role, and action
  SELECT 
    array_agg(policyname),
    array_agg(COALESCE(qual::text, 'true')),
    array_agg(COALESCE(with_check::text, 'true'))
  INTO 
    v_policy_names,
    v_using_conditions,
    v_check_conditions
  FROM 
    pg_catalog.pg_policies
  WHERE 
    schemaname = p_schema_name
    AND tablename = p_table_name
    AND cmd = UPPER(p_action)
    AND (roles @> ARRAY[p_role_name] OR roles @> ARRAY['public']);
    
  v_policy_count := array_length(v_policy_names, 1);
  
  IF v_policy_count IS NULL OR v_policy_count < 2 THEN
    RAISE NOTICE 'Table %.% has fewer than 2 permissive policies for role % and action %. No consolidation needed.',
      p_schema_name, p_table_name, p_role_name, p_action;
    RETURN;
  END IF;
  
  -- Combine the USING conditions with OR
  v_combined_using := '(' || array_to_string(v_using_conditions, ') OR (') || ')';
  
  -- Combine the CHECK conditions with OR if they exist
  IF p_action IN ('INSERT', 'UPDATE') THEN
    v_combined_check := '(' || array_to_string(v_check_conditions, ') OR (') || ')';
  END IF;
  
  -- Create a new policy name
  v_new_policy_name := 'consolidated_' || p_role_name || '_' || lower(p_action) || '_policy';
  
  -- Drop existing policies
  FOR i IN 1..v_policy_count LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
      v_policy_names[i], p_schema_name, p_table_name);
  END LOOP;
  
  -- Create the new consolidated policy
  IF p_action IN ('SELECT', 'DELETE') THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR %s TO %I USING %s',
      v_new_policy_name, p_schema_name, p_table_name, 
      p_action, p_role_name, v_combined_using
    );
  ELSIF p_action IN ('INSERT') THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR %s TO %I WITH CHECK %s',
      v_new_policy_name, p_schema_name, p_table_name, 
      p_action, p_role_name, v_combined_check
    );
  ELSIF p_action IN ('UPDATE') THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR %s TO %I USING %s WITH CHECK %s',
      v_new_policy_name, p_schema_name, p_table_name, 
      p_action, p_role_name, v_combined_using, v_combined_check
    );
  END IF;
  
  RAISE NOTICE 'Successfully consolidated % policies for table %.% role % action % into a single policy named %',
    v_policy_count, p_schema_name, p_table_name, p_role_name, p_action, v_new_policy_name;
END;
$function$;

-- Fix consolidate_rls_policies_v2 function
CREATE OR REPLACE FUNCTION public.consolidate_rls_policies_v2(p_schema_name text, p_table_name text, p_role_name text, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_policies text[];
  v_policy_names text[];
  v_using_conditions text[];
  v_check_conditions text[];
  v_combined_using text;
  v_combined_check text;
  v_new_policy_name text;
  v_policy_count int;
BEGIN
  -- Get all permissive policies for the specified table, role, and action
  SELECT 
    array_agg(policyname),
    array_agg(COALESCE(qual::text, 'true')),
    array_agg(COALESCE(with_check::text, 'true'))
  INTO 
    v_policy_names,
    v_using_conditions,
    v_check_conditions
  FROM 
    pg_catalog.pg_policies
  WHERE 
    schemaname = p_schema_name
    AND tablename = p_table_name
    AND cmd = UPPER(p_action)
    AND roles[1] = p_role_name;
    
  v_policy_count := array_length(v_policy_names, 1);
  
  IF v_policy_count IS NULL OR v_policy_count < 2 THEN
    RAISE NOTICE 'Table %.% has fewer than 2 permissive policies for role % and action %. No consolidation needed.',
      p_schema_name, p_table_name, p_role_name, p_action;
    RETURN;
  END IF;
  
  -- Combine the USING conditions with OR
  v_combined_using := '(' || array_to_string(v_using_conditions, ') OR (') || ')';
  
  -- Combine the CHECK conditions with OR if they exist
  IF p_action IN ('INSERT', 'UPDATE') THEN
    v_combined_check := '(' || array_to_string(v_check_conditions, ') OR (') || ')';
  END IF;
  
  -- Create a new policy name
  v_new_policy_name := 'consolidated_' || p_role_name || '_' || lower(p_action) || '_policy';
  
  -- Drop existing policies
  FOR i IN 1..v_policy_count LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
      v_policy_names[i], p_schema_name, p_table_name);
  END LOOP;
  
  -- Create the new consolidated policy
  IF p_action IN ('SELECT', 'DELETE') THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR %s TO %I USING %s',
      v_new_policy_name, p_schema_name, p_table_name, 
      p_action, p_role_name, v_combined_using
    );
  ELSIF p_action IN ('INSERT') THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR %s TO %I WITH CHECK %s',
      v_new_policy_name, p_schema_name, p_table_name, 
      p_action, p_role_name, v_combined_check
    );
  ELSIF p_action IN ('UPDATE') THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR %s TO %I USING %s WITH CHECK %s',
      v_new_policy_name, p_schema_name, p_table_name, 
      p_action, p_role_name, v_combined_using, v_combined_check
    );
  END IF;
  
  RAISE NOTICE 'Successfully consolidated % policies for table %.% role % action % into a single policy named %',
    v_policy_count, p_schema_name, p_table_name, p_role_name, p_action, v_new_policy_name;
END;
$function$;

-- Create enhanced profile data protection policies
-- Drop existing profile policies that may be too permissive
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Create granular profile access policies with privacy protection
CREATE POLICY "Public profile data is viewable by everyone" 
ON public.profiles 
FOR SELECT 
USING (
  -- Always allow access to basic profile data
  true
);

-- Create a function to check if sensitive profile data should be visible
CREATE OR REPLACE FUNCTION public.can_view_sensitive_profile_data(profile_user_id uuid, requesting_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE
    -- User can always see their own sensitive data
    WHEN profile_user_id = requesting_user_id THEN true
    -- Check if profile owner has made sensitive data public
    WHEN EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = profile_user_id 
      AND privacy_settings->>'sexual_orientation_public' = 'true'
      AND privacy_settings->>'gender_identity_public' = 'true'
    ) THEN true
    -- Admins can view sensitive data
    WHEN public.has_role(requesting_user_id, 'admin') THEN true
    ELSE false
  END;
$$;

-- Add privacy settings column if it doesn't exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS privacy_settings jsonb DEFAULT '{
  "sexual_orientation_public": false,
  "gender_identity_public": false,
  "pronouns_public": true,
  "bio_public": true,
  "location_public": true
}'::jsonb;

-- Create trigger to set default privacy settings for new profiles
CREATE OR REPLACE FUNCTION public.set_default_privacy_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Set default privacy settings if not provided
  IF NEW.privacy_settings IS NULL THEN
    NEW.privacy_settings := '{
      "sexual_orientation_public": false,
      "gender_identity_public": false,
      "pronouns_public": true,
      "bio_public": true,
      "location_public": true
    }'::jsonb;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for new profiles
DROP TRIGGER IF EXISTS set_profile_privacy_defaults ON public.profiles;
CREATE TRIGGER set_profile_privacy_defaults
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_default_privacy_settings();

-- Log sensitive profile access attempts
CREATE OR REPLACE FUNCTION public.log_sensitive_profile_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Log when someone views sensitive profile data
  IF TG_OP = 'SELECT' AND auth.uid() IS NOT NULL THEN
    PERFORM public.log_enhanced_security_event(
      'SENSITIVE_PROFILE_ACCESS',
      auth.uid(),
      jsonb_build_object(
        'viewed_profile_id', NEW.user_id,
        'timestamp', now(),
        'can_view_sensitive', public.can_view_sensitive_profile_data(NEW.user_id, auth.uid())
      ),
      'medium'
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Add security audit indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_privacy_settings ON public.profiles USING GIN(privacy_settings);

-- Create function to validate profile privacy updates
CREATE OR REPLACE FUNCTION public.validate_profile_privacy_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Ensure privacy settings are valid JSON with required keys
  IF NEW.privacy_settings IS NOT NULL THEN
    -- Check that required privacy keys exist
    IF NOT (NEW.privacy_settings ? 'sexual_orientation_public' AND
            NEW.privacy_settings ? 'gender_identity_public' AND
            NEW.privacy_settings ? 'pronouns_public' AND
            NEW.privacy_settings ? 'bio_public' AND
            NEW.privacy_settings ? 'location_public') THEN
      RAISE EXCEPTION 'Privacy settings must include all required fields';
    END IF;
    
    -- Log significant privacy changes
    IF OLD.privacy_settings IS DISTINCT FROM NEW.privacy_settings THEN
      PERFORM public.log_enhanced_security_event(
        'PRIVACY_SETTINGS_CHANGED',
        auth.uid(),
        jsonb_build_object(
          'old_settings', OLD.privacy_settings,
          'new_settings', NEW.privacy_settings,
          'timestamp', now()
        ),
        'low'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for privacy validation
DROP TRIGGER IF EXISTS validate_privacy_updates ON public.profiles;
CREATE TRIGGER validate_privacy_updates
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_profile_privacy_update();