-- Fix critical security vulnerability in user_passkeys table
-- The current policy allows access when sensitive fields are NULL, which is dangerous

-- Drop the insecure policy
DROP POLICY IF EXISTS "Enhanced passkey access control" ON public.user_passkeys;

-- Create secure policies that properly restrict access
-- Users can only access their own passkeys
CREATE POLICY "Users can view their own passkeys"
ON public.user_passkeys
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own passkeys
CREATE POLICY "Users can create their own passkeys"
ON public.user_passkeys  
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own passkeys (for marking as revoked, updating last_used_at)
CREATE POLICY "Users can update their own passkeys"
ON public.user_passkeys
FOR UPDATE  
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own passkeys
CREATE POLICY "Users can delete their own passkeys"
ON public.user_passkeys
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Service role has full access for administrative operations
CREATE POLICY "Service role has full access to passkeys"
ON public.user_passkeys
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Add function to log passkey access for security monitoring
CREATE OR REPLACE FUNCTION public.log_passkey_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Log passkey access attempts for INSERT, UPDATE, DELETE operations
  PERFORM public.log_enhanced_security_event(
    'PASSKEY_DATA_ACCESS',
    COALESCE(NEW.user_id, OLD.user_id),
    jsonb_build_object(
      'operation', TG_OP,
      'passkey_id', COALESCE(NEW.id, OLD.id),
      'accessed_by', auth.uid(),
      'timestamp', now()
    ),
    'medium'
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger for passkey operations (excluding SELECT for performance)
CREATE TRIGGER log_passkey_operations_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.user_passkeys
  FOR EACH ROW EXECUTE FUNCTION public.log_passkey_access();