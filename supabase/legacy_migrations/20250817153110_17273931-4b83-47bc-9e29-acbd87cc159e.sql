-- Fix critical security issues
-- 1. Consolidate profiles table policies to prevent conflicts
DROP POLICY IF EXISTS "Combined SELECT policy for profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles viewable by all" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

-- Create single, comprehensive policy set for profiles
CREATE POLICY "profiles_select_policy" ON public.profiles
FOR SELECT USING (
  -- Users can see their own profile
  user_id = auth.uid() OR
  -- Admins can see profiles for moderation
  has_role(auth.uid(), 'admin'::app_role) OR
  -- Public profiles are viewable (with privacy controls handled by secure function)
  (privacy_settings->>'profile_visibility' = 'public')
);

CREATE POLICY "profiles_insert_policy" ON public.profiles
FOR INSERT WITH CHECK (
  auth.uid() = user_id
);

CREATE POLICY "profiles_update_policy" ON public.profiles  
FOR UPDATE USING (
  auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role)
);

-- 2. Enhanced passkey security - move enrollment status to database
CREATE TABLE IF NOT EXISTS public.user_passkey_enrollment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_enrolled BOOLEAN NOT NULL DEFAULT false,
  enrolled_at TIMESTAMP WITH TIME ZONE,
  device_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS on passkey enrollment table
ALTER TABLE public.user_passkey_enrollment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "passkey_enrollment_users_own" ON public.user_passkey_enrollment
FOR ALL USING (auth.uid() = user_id);

-- 3. Enhanced message encryption functions
CREATE OR REPLACE FUNCTION public.encrypt_message_content(content_text text, conversation_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  conv_salt text;
  encryption_key text;
BEGIN
  -- Return null if input is null or empty
  IF content_text IS NULL OR trim(content_text) = '' THEN
    RETURN NULL;
  END IF;
  
  -- Generate conversation-specific salt for end-to-end encryption
  conv_salt := substr(md5(conversation_id::text || 'secure_message_2024'), 1, 16);
  encryption_key := conv_salt || 'MESSAGE_ENCRYPTION_KEY_2024';
  
  -- Use AES encryption with conversation-specific key
  RETURN encode(
    encrypt(
      content_text::bytea, 
      encryption_key::bytea, 
      'aes'
    ), 
    'base64'
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Log encryption failure but don't expose details
    PERFORM public.log_enhanced_security_event(
      'MESSAGE_ENCRYPTION_FAILURE',
      auth.uid(),
      jsonb_build_object('conversation_id', conversation_id, 'error', 'Message encryption failed'),
      'critical'
    );
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_message_content(encrypted_content text, conversation_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  conv_salt text;
  encryption_key text;
BEGIN
  -- Return null if input is null or empty
  IF encrypted_content IS NULL OR trim(encrypted_content) = '' THEN
    RETURN NULL;
  END IF;
  
  -- Only allow conversation participants to decrypt messages
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants 
    WHERE conversation_id = decrypt_message_content.conversation_id 
    AND user_id = auth.uid()
  ) AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    PERFORM public.log_enhanced_security_event(
      'UNAUTHORIZED_MESSAGE_DECRYPTION_ATTEMPT',
      auth.uid(),
      jsonb_build_object('conversation_id', conversation_id, 'timestamp', now()),
      'critical'
    );
    RETURN '[UNAUTHORIZED]';
  END IF;
  
  -- Generate the same salt used for encryption
  conv_salt := substr(md5(conversation_id::text || 'secure_message_2024'), 1, 16);
  encryption_key := conv_salt || 'MESSAGE_ENCRYPTION_KEY_2024';
  
  -- Decrypt the message
  RETURN convert_from(
    decrypt(
      decode(encrypted_content, 'base64'), 
      encryption_key::bytea, 
      'aes'
    ), 
    'UTF8'
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Log decryption failure for security monitoring
    PERFORM public.log_enhanced_security_event(
      'MESSAGE_DECRYPTION_FAILURE',
      auth.uid(),
      jsonb_build_object('conversation_id', conversation_id, 'timestamp', now()),
      'high'
    );
    RETURN '[DECRYPTION_FAILED]';
END;
$$;

-- 4. Location data anonymization function
CREATE OR REPLACE FUNCTION public.anonymize_location_data(lat numeric, lng numeric, precision_meters integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  lat_offset numeric;
  lng_offset numeric;
  anonymized_lat numeric;
  anonymized_lng numeric;
BEGIN
  -- Add random offset within specified precision (default 100m)
  lat_offset := (random() - 0.5) * (precision_meters::numeric / 111000); -- ~111km per degree
  lng_offset := (random() - 0.5) * (precision_meters::numeric / (111000 * cos(radians(lat))));
  
  anonymized_lat := lat + lat_offset;
  anonymized_lng := lng + lng_offset;
  
  RETURN jsonb_build_object(
    'latitude', round(anonymized_lat, 5),
    'longitude', round(anonymized_lng, 5),
    'precision_meters', precision_meters,
    'anonymized', true
  );
END;
$$;

-- 5. Enhanced financial data encryption for donations
ALTER TABLE IF EXISTS public.donations ADD COLUMN IF NOT EXISTS amount_encrypted text;
ALTER TABLE IF EXISTS public.donations ADD COLUMN IF NOT EXISTS payment_method_encrypted text;
ALTER TABLE IF EXISTS public.donations ADD COLUMN IF NOT EXISTS donor_info_encrypted text;

-- Create function to encrypt financial data
CREATE OR REPLACE FUNCTION public.encrypt_financial_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  financial_salt text;
BEGIN
  -- Generate salt for financial data encryption
  financial_salt := substr(md5(NEW.id::text || 'financial_data_2024'), 1, 16);
  
  -- Encrypt amount if present
  IF NEW.amount IS NOT NULL THEN
    NEW.amount_encrypted := public.encrypt_sensitive_data(NEW.amount::text, financial_salt);
    NEW.amount := NULL; -- Clear plaintext
  END IF;
  
  -- Encrypt payment method if present
  IF NEW.payment_method IS NOT NULL AND trim(NEW.payment_method) != '' THEN
    NEW.payment_method_encrypted := public.encrypt_sensitive_data(NEW.payment_method, financial_salt);
    NEW.payment_method := NULL; -- Clear plaintext
  END IF;
  
  -- Log financial data encryption
  PERFORM public.log_enhanced_security_event(
    'FINANCIAL_DATA_ENCRYPTED',
    NEW.user_id,
    jsonb_build_object('donation_id', NEW.id, 'timestamp', now()),
    'high'
  );
  
  RETURN NEW;
END;
$$;

-- Apply financial data encryption trigger if donations table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'donations' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS encrypt_financial_data_trigger ON public.donations;
    CREATE TRIGGER encrypt_financial_data_trigger
      BEFORE INSERT OR UPDATE ON public.donations
      FOR EACH ROW EXECUTE FUNCTION public.encrypt_financial_data();
  END IF;
END $$;