-- Fix Security Warning: Update functions to have proper search_path settings
-- This addresses the function search path mutable warnings from the linter

-- Fix function: anonymize_location_data
CREATE OR REPLACE FUNCTION public.anonymize_location_data(lat numeric, lng numeric, precision_level text DEFAULT 'high')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Different levels of location anonymization
  CASE precision_level
    WHEN 'high' THEN
      -- Reduce precision to ~100m accuracy (3 decimal places)
      RETURN jsonb_build_object(
        'latitude', ROUND(lat::numeric, 3),
        'longitude', ROUND(lng::numeric, 3),
        'precision', 'neighborhood'
      );
    WHEN 'medium' THEN
      -- Reduce precision to ~1km accuracy (2 decimal places)
      RETURN jsonb_build_object(
        'latitude', ROUND(lat::numeric, 2),
        'longitude', ROUND(lng::numeric, 2),
        'precision', 'district'
      );
    WHEN 'low' THEN
      -- Reduce precision to ~10km accuracy (1 decimal place)
      RETURN jsonb_build_object(
        'latitude', ROUND(lat::numeric, 1),
        'longitude', ROUND(lng::numeric, 1),
        'precision', 'city_area'
      );
    ELSE
      -- Default to high anonymization
      RETURN jsonb_build_object(
        'latitude', ROUND(lat::numeric, 3),
        'longitude', ROUND(lng::numeric, 3),
        'precision', 'neighborhood'
      );
  END CASE;
END;
$$;

-- Fix function: auto_anonymize_old_checkins
CREATE OR REPLACE FUNCTION public.auto_anonymize_old_checkins()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Anonymize location data for old check-ins based on user preferences
  UPDATE public.venue_checkins
  SET 
    latitude = (public.anonymize_location_data(latitude, longitude, 'medium')->>'latitude')::numeric,
    longitude = (public.anonymize_location_data(latitude, longitude, 'medium')->>'longitude')::numeric,
    anonymized_at = now(),
    location_precision = 'anonymized'
  WHERE anonymized_at IS NULL 
    AND created_at < (now() - COALESCE(auto_anonymize_after, '24 hours'::interval))
    AND approximate_only = true;
    
  -- Log anonymization for audit
  PERFORM public.log_enhanced_security_event(
    'LOCATION_DATA_ANONYMIZED',
    NULL,
    jsonb_build_object(
      'records_processed', (SELECT COUNT(*) FROM public.venue_checkins WHERE anonymized_at = now()),
      'timestamp', now()
    ),
    'low'
  );
END;
$$;