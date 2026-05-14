-- =======================================================================================
-- COMPREHENSIVE SECURITY FIX: Row-Level Security Policies and Function Security
-- =======================================================================================
-- This migration addresses critical security vulnerabilities by:
-- 1. Enabling RLS on publicly readable tables containing sensitive user data
-- 2. Creating secure policies for data access control
-- 3. Fixing mutable search_path vulnerabilities in database functions
-- =======================================================================================

-- =======================================================================================
-- TABLE: profiles - Contains sensitive personal information
-- =======================================================================================

-- Enable Row-Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own profile data
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (user_id = auth.uid());

-- Policy: Users can only insert their own profile data
CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

-- Policy: Users can only update their own profile data
CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (user_id = auth.uid());

-- Policy: Users can only delete their own profile data
CREATE POLICY "Users can delete their own profile" 
ON public.profiles 
FOR DELETE 
USING (user_id = auth.uid());

-- =======================================================================================
-- TABLE: user_photos - Contains user photo data
-- =======================================================================================

-- Enable Row-Level Security
ALTER TABLE public.user_photos ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own photos
CREATE POLICY "Users can view their own photos" 
ON public.user_photos 
FOR SELECT 
USING (user_id = auth.uid());

-- Policy: Users can only upload their own photos
CREATE POLICY "Users can upload their own photos" 
ON public.user_photos 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

-- Policy: Users can only update their own photos
CREATE POLICY "Users can update their own photos" 
ON public.user_photos 
FOR UPDATE 
USING (user_id = auth.uid());

-- Policy: Users can only delete their own photos
CREATE POLICY "Users can delete their own photos" 
ON public.user_photos 
FOR DELETE 
USING (user_id = auth.uid());

-- =======================================================================================
-- TABLE: user_relationships - Contains private connections between users
-- =======================================================================================

-- Enable Row-Level Security
ALTER TABLE public.user_relationships ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view relationships where they are involved (either initiator or target)
CREATE POLICY "Users can view their own relationships" 
ON public.user_relationships 
FOR SELECT 
USING (user_id = auth.uid() OR target_user_id = auth.uid());

-- Policy: Users can only create relationships where they are the initiator
CREATE POLICY "Users can create their own relationships" 
ON public.user_relationships 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

-- Policy: Users can update relationships where they are involved
CREATE POLICY "Users can update their own relationships" 
ON public.user_relationships 
FOR UPDATE 
USING (user_id = auth.uid() OR target_user_id = auth.uid());

-- Policy: Users can delete relationships where they are involved
CREATE POLICY "Users can delete their own relationships" 
ON public.user_relationships 
FOR DELETE 
USING (user_id = auth.uid() OR target_user_id = auth.uid());

-- =======================================================================================
-- TABLE: user_passkeys - Contains authentication credentials
-- =======================================================================================

-- Enable Row-Level Security
ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own passkeys
CREATE POLICY "Users can view their own passkeys" 
ON public.user_passkeys 
FOR SELECT 
USING (user_id = auth.uid());

-- Policy: Users can only create their own passkeys
CREATE POLICY "Users can create their own passkeys" 
ON public.user_passkeys 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

-- Policy: Users can only update their own passkeys
CREATE POLICY "Users can update their own passkeys" 
ON public.user_passkeys 
FOR UPDATE 
USING (user_id = auth.uid());

-- Policy: Users can only delete their own passkeys
CREATE POLICY "Users can delete their own passkeys" 
ON public.user_passkeys 
FOR DELETE 
USING (user_id = auth.uid());

-- =======================================================================================
-- TABLE: user_sessions - Contains session tokens
-- =======================================================================================

-- Enable Row-Level Security
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own sessions
CREATE POLICY "Users can view their own sessions" 
ON public.user_sessions 
FOR SELECT 
USING (user_id = auth.uid());

-- Policy: Users can only create their own sessions
CREATE POLICY "Users can create their own sessions" 
ON public.user_sessions 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

-- Policy: Users can only update their own sessions
CREATE POLICY "Users can update their own sessions" 
ON public.user_sessions 
FOR UPDATE 
USING (user_id = auth.uid());

-- Policy: Users can only delete their own sessions
CREATE POLICY "Users can delete their own sessions" 
ON public.user_sessions 
FOR DELETE 
USING (user_id = auth.uid());

-- =======================================================================================
-- TABLE: messages - Contains private conversations
-- =======================================================================================

-- Enable Row-Level Security
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view messages where they are sender or recipient
CREATE POLICY "Users can view their own messages" 
ON public.messages 
FOR SELECT 
USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- Policy: Users can only send messages as themselves
CREATE POLICY "Users can send their own messages" 
ON public.messages 
FOR INSERT 
WITH CHECK (sender_id = auth.uid());

-- Policy: Users can update messages they sent
CREATE POLICY "Users can update their own messages" 
ON public.messages 
FOR UPDATE 
USING (sender_id = auth.uid());

-- Policy: Users can delete messages they sent
CREATE POLICY "Users can delete their own messages" 
ON public.messages 
FOR DELETE 
USING (sender_id = auth.uid());

-- =======================================================================================
-- TABLE: user_push_tokens - Contains device tokens for push notifications
-- =======================================================================================

-- Enable Row-Level Security
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own push tokens
CREATE POLICY "Users can view their own push tokens" 
ON public.user_push_tokens 
FOR SELECT 
USING (user_id = auth.uid());

-- Policy: Users can only create their own push tokens
CREATE POLICY "Users can create their own push tokens" 
ON public.user_push_tokens 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

-- Policy: Users can only update their own push tokens
CREATE POLICY "Users can update their own push tokens" 
ON public.user_push_tokens 
FOR UPDATE 
USING (user_id = auth.uid());

-- Policy: Users can only delete their own push tokens
CREATE POLICY "Users can delete their own push tokens" 
ON public.user_push_tokens 
FOR DELETE 
USING (user_id = auth.uid());

-- =======================================================================================
-- TABLE: donations - Contains donor financial information
-- =======================================================================================

-- Enable Row-Level Security on donations (if not already enabled)
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own donations
CREATE POLICY "Users can view their own donations" 
ON public.donations 
FOR SELECT 
USING (user_id = auth.uid());

-- Policy: Users can only create donations for themselves
CREATE POLICY "Users can create their own donations" 
ON public.donations 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

-- Policy: Users can only update their own donations
CREATE POLICY "Users can update their own donations" 
ON public.donations 
FOR UPDATE 
USING (user_id = auth.uid());

-- Policy: Users can only delete their own donations
CREATE POLICY "Users can delete their own donations" 
ON public.donations 
FOR DELETE 
USING (user_id = auth.uid());

-- =======================================================================================
-- FUNCTION SECURITY: Fix mutable search_path vulnerabilities
-- =======================================================================================

-- Fix search_users() function to prevent search path hijacking
ALTER FUNCTION public.search_users() SET search_path = 'public';

-- Fix get_admin_stats() function to prevent search path hijacking  
ALTER FUNCTION public.get_admin_stats() SET search_path = 'public';

-- =======================================================================================
-- SECURITY AUDIT LOG
-- =======================================================================================

-- Log this security fix for audit purposes
INSERT INTO public.security_events (
    event_type,
    user_id,
    metadata,
    severity
) VALUES (
    'COMPREHENSIVE_SECURITY_FIX_APPLIED',
    NULL,
    jsonb_build_object(
        'tables_secured', jsonb_build_array(
            'profiles', 'user_photos', 'user_relationships', 
            'user_passkeys', 'user_sessions', 'messages', 
            'user_push_tokens', 'donations'
        ),
        'functions_secured', jsonb_build_array(
            'search_users', 'get_admin_stats'
        ),
        'timestamp', now(),
        'migration_version', '20250815_comprehensive_security_fix'
    ),
    'critical'
);