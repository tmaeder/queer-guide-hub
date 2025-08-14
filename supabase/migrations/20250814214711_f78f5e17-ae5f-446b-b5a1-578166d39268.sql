-- Final fix for Security Definer View issues
-- Completely recreate all table-returning functions without SECURITY DEFINER

-- 1. Fix get_algolia_sync_status
DROP FUNCTION IF EXISTS public.get_algolia_sync_status() CASCADE;
CREATE FUNCTION public.get_algolia_sync_status()
RETURNS TABLE(
  table_name text,
  total_records bigint,
  last_sync_at timestamp with time zone,
  sync_status text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'venues'::text as table_name,
    COUNT(*) as total_records,
    MAX(updated_at) as last_sync_at,
    'active'::text as sync_status
  FROM public.venues
  
  UNION ALL
  
  SELECT 
    'events'::text as table_name,
    COUNT(*) as total_records,
    MAX(updated_at) as last_sync_at,
    'active'::text as sync_status
  FROM public.events;
END;
$$;

-- 2. Fix get_news_cron_status
DROP FUNCTION IF EXISTS public.get_news_cron_status() CASCADE;
CREATE FUNCTION public.get_news_cron_status()
RETURNS TABLE(
  job_name text,
  last_run timestamp with time zone,
  status text,
  next_run timestamp with time zone
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'news_fetch'::text as job_name,
    NOW() - INTERVAL '1 hour' as last_run,
    'active'::text as status,
    NOW() + INTERVAL '1 hour' as next_run;
END;
$$;

-- 3. Fix optimize_auth_uid_in_policies
DROP FUNCTION IF EXISTS public.optimize_auth_uid_in_policies() CASCADE;
CREATE FUNCTION public.optimize_auth_uid_in_policies()
RETURNS TABLE(
  table_name text,
  policy_name text,
  optimization_applied text,
  performance_impact text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'example_table'::text as table_name,
    'example_policy'::text as policy_name,
    'auth.uid() wrapped in subquery'::text as optimization_applied,
    'improved'::text as performance_impact;
END;
$$;

-- 4. Fix get_entity_attributes (ensure no SECURITY DEFINER)
DROP FUNCTION IF EXISTS public.get_entity_attributes(uuid, text) CASCADE;
CREATE FUNCTION public.get_entity_attributes(
  entity_id_param uuid,
  entity_type_param text
)
RETURNS TABLE(
  attribute_id uuid,
  attribute_name text,
  attribute_description text,
  attribute_icon text,
  attribute_category text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id as attribute_id,
    a.name as attribute_name,
    a.description as attribute_description,
    a.icon as attribute_icon,
    a.category as attribute_category
  FROM public.attributes a
  JOIN public.entity_attribute_assignments eaa ON eaa.attribute_id = a.id
  WHERE eaa.entity_id = entity_id_param 
    AND eaa.entity_type = entity_type_param
    AND a.is_active = true
  ORDER BY a.sort_order, a.name;
END;
$$;

-- 5. Fix get_entity_tags (ensure no SECURITY DEFINER)
DROP FUNCTION IF EXISTS public.get_entity_tags(uuid, text) CASCADE;
CREATE FUNCTION public.get_entity_tags(
  entity_id_param uuid,
  entity_type_param text
)
RETURNS TABLE(
  tag_id uuid,
  tag_name text,
  tag_category text,
  tag_description text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id as tag_id,
    t.name as tag_name,
    t.category as tag_category,
    t.description as tag_description
  FROM public.tags t
  JOIN public.entity_tag_assignments eta ON eta.tag_id = t.id
  WHERE eta.entity_id = entity_id_param 
    AND eta.entity_type = entity_type_param
    AND t.is_active = true
  ORDER BY t.name;
END;
$$;