-- CRITICAL SECURITY ENHANCEMENT: Remove admin access to sensitive profile data
-- Implement zero-trust model for highly sensitive personal information

-- Drop the current SELECT policy that allows admin access
DROP POLICY IF EXISTS "Secure profile SELECT access" ON public.profiles;

-- Create new SELECT policy with ZERO admin override for sensitive data
CREATE POLICY "Ultra-secure profile SELECT - owners only" 
ON public.profiles 
FOR SELECT 
USING (user_id = (SELECT auth.uid()));

-- Create encrypted storage columns for sensitive data
-- Add new encrypted columns alongside existing ones for migration
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone_encrypted text,
ADD COLUMN IF NOT EXISTS emergency_contact_phone_encrypted text,
ADD COLUMN IF NOT EXISTS sexual_orientation_encrypted text,
ADD COLUMN IF NOT EXISTS gender_identity_encrypted text,
ADD COLUMN IF NOT EXISTS relationship_status_encrypted text,
ADD COLUMN IF NOT EXISTS income_range_encrypted text,
ADD COLUMN IF NOT EXISTS political_views_encrypted text,
ADD COLUMN IF NOT EXISTS religious_beliefs_encrypted text;

-- Create encryption/decryption functions using pgcrypto
-- Note: In production, use a more secure key management system
CREATE OR REPLACE FUNCTION encrypt_sensitive_data(data_text text, user_salt text)
RETURNS text AS $$
BEGIN
  -- Return null if input is null or empty
  IF data_text IS NULL OR trim(data_text) = '' THEN
    RETURN NULL;
  END IF;
  
  -- Use user-specific salt for encryption to prevent rainbow table attacks
  RETURN encode(
    encrypt(
      data_text::bytea, 
      (user_salt || 'secure_profile_key_2024')::bytea, 
      'aes'
    ), 
    'base64'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

CREATE OR REPLACE FUNCTION decrypt_sensitive_data(encrypted_data text, user_salt text)
RETURNS text AS $$
BEGIN
  -- Return null if input is null or empty
  IF encrypted_data IS NULL OR trim(encrypted_data) = '' THEN
    RETURN NULL;
  END IF;
  
  -- Decrypt using user-specific salt
  RETURN convert_from(
    decrypt(
      decode(encrypted_data, 'base64'), 
      (user_salt || 'secure_profile_key_2024')::bytea, 
      'aes'
    ), 
    'UTF8'
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Return null if decryption fails (corrupted data)
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

-- Create function to automatically encrypt sensitive data on insert/update
CREATE OR REPLACE FUNCTION encrypt_profile_sensitive_data()
RETURNS TRIGGER AS $$
DECLARE
  user_salt text;
BEGIN
  -- Generate or get user-specific salt
  user_salt := substr(md5(NEW.user_id::text || 'salt_2024'), 1, 16);
  
  -- Encrypt sensitive fields if they have data
  IF NEW.phone IS NOT NULL AND trim(NEW.phone) != '' THEN
    NEW.phone_encrypted = encrypt_sensitive_data(NEW.phone, user_salt);
    NEW.phone = NULL; -- Clear plaintext
  END IF;
  
  IF NEW.emergency_contact_phone IS NOT NULL AND trim(NEW.emergency_contact_phone) != '' THEN
    NEW.emergency_contact_phone_encrypted = encrypt_sensitive_data(NEW.emergency_contact_phone, user_salt);
    NEW.emergency_contact_phone = NULL; -- Clear plaintext
  END IF;
  
  IF NEW.sexual_orientation IS NOT NULL AND trim(NEW.sexual_orientation) != '' THEN
    NEW.sexual_orientation_encrypted = encrypt_sensitive_data(NEW.sexual_orientation, user_salt);
    NEW.sexual_orientation = NULL; -- Clear plaintext
  END IF;
  
  IF NEW.gender_identity IS NOT NULL AND trim(NEW.gender_identity) != '' THEN
    NEW.gender_identity_encrypted = encrypt_sensitive_data(NEW.gender_identity, user_salt);
    NEW.gender_identity = NULL; -- Clear plaintext
  END IF;
  
  IF NEW.relationship_status IS NOT NULL AND trim(NEW.relationship_status) != '' THEN
    NEW.relationship_status_encrypted = encrypt_sensitive_data(NEW.relationship_status, user_salt);
    NEW.relationship_status = NULL; -- Clear plaintext
  END IF;
  
  IF NEW.income_range IS NOT NULL AND trim(NEW.income_range) != '' THEN
    NEW.income_range_encrypted = encrypt_sensitive_data(NEW.income_range, user_salt);
    NEW.income_range = NULL; -- Clear plaintext
  END IF;
  
  IF NEW.political_views IS NOT NULL AND trim(NEW.political_views) != '' THEN
    NEW.political_views_encrypted = encrypt_sensitive_data(NEW.political_views, user_salt);
    NEW.political_views = NULL; -- Clear plaintext
  END IF;
  
  IF NEW.religious_beliefs IS NOT NULL AND trim(NEW.religious_beliefs) != '' THEN
    NEW.religious_beliefs_encrypted = encrypt_sensitive_data(NEW.religious_beliefs, user_salt);
    NEW.religious_beliefs = NULL; -- Clear plaintext
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

-- Apply encryption trigger
DROP TRIGGER IF EXISTS encrypt_profile_sensitive_data_trigger ON public.profiles;
CREATE TRIGGER encrypt_profile_sensitive_data_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION encrypt_profile_sensitive_data();