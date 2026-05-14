-- Enhanced Security: Encrypt sensitive authentication data
-- Add encrypted columns for sensitive session and passkey data

-- First, add encrypted columns to user_sessions table
ALTER TABLE public.user_sessions 
ADD COLUMN session_token_encrypted text,
ADD COLUMN ip_address_encrypted text,
ADD COLUMN user_agent_encrypted text,
ADD COLUMN encryption_key_id text;

-- Add encrypted columns to user_passkeys table  
ALTER TABLE public.user_passkeys
ADD COLUMN credential_id_encrypted text,
ADD COLUMN public_key_encrypted text,
ADD COLUMN passkey_encryption_key_id text;

-- Create trigger to encrypt session data on insert/update
CREATE OR REPLACE FUNCTION public.encrypt_session_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  user_salt text;
BEGIN
  -- Generate user-specific salt for encryption
  user_salt := substr(md5(NEW.user_id::text || 'session_salt_2024'), 1, 16);
  
  -- Encrypt sensitive session fields
  IF NEW.session_token IS NOT NULL AND trim(NEW.session_token) != '' THEN
    NEW.session_token_encrypted = public.encrypt_sensitive_data(NEW.session_token, user_salt);
    NEW.session_token = NULL; -- Clear plaintext
  END IF;
  
  IF NEW.ip_address IS NOT NULL THEN
    NEW.ip_address_encrypted = public.encrypt_sensitive_data(NEW.ip_address::text, user_salt);
    -- Keep IP address for functional purposes but log that it's encrypted
  END IF;
  
  IF NEW.user_agent IS NOT NULL AND trim(NEW.user_agent) != '' THEN
    NEW.user_agent_encrypted = public.encrypt_sensitive_data(NEW.user_agent, user_salt);
    NEW.user_agent = NULL; -- Clear plaintext
  END IF;
  
  -- Set encryption key ID for audit trail
  NEW.encryption_key_id = 'session_aes_' || substr(user_salt, 1, 8);
  
  RETURN NEW;
END;
$$;

-- Create trigger to encrypt passkey data on insert/update
CREATE OR REPLACE FUNCTION public.encrypt_passkey_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  user_salt text;
BEGIN
  -- Generate user-specific salt for encryption
  user_salt := substr(md5(NEW.user_id::text || 'passkey_salt_2024'), 1, 16);
  
  -- Encrypt sensitive passkey fields
  IF NEW.credential_id IS NOT NULL AND trim(NEW.credential_id) != '' THEN
    NEW.credential_id_encrypted = public.encrypt_sensitive_data(NEW.credential_id, user_salt);
    NEW.credential_id = NULL; -- Clear plaintext
  END IF;
  
  IF NEW.public_key IS NOT NULL THEN
    NEW.public_key_encrypted = public.encrypt_sensitive_data(encode(NEW.public_key, 'base64'), user_salt);
    NEW.public_key = NULL; -- Clear plaintext
  END IF;
  
  -- Set encryption key ID for audit trail
  NEW.passkey_encryption_key_id = 'passkey_aes_' || substr(user_salt, 1, 8);
  
  RETURN NEW;
END;
$$;

-- Apply triggers to tables
CREATE TRIGGER encrypt_session_data_trigger
  BEFORE INSERT OR UPDATE ON public.user_sessions
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_session_data();

CREATE TRIGGER encrypt_passkey_data_trigger
  BEFORE INSERT OR UPDATE ON public.user_passkeys
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_passkey_data();

-- Create secure view for accessing decrypted session data (admin only)
CREATE OR REPLACE VIEW public.secure_session_summary AS
SELECT 
  id,
  user_id,
  CASE 
    WHEN has_role(auth.uid(), 'admin'::app_role) THEN 
      COALESCE(
        public.decrypt_sensitive_data(
          session_token_encrypted, 
          substr(md5(user_id::text || 'session_salt_2024'), 1, 16)
        ),
        'ENCRYPTED'
      )
    ELSE 'REDACTED'
  END as session_token_status,
  CASE 
    WHEN has_role(auth.uid(), 'admin'::app_role) THEN ip_address::text
    ELSE 'REDACTED'
  END as ip_status,
  expires_at,
  is_active,
  created_at,
  last_activity
FROM public.user_sessions;

-- Create secure view for accessing passkey data (user and admin only)
CREATE OR REPLACE VIEW public.secure_passkey_summary AS
SELECT 
  id,
  user_id,
  CASE 
    WHEN auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) THEN 
      COALESCE(
        public.decrypt_sensitive_data(
          credential_id_encrypted, 
          substr(md5(user_id::text || 'passkey_salt_2024'), 1, 16)
        ),
        'ENCRYPTED'
      )
    ELSE 'REDACTED'
  END as credential_status,
  counter,
  created_at,
  last_used_at,
  is_revoked
FROM public.user_passkeys;

-- Enhanced RLS policies for encrypted data access
DROP POLICY IF EXISTS "Users can manage their own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can view their own sessions" ON public.user_sessions;

CREATE POLICY "Enhanced session access control" ON public.user_sessions
FOR ALL 
USING (
  auth.uid() = user_id AND 
  -- Ensure only encrypted data is accessed in application code
  session_token IS NULL AND
  user_agent IS NULL
)
WITH CHECK (
  auth.uid() = user_id AND 
  -- Prevent insertion of unencrypted sensitive data
  session_token IS NULL AND
  user_agent IS NULL
);

DROP POLICY IF EXISTS "Service role can manage passkeys" ON public.user_passkeys;
DROP POLICY IF EXISTS "Users can view their own passkeys" ON public.user_passkeys;

CREATE POLICY "Enhanced passkey access control" ON public.user_passkeys
FOR ALL 
USING (
  (auth.uid() = user_id OR (auth.jwt() ->> 'role') = 'service_role') AND
  -- Ensure only encrypted data is accessed
  credential_id IS NULL AND
  public_key IS NULL
)
WITH CHECK (
  (auth.uid() = user_id OR (auth.jwt() ->> 'role') = 'service_role') AND
  -- Prevent insertion of unencrypted sensitive data
  credential_id IS NULL AND
  public_key IS NULL
);

-- Log security improvement using existing security_events structure
INSERT INTO public.security_events (event_type, user_id, metadata)
VALUES (
  'AUTHENTICATION_DATA_ENCRYPTION_ENABLED',
  NULL,
  jsonb_build_object(
    'tables_affected', ARRAY['user_sessions', 'user_passkeys'],
    'encryption_method', 'AES with user-specific salts',
    'timestamp', now()
  )
);

-- Add comments for documentation
COMMENT ON TRIGGER encrypt_session_data_trigger ON public.user_sessions IS 
'Automatically encrypts session tokens, IP addresses, and user agents before storage using AES encryption with user-specific salts.';

COMMENT ON TRIGGER encrypt_passkey_data_trigger ON public.user_passkeys IS 
'Automatically encrypts passkey credential IDs and public keys before storage using AES encryption with user-specific salts.';

COMMENT ON VIEW public.secure_session_summary IS 
'Secure view for session data that only shows decrypted information to admins and redacts sensitive data for regular users.';

COMMENT ON VIEW public.secure_passkey_summary IS 
'Secure view for passkey data that only shows decrypted information to the owning user and admins.';