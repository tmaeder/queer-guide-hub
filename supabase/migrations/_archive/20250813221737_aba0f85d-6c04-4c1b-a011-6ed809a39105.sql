-- Fix the audit trigger and implement enhanced payment security
-- Create secure payment audit function (fixed)
CREATE OR REPLACE FUNCTION public.audit_payment_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Log any access to payment-related fields (only for UPDATE operations)
  IF TG_OP = 'UPDATE' AND (
     NEW.payment_token IS DISTINCT FROM OLD.payment_token OR
     NEW.payment_method_last4 IS DISTINCT FROM OLD.payment_method_last4
  ) THEN
    
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

-- Apply payment audit trigger for UPDATE only
DROP TRIGGER IF EXISTS audit_payment_access_trigger ON public.bookings;
CREATE TRIGGER audit_payment_access_trigger
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.audit_payment_access();

-- Enhanced payment token security function
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

-- Enhanced function to completely remove payment data
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

-- Update booking encryption trigger with enhanced payment security
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
  payment_info jsonb;
BEGIN
  -- Generate or get user-specific salt
  user_salt := substr(md5(NEW.user_id::text || 'booking_salt_2024'), 1, 16);
  
  -- Process traveler details with enhanced payment security
  IF NEW.traveler_details IS NOT NULL THEN
    payment_data := NEW.traveler_details;
    
    -- Extract and securely tokenize payment information
    IF payment_data ? 'paymentInfo' OR payment_data ? 'creditCard' OR payment_data ? 'payment' THEN
      -- Extract payment info from any possible nested structure
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
    END IF;
    
    -- Completely sanitize payment data from traveler details
    sanitized_traveler_data := sanitize_payment_data(payment_data);
    
    -- Encrypt only the sanitized traveler data
    NEW.traveler_details_encrypted := encrypt_booking_data(sanitized_traveler_data::text, user_salt);
    NEW.traveler_details := NULL; -- Clear all plaintext data
  END IF;
  
  -- Encrypt flight data if present (ensuring no payment data leaks through)
  IF NEW.flight_data IS NOT NULL THEN
    NEW.flight_data_encrypted := encrypt_booking_data(
      sanitize_payment_data(NEW.flight_data)::text, 
      user_salt
    );
    NEW.flight_data := NULL;
  END IF;
  
  -- Encrypt hotel data if present (ensuring no payment data leaks through)
  IF NEW.hotel_data IS NOT NULL THEN
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

-- Enhanced RLS policies for stricter payment data protection
DROP POLICY IF EXISTS "Bookings read access - owners only" ON public.bookings;
DROP POLICY IF EXISTS "Bookings insert - validated users only" ON public.bookings; 
DROP POLICY IF EXISTS "Bookings update - limited fields only" ON public.bookings;
DROP POLICY IF EXISTS "Bookings delete - owners only" ON public.bookings;

-- Create consolidated secure policy
CREATE POLICY "Enhanced bookings security policy" 
ON public.bookings 
FOR ALL 
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid() AND
  -- Ensure payment tokens follow secure format if present
  (payment_token IS NULL OR payment_token ~ '^spay_[a-f0-9]{32}$') AND
  -- Ensure no plaintext sensitive data
  traveler_details IS NULL AND
  flight_data IS NULL AND
  hotel_data IS NULL
);

-- Secure view for safe booking data access
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
FROM public.bookings
WHERE user_id = auth.uid(); -- Additional security layer

-- Grant access to the secure view
GRANT SELECT ON public.secure_booking_summary TO authenticated;

-- Additional payment data validation
CREATE OR REPLACE FUNCTION public.validate_payment_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Ensure no payment data leaks through in plaintext
  IF NEW.traveler_details IS NOT NULL THEN
    IF NEW.traveler_details::text ~* '(credit|card|payment|cvv|expir|billing)' THEN
      RAISE EXCEPTION 'Potential payment data detected in plaintext fields';
    END IF;
  END IF;
  
  -- Validate payment token format if present
  IF NEW.payment_token IS NOT NULL AND NOT (NEW.payment_token ~ '^spay_[a-f0-9]{32}$') THEN
    RAISE EXCEPTION 'Invalid payment token format';
  END IF;
  
  -- Ensure last4 is actually 4 digits
  IF NEW.payment_method_last4 IS NOT NULL AND NOT (NEW.payment_method_last4 ~ '^[0-9]{4}$') THEN
    RAISE EXCEPTION 'Invalid payment method last4 format';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Apply payment validation trigger
DROP TRIGGER IF EXISTS validate_payment_security_trigger ON public.bookings;
CREATE TRIGGER validate_payment_security_trigger
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.validate_payment_security();