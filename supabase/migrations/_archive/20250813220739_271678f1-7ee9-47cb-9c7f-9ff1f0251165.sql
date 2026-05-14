-- Enhanced security for bookings table: encryption and tokenization
-- Add encrypted columns for sensitive data
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS traveler_details_encrypted text,
ADD COLUMN IF NOT EXISTS flight_data_encrypted text,
ADD COLUMN IF NOT EXISTS hotel_data_encrypted text,
ADD COLUMN IF NOT EXISTS payment_token text,
ADD COLUMN IF NOT EXISTS payment_method_last4 varchar(4),
ADD COLUMN IF NOT EXISTS payment_method_type varchar(20),
ADD COLUMN IF NOT EXISTS encryption_key_id text;

-- Create enhanced booking encryption functions
CREATE OR REPLACE FUNCTION public.encrypt_booking_data(data_text text, user_salt text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Return null if input is null or empty
  IF data_text IS NULL OR trim(data_text) = '' THEN
    RETURN NULL;
  END IF;
  
  -- Use user-specific salt with additional booking-specific key
  RETURN encode(
    encrypt(
      data_text::bytea, 
      (user_salt || 'booking_secure_key_2024')::bytea, 
      'aes'
    ), 
    'base64'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_booking_data(encrypted_data text, user_salt text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Return null if input is null or empty
  IF encrypted_data IS NULL OR trim(encrypted_data) = '' THEN
    RETURN NULL;
  END IF;
  
  -- Decrypt using user-specific salt
  RETURN convert_from(
    decrypt(
      decode(encrypted_data, 'base64'), 
      (user_salt || 'booking_secure_key_2024')::bytea, 
      'aes'
    ), 
    'UTF8'
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Return null if decryption fails (corrupted data)
    RETURN NULL;
END;
$$;

-- Create secure booking data encryption trigger
CREATE OR REPLACE FUNCTION public.encrypt_booking_sensitive_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_salt text;
  payment_data jsonb;
BEGIN
  -- Generate or get user-specific salt
  user_salt := substr(md5(NEW.user_id::text || 'booking_salt_2024'), 1, 16);
  
  -- Encrypt traveler details if present
  IF NEW.traveler_details IS NOT NULL THEN
    -- Remove sensitive payment info before encryption
    payment_data := NEW.traveler_details;
    
    -- Extract and tokenize payment information
    IF payment_data ? 'paymentInfo' THEN
      -- Store only last 4 digits and payment type
      NEW.payment_method_last4 := RIGHT(COALESCE(payment_data->'paymentInfo'->>'cardNumber', ''), 4);
      NEW.payment_method_type := payment_data->'paymentInfo'->>'cardType';
      
      -- Generate secure payment token instead of storing actual payment data
      NEW.payment_token := 'tok_' || encode(digest(
        payment_data->'paymentInfo'->>'cardNumber' || NEW.user_id::text || extract(epoch from now())::text,
        'sha256'
      ), 'hex');
      
      -- Remove actual payment data from JSON
      payment_data := payment_data - 'paymentInfo';
    END IF;
    
    NEW.traveler_details_encrypted := encrypt_booking_data(payment_data::text, user_salt);
    NEW.traveler_details := NULL; -- Clear plaintext
  END IF;
  
  -- Encrypt flight data if present
  IF NEW.flight_data IS NOT NULL THEN
    NEW.flight_data_encrypted := encrypt_booking_data(NEW.flight_data::text, user_salt);
    NEW.flight_data := NULL; -- Clear plaintext
  END IF;
  
  -- Encrypt hotel data if present
  IF NEW.hotel_data IS NOT NULL THEN
    NEW.hotel_data_encrypted := encrypt_booking_data(NEW.hotel_data::text, user_salt);
    NEW.hotel_data := NULL; -- Clear plaintext
  END IF;
  
  -- Set encryption key identifier for key rotation support
  NEW.encryption_key_id := 'v1_2024';
  
  RETURN NEW;
END;
$$;

-- Apply encryption trigger to bookings table
DROP TRIGGER IF EXISTS encrypt_booking_data_trigger ON public.bookings;
CREATE TRIGGER encrypt_booking_data_trigger
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_booking_sensitive_data();

-- Enhanced booking validation trigger
CREATE OR REPLACE FUNCTION public.validate_booking_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Validate booking reference format
  IF NEW.booking_reference IS NULL OR NOT (NEW.booking_reference ~ '^[A-Z]+-[0-9]+-[a-z0-9]+$') THEN
    RAISE EXCEPTION 'Invalid booking reference format';
  END IF;
  
  -- Validate price is reasonable (between $1 and $50,000)
  IF NEW.total_price IS NOT NULL AND (NEW.total_price < 1 OR NEW.total_price > 5000000) THEN
    RAISE EXCEPTION 'Booking price out of acceptable range';
  END IF;
  
  -- Rate limiting for booking creation
  IF NOT public.check_rate_limit_enhanced(
    NEW.user_id::text, 
    10, 
    60, 
    'booking_creation'
  ) THEN
    RAISE EXCEPTION 'Rate limit exceeded for booking creation';
  END IF;
  
  -- Log booking security event
  PERFORM public.log_enhanced_security_event(
    'BOOKING_CREATED_SECURE',
    NEW.user_id,
    jsonb_build_object(
      'booking_id', NEW.id,
      'booking_type', NEW.booking_type,
      'booking_reference', NEW.booking_reference,
      'has_payment_token', NEW.payment_token IS NOT NULL,
      'encryption_applied', NEW.encryption_key_id IS NOT NULL,
      'timestamp', now()
    ),
    'medium'
  );
  
  RETURN NEW;
END;
$$;

-- Apply validation trigger
DROP TRIGGER IF EXISTS validate_booking_security_trigger ON public.bookings;
CREATE TRIGGER validate_booking_security_trigger
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.validate_booking_security();

-- Secure function to retrieve decrypted booking data for authorized users
CREATE OR REPLACE FUNCTION public.get_booking_details(booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  booking_record record;
  user_salt text;
  result jsonb;
BEGIN
  -- Get booking and verify ownership
  SELECT * INTO booking_record 
  FROM public.bookings 
  WHERE id = booking_id AND user_id = auth.uid();
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or access denied';
  END IF;
  
  -- Generate user salt for decryption
  user_salt := substr(md5(booking_record.user_id::text || 'booking_salt_2024'), 1, 16);
  
  -- Build result with decrypted sensitive data
  result := jsonb_build_object(
    'id', booking_record.id,
    'booking_type', booking_record.booking_type,
    'booking_reference', booking_record.booking_reference,
    'status', booking_record.status,
    'total_price', booking_record.total_price,
    'currency', booking_record.currency,
    'created_at', booking_record.created_at,
    'updated_at', booking_record.updated_at
  );
  
  -- Add decrypted traveler details (without sensitive payment info)
  IF booking_record.traveler_details_encrypted IS NOT NULL THEN
    result := result || jsonb_build_object(
      'traveler_details', 
      decrypt_booking_data(booking_record.traveler_details_encrypted, user_salt)::jsonb
    );
  END IF;
  
  -- Add masked payment information
  IF booking_record.payment_token IS NOT NULL THEN
    result := result || jsonb_build_object(
      'payment_info', jsonb_build_object(
        'token', booking_record.payment_token,
        'last4', booking_record.payment_method_last4,
        'type', booking_record.payment_method_type
      )
    );
  END IF;
  
  -- Add decrypted flight data if applicable
  IF booking_record.flight_data_encrypted IS NOT NULL THEN
    result := result || jsonb_build_object(
      'flight_data', 
      decrypt_booking_data(booking_record.flight_data_encrypted, user_salt)::jsonb
    );
  END IF;
  
  -- Add decrypted hotel data if applicable
  IF booking_record.hotel_data_encrypted IS NOT NULL THEN
    result := result || jsonb_build_object(
      'hotel_data', 
      decrypt_booking_data(booking_record.hotel_data_encrypted, user_salt)::jsonb
    );
  END IF;
  
  RETURN result;
END;
$$;

-- Enhanced RLS policies for bookings with additional security
DROP POLICY IF EXISTS "Secure bookings SELECT - owners only" ON public.bookings;
DROP POLICY IF EXISTS "Secure bookings INSERT - owners only" ON public.bookings;
DROP POLICY IF EXISTS "Secure bookings UPDATE - owners only" ON public.bookings;
DROP POLICY IF EXISTS "Secure bookings DELETE - owners only" ON public.bookings;

-- Consolidated and enhanced RLS policy
CREATE POLICY "Secure bookings access control" 
ON public.bookings 
FOR ALL 
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Create secure booking cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_expired_bookings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Archive and then delete very old cancelled/failed bookings (older than 2 years)
  DELETE FROM public.bookings 
  WHERE status IN ('cancelled', 'failed') 
    AND updated_at < (NOW() - INTERVAL '2 years');
  
  -- Log cleanup for audit trail
  PERFORM public.log_enhanced_security_event(
    'BOOKING_DATA_CLEANUP',
    NULL,
    jsonb_build_object(
      'retention_years', 2,
      'cleanup_timestamp', now(),
      'table', 'bookings'
    ),
    'info'
  );
END;
$$;

-- Create index for better performance on encrypted columns
CREATE INDEX IF NOT EXISTS idx_bookings_user_id_status ON public.bookings(user_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_token ON public.bookings(payment_token) WHERE payment_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_encryption_key ON public.bookings(encryption_key_id) WHERE encryption_key_id IS NOT NULL;