-- Additional security hardening for payment data in bookings
-- Create more secure payment token management

-- Enhanced payment token security with additional encryption layer
CREATE OR REPLACE FUNCTION public.generate_secure_payment_token(payment_data jsonb, user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  token_salt text;
  secure_hash text;
BEGIN
  -- Generate unique salt for this payment token
  token_salt := encode(digest(user_id::text || extract(epoch from now())::text || random()::text, 'sha256'), 'hex');
  
  -- Create secure hash without storing actual payment data
  secure_hash := encode(digest(
    COALESCE(payment_data->>'cardNumber', '') || 
    COALESCE(payment_data->>'expiryDate', '') ||
    token_salt ||
    'secure_payment_2024',
    'sha256'
  ), 'hex');
  
  RETURN 'spay_' || substr(secure_hash, 1, 32);
END;
$$;

-- Enhanced function to completely remove payment data from traveler details
CREATE OR REPLACE FUNCTION public.sanitize_payment_data(traveler_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sanitized_data jsonb;
BEGIN
  sanitized_data := traveler_data;
  
  -- Remove all payment-related fields
  sanitized_data := sanitized_data - 'paymentInfo';
  sanitized_data := sanitized_data - 'creditCard';
  sanitized_data := sanitized_data - 'paymentMethod';
  sanitized_data := sanitized_data - 'billing';
  sanitized_data := sanitized_data - 'card';
  sanitized_data := sanitized_data - 'payment';
  
  -- Also remove nested payment data if it exists
  IF sanitized_data ? 'personalInfo' THEN
    sanitized_data := jsonb_set(
      sanitized_data, 
      '{personalInfo}', 
      (sanitized_data->'personalInfo') - 'paymentInfo' - 'creditCard' - 'payment'
    );
  END IF;
  
  RETURN sanitized_data;
END;
$$;

-- Update the booking encryption trigger with enhanced payment security
CREATE OR REPLACE FUNCTION public.encrypt_booking_sensitive_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_salt text;
  payment_data jsonb;
  sanitized_traveler_data jsonb;
BEGIN
  -- Generate or get user-specific salt
  user_salt := substr(md5(NEW.user_id::text || 'booking_salt_2024'), 1, 16);
  
  -- Process traveler details with enhanced payment security
  IF NEW.traveler_details IS NOT NULL THEN
    payment_data := NEW.traveler_details;
    
    -- Extract and securely tokenize payment information
    IF payment_data ? 'paymentInfo' OR payment_data ? 'creditCard' OR payment_data ? 'payment' THEN
      -- Extract payment info from any possible nested structure
      DECLARE
        payment_info jsonb;
      BEGIN
        payment_info := COALESCE(
          payment_data->'paymentInfo',
          payment_data->'creditCard', 
          payment_data->'payment',
          payment_data->'personalInfo'->'paymentInfo'
        );
        
        IF payment_info IS NOT NULL THEN
          -- Store only absolutely necessary payment metadata (last 4 digits and type)
          NEW.payment_method_last4 := RIGHT(COALESCE(
            payment_info->>'cardNumber',
            payment_info->>'number',
            payment_info->>'card_number',
            ''
          ), 4);
          
          NEW.payment_method_type := COALESCE(
            payment_info->>'cardType',
            payment_info->>'type',
            payment_info->>'brand',
            'unknown'
          );
          
          -- Generate secure payment token without storing actual payment data
          NEW.payment_token := generate_secure_payment_token(payment_info, NEW.user_id);
        END IF;
      END;
    END IF;
    
    -- Completely sanitize payment data from traveler details
    sanitized_traveler_data := sanitize_payment_data(payment_data);
    
    -- Encrypt only the sanitized traveler data
    NEW.traveler_details_encrypted := encrypt_booking_data(sanitized_traveler_data::text, user_salt);
    NEW.traveler_details := NULL; -- Clear all plaintext data
  END IF;
  
  -- Encrypt flight data if present (ensuring no payment data leaks through)
  IF NEW.flight_data IS NOT NULL THEN
    -- Sanitize flight data of any payment info before encryption
    NEW.flight_data_encrypted := encrypt_booking_data(
      sanitize_payment_data(NEW.flight_data)::text, 
      user_salt
    );
    NEW.flight_data := NULL;
  END IF;
  
  -- Encrypt hotel data if present (ensuring no payment data leaks through)
  IF NEW.hotel_data IS NOT NULL THEN
    -- Sanitize hotel data of any payment info before encryption
    NEW.hotel_data_encrypted := encrypt_booking_data(
      sanitize_payment_data(NEW.hotel_data)::text, 
      user_salt
    );
    NEW.hotel_data := NULL;
  END IF;
  
  -- Set encryption key identifier
  NEW.encryption_key_id := 'v2_2024_enhanced';
  
  RETURN NEW;
END;
$$;

-- Create secure payment audit function
CREATE OR REPLACE FUNCTION public.audit_payment_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Log any access to payment-related fields
  IF NEW.payment_token IS DISTINCT FROM OLD.payment_token OR
     NEW.payment_method_last4 IS DISTINCT FROM OLD.payment_method_last4 THEN
    
    PERFORM public.log_enhanced_security_event(
      'PAYMENT_DATA_MODIFIED',
      NEW.user_id,
      jsonb_build_object(
        'booking_id', NEW.id,
        'payment_token_changed', NEW.payment_token IS DISTINCT FROM OLD.payment_token,
        'payment_method_changed', NEW.payment_method_last4 IS DISTINCT FROM OLD.payment_method_last4,
        'timestamp', now()
      ),
      'high'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Apply payment audit trigger
DROP TRIGGER IF EXISTS audit_payment_access_trigger ON public.bookings;
CREATE TRIGGER audit_payment_access_trigger
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.audit_payment_access();

-- Enhanced RLS policy specifically for payment data protection
DROP POLICY IF EXISTS "Secure bookings access control" ON public.bookings;

-- Create more restrictive policies for payment-sensitive operations
CREATE POLICY "Bookings read access - owners only" 
ON public.bookings 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Bookings insert - validated users only" 
ON public.bookings 
FOR INSERT 
WITH CHECK (
  user_id = auth.uid() AND
  payment_token IS NULL OR payment_token ~ '^spay_[a-f0-9]{32}$'
);

CREATE POLICY "Bookings update - limited fields only" 
ON public.bookings 
FOR UPDATE 
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid() AND
  -- Prevent modification of encrypted payment data
  traveler_details_encrypted IS NOT DISTINCT FROM OLD.traveler_details_encrypted AND
  payment_token IS NOT DISTINCT FROM OLD.payment_token AND
  payment_method_last4 IS NOT DISTINCT FROM OLD.payment_method_last4
);

CREATE POLICY "Bookings delete - owners only" 
ON public.bookings 
FOR DELETE 
USING (user_id = auth.uid());

-- Secure view for payment data access (read-only, heavily restricted)
CREATE OR REPLACE VIEW public.secure_booking_summary AS
SELECT 
  id,
  user_id,
  booking_type,
  booking_reference,
  status,
  total_price,
  currency,
  departure_airport,
  arrival_airport,
  departure_date,
  return_date,
  passengers,
  hotel_name,
  hotel_location,
  check_in_date,
  check_out_date,
  rooms,
  guests,
  -- Only show masked payment information
  CASE 
    WHEN payment_method_last4 IS NOT NULL 
    THEN '****' || payment_method_last4 
    ELSE NULL 
  END as payment_method_masked,
  payment_method_type,
  created_at,
  updated_at
FROM public.bookings;

-- Grant access to the secure view
GRANT SELECT ON public.secure_booking_summary TO authenticated;

-- Enhanced booking details function with stricter payment data controls
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
  decrypted_traveler_data jsonb;
BEGIN
  -- Get booking and verify ownership with additional security checks
  SELECT * INTO booking_record 
  FROM public.bookings 
  WHERE id = booking_id 
    AND user_id = auth.uid()
    AND encryption_key_id IS NOT NULL; -- Only return properly encrypted bookings
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found, access denied, or data not properly secured';
  END IF;
  
  -- Log access to sensitive booking data
  PERFORM public.log_enhanced_security_event(
    'BOOKING_DETAILS_ACCESSED',
    auth.uid(),
    jsonb_build_object(
      'booking_id', booking_id,
      'booking_reference', booking_record.booking_reference,
      'timestamp', now()
    ),
    'medium'
  );
  
  -- Generate user salt for decryption
  user_salt := substr(md5(booking_record.user_id::text || 'booking_salt_2024'), 1, 16);
  
  -- Build result with basic non-sensitive data
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
  
  -- Add decrypted traveler details (payment data already removed)
  IF booking_record.traveler_details_encrypted IS NOT NULL THEN
    BEGIN
      decrypted_traveler_data := decrypt_booking_data(booking_record.traveler_details_encrypted, user_salt)::jsonb;
      
      -- Double-check that no payment data leaked through
      decrypted_traveler_data := sanitize_payment_data(decrypted_traveler_data);
      
      result := result || jsonb_build_object('traveler_details', decrypted_traveler_data);
    EXCEPTION
      WHEN OTHERS THEN
        -- Log decryption failure
        PERFORM public.log_enhanced_security_event(
          'BOOKING_DECRYPTION_FAILED',
          auth.uid(),
          jsonb_build_object(
            'booking_id', booking_id,
            'error_message', SQLERRM,
            'timestamp', now()
          ),
          'high'
        );
        -- Continue without sensitive data
    END;
  END IF;
  
  -- Add heavily masked payment information (no actual payment data)
  IF booking_record.payment_token IS NOT NULL THEN
    result := result || jsonb_build_object(
      'payment_info', jsonb_build_object(
        'has_payment_method', true,
        'last4', booking_record.payment_method_last4,
        'type', booking_record.payment_method_type,
        'token_ref', substr(booking_record.payment_token, 1, 12) || '...'
      )
    );
  END IF;
  
  -- Add other decrypted data (flight/hotel) with payment sanitization
  IF booking_record.flight_data_encrypted IS NOT NULL THEN
    BEGIN
      result := result || jsonb_build_object(
        'flight_data', 
        sanitize_payment_data(decrypt_booking_data(booking_record.flight_data_encrypted, user_salt)::jsonb)
      );
    EXCEPTION
      WHEN OTHERS THEN NULL; -- Fail gracefully
    END;
  END IF;
  
  IF booking_record.hotel_data_encrypted IS NOT NULL THEN
    BEGIN
      result := result || jsonb_build_object(
        'hotel_data', 
        sanitize_payment_data(decrypt_booking_data(booking_record.hotel_data_encrypted, user_salt)::jsonb)
      );
    EXCEPTION
      WHEN OTHERS THEN NULL; -- Fail gracefully
    END;
  END IF;
  
  RETURN result;
END;
$$;