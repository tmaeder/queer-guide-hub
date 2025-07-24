-- Fix security warnings by adding proper search_path to functions

-- Fix get_entity_tags function
CREATE OR REPLACE FUNCTION public.get_entity_tags(entity_id_param UUID, entity_type_param TEXT)
RETURNS TABLE(
  tag_id UUID,
  tag_name TEXT,
  tag_description TEXT,
  tag_color TEXT,
  category_name TEXT
) 
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    ut.id,
    ut.name,
    ut.description,
    ut.color,
    tc.name as category_name
  FROM public.unified_tag_assignments uta
  JOIN public.unified_tags ut ON uta.tag_id = ut.id
  LEFT JOIN public.tag_categories tc ON ut.category_id = tc.id
  WHERE uta.entity_id = entity_id_param 
    AND uta.entity_type = entity_type_param;
$$;

-- Fix get_entity_attributes function
CREATE OR REPLACE FUNCTION public.get_entity_attributes(entity_id_param UUID, entity_type_param TEXT)
RETURNS TABLE(
  attribute_id UUID,
  attribute_name TEXT,
  attribute_description TEXT,
  attribute_icon TEXT,
  attribute_type TEXT,
  attribute_category TEXT
) 
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    a.id,
    a.name,
    a.description,
    a.icon,
    a.type,
    a.category
  FROM public.entity_attribute_assignments eaa
  JOIN public.attributes a ON eaa.attribute_id = a.id
  WHERE eaa.entity_id = entity_id_param 
    AND eaa.entity_type = entity_type_param
    AND a.is_active = true;
$$;