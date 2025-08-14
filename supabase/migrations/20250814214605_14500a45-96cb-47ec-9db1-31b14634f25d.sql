-- Fix remaining Security Definer View issues by removing all versions
-- Drop all versions of get_entity_attributes and get_entity_tags functions

-- Drop all versions of get_entity_attributes function
DROP FUNCTION IF EXISTS public.get_entity_attributes(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_entity_attributes(text, uuid) CASCADE;

-- Drop all versions of get_entity_tags function  
DROP FUNCTION IF EXISTS public.get_entity_tags(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_entity_tags(text, uuid) CASCADE;

-- Recreate get_entity_attributes function without SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.get_entity_attributes(
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
SET search_path TO ''
AS $$
BEGIN
  -- This function can rely on RLS policies for access control
  -- No SECURITY DEFINER needed as it only reads public data
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

-- Recreate get_entity_tags function without SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.get_entity_tags(
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
SET search_path TO ''
AS $$
BEGIN
  -- This function can rely on RLS policies for access control
  -- No SECURITY DEFINER needed as it only reads public data
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

-- Add comments explaining the security approach
COMMENT ON FUNCTION public.get_entity_attributes IS 
'Returns attributes for an entity. Access controlled by RLS policies on underlying tables rather than SECURITY DEFINER.';

COMMENT ON FUNCTION public.get_entity_tags IS 
'Returns tags for an entity. Access controlled by RLS policies on underlying tables rather than SECURITY DEFINER.';