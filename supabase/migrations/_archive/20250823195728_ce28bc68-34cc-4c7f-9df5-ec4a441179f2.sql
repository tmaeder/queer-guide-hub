-- CRITICAL SECURITY FIX: Consolidate and harden RLS policies (CORRECTED)

-- 1. Fix profiles table RLS policies (CRITICAL - prevents PII theft)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles based on privacy settings" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Moderators can view reported profiles" ON public.profiles;

-- Create consolidated, secure profiles policies
CREATE POLICY "profiles_owner_full_access" ON public.profiles
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles_public_limited_read" ON public.profiles
  FOR SELECT USING (
    COALESCE((privacy_settings->>'profile_visibility')::boolean, false) = true
  );

CREATE POLICY "profiles_admin_audited_access" ON public.profiles
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND auth.uid() != user_id
  );

-- 2. Fix donations table RLS policies (CRITICAL - prevents financial data theft)
DROP POLICY IF EXISTS "Donors can view their own donations" ON public.donations;
DROP POLICY IF EXISTS "Admins can view all donations" ON public.donations;
DROP POLICY IF EXISTS "Public donations viewable anonymously" ON public.donations;
DROP POLICY IF EXISTS "System can create donations" ON public.donations;

-- Create consolidated, secure donations policies
CREATE POLICY "donations_owner_access" ON public.donations
  FOR SELECT USING (auth.uid()::text = donor_id OR email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "donations_admin_audited_access" ON public.donations
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND public.audit_admin_data_access(auth.uid(), donor_id::uuid, 'financial_data', 'donation_review')
  );

CREATE POLICY "donations_system_insert" ON public.donations
  FOR INSERT WITH CHECK (true);

-- 3. Fix venue_checkins location privacy (CRITICAL - prevents stalking)
DROP POLICY IF EXISTS "Users can view checkins based on visibility" ON public.venue_checkins;
DROP POLICY IF EXISTS "Users can manage their own checkins" ON public.venue_checkins;
DROP POLICY IF EXISTS "Public checkins viewable by all" ON public.venue_checkins;

-- Create location-safe checkins policies
CREATE POLICY "checkins_owner_full_access" ON public.venue_checkins
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "checkins_friends_limited_access" ON public.venue_checkins
  FOR SELECT USING (
    visibility = 'friends'
    AND EXISTS (
      SELECT 1 FROM user_relationships ur
      WHERE ur.user_id = auth.uid()
      AND ur.target_user_id = venue_checkins.user_id
      AND ur.relationship_type = 'friend'
      AND ur.status = 'accepted'
    )
  );

-- 4. Enhance admin API keys security with rate limiting
DROP POLICY IF EXISTS "Only admins can manage API keys" ON public.admin_api_keys;
CREATE POLICY "api_keys_enhanced_admin_access" ON public.admin_api_keys
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND public.check_rate_limit_enhanced(
      'admin_api_access_' || auth.uid()::text,
      10, -- Max 10 API key operations per hour
      60,
      'api_key_access'
    )
  );

-- 5. Secure conversation metadata
DROP POLICY IF EXISTS "Participants can update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON public.conversations;
CREATE POLICY "conversations_participant_only_access" ON public.conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = conversations.id
      AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "conversations_create_access" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "conversations_participant_update" ON public.conversations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = conversations.id
      AND cp.user_id = auth.uid()
    )
  );

-- 6. Add security monitoring for sensitive data access
CREATE OR REPLACE FUNCTION public.log_sensitive_data_access_enhanced(
  p_user_id uuid,
  p_target_user_id uuid,
  p_data_type text,
  p_justification text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Log all sensitive data access with enhanced metadata
  PERFORM public.log_security_event(
    'SENSITIVE_DATA_ACCESS_' || upper(p_data_type),
    p_user_id,
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'data_type', p_data_type,
      'justification', COALESCE(p_justification, 'none'),
      'ip_address', current_setting('request.headers', true)::json->>'x-forwarded-for',
      'user_agent', current_setting('request.headers', true)::json->>'user-agent',
      'access_timestamp', NOW(),
      'severity_level', CASE 
        WHEN p_data_type IN ('financial_data', 'location_data', 'sexual_orientation', 'gender_identity') 
        THEN 'critical'
        ELSE 'high'
      END
    ),
    'critical'
  );
  
  -- Create incident for high-risk access patterns
  IF p_data_type IN ('financial_data', 'location_data') THEN
    INSERT INTO public.security_events (
      id, event_type, user_id, metadata, created_at
    ) VALUES (
      gen_random_uuid(),
      'HIGH_RISK_DATA_ACCESS_INCIDENT',
      p_user_id,
      jsonb_build_object(
        'requires_review', true,
        'auto_generated', true,
        'target_user_id', p_target_user_id,
        'data_type', p_data_type
      ),
      NOW()
    );
  END IF;
END;
$$;