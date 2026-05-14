-- CRITICAL SECURITY FIX: Protect sensitive booking and payment data
-- Remove dangerous admin access to personal travel and payment information

-- Drop ALL existing policies to implement secure booking protection
DROP POLICY IF EXISTS "Users can create their own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can update their own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can view their own bookings" ON public.bookings;
DROP POLICY IF EXISTS "admins manage bookings" ON public.bookings;

-- Create secure policies following zero-trust booking privacy model

-- 1. SELECT: ONLY users can view their own booking data - NO admin override
CREATE POLICY "Secure bookings SELECT - owners only" 
ON public.bookings 
FOR SELECT 
USING (user_id = (SELECT auth.uid()));

-- 2. INSERT: Users can only create their own bookings with validation
CREATE POLICY "Secure bookings INSERT - owners only" 
ON public.bookings 
FOR INSERT 
WITH CHECK (user_id = (SELECT auth.uid()));

-- 3. UPDATE: Users can only update their own bookings (limited fields)
CREATE POLICY "Secure bookings UPDATE - owners only" 
ON public.bookings 
FOR UPDATE 
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

-- 4. DELETE: Users can delete their own bookings
CREATE POLICY "Secure bookings DELETE - owners only" 
ON public.bookings 
FOR DELETE 
USING (user_id = (SELECT auth.uid()));

-- Add performance index for secure user-specific queries
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user_status ON public.bookings(user_id, status);

-- Create function to validate booking creation and protect sensitive data
CREATE OR REPLACE FUNCTION validate_booking_creation()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure user_id is valid and not null
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Booking must have a valid user';
  END IF;
  
  -- Ensure required fields are not empty
  IF NEW.booking_type IS NULL OR trim(NEW.booking_type) = '' THEN
    RAISE EXCEPTION 'Booking type cannot be empty';
  END IF;
  
  -- Generate secure booking reference if not provided
  IF NEW.booking_reference IS NULL OR trim(NEW.booking_reference) = '' THEN
    NEW.booking_reference = 'BK-' || upper(substr(md5(random()::text), 1, 8));
  END IF;
  
  -- Set secure defaults
  NEW.status = COALESCE(NEW.status, 'pending');
  NEW.payment_status = COALESCE(NEW.payment_status, 'pending');
  NEW.currency = COALESCE(NEW.currency, 'USD');
  NEW.created_at = COALESCE(NEW.created_at, now());
  NEW.updated_at = COALESCE(NEW.updated_at, now());
  
  -- Log booking creation for audit trail (without exposing sensitive data)
  PERFORM public.log_enhanced_security_event(
    'BOOKING_CREATED',
    NEW.user_id,
    jsonb_build_object(
      'booking_id', NEW.id,
      'booking_type', NEW.booking_type,
      'booking_reference', NEW.booking_reference,
      'timestamp', now()
    ),
    'medium'
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

-- Apply booking validation trigger
DROP TRIGGER IF EXISTS validate_booking_creation_trigger ON public.bookings;
CREATE TRIGGER validate_booking_creation_trigger
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION validate_booking_creation();

-- Create function to prevent booking data tampering
CREATE OR REPLACE FUNCTION prevent_booking_tampering()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent updates to critical immutable fields
  IF OLD.user_id IS DISTINCT FROM NEW.user_id OR
     OLD.booking_reference IS DISTINCT FROM NEW.booking_reference OR
     OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    
    RAISE EXCEPTION 'Cannot modify immutable booking fields after creation';
  END IF;
  
  -- Log booking modifications for audit trail
  IF OLD.status IS DISTINCT FROM NEW.status OR
     OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
    
    PERFORM public.log_enhanced_security_event(
      'BOOKING_STATUS_CHANGED',
      NEW.user_id,
      jsonb_build_object(
        'booking_id', NEW.id,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'old_payment_status', OLD.payment_status,
        'new_payment_status', NEW.payment_status,
        'timestamp', now()
      ),
      'medium'
    );
  END IF;
  
  -- Update the updated_at timestamp
  NEW.updated_at = now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

-- Apply booking tampering prevention
DROP TRIGGER IF EXISTS prevent_booking_tampering_trigger ON public.bookings;
CREATE TRIGGER prevent_booking_tampering_trigger
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION prevent_booking_tampering();

-- Create function for automatic cleanup of old cancelled bookings
CREATE OR REPLACE FUNCTION cleanup_old_cancelled_bookings()
RETURNS void AS $$
BEGIN
  -- Delete cancelled bookings older than 1 year to reduce data exposure
  DELETE FROM public.bookings 
  WHERE status = 'cancelled' 
    AND updated_at < (NOW() - INTERVAL '1 year');
  
  -- Log cleanup for audit trail
  PERFORM public.log_enhanced_security_event(
    'BOOKING_DATA_CLEANUP',
    NULL,
    jsonb_build_object(
      'retention_years', 1,
      'cleanup_timestamp', now(),
      'table', 'bookings'
    ),
    'low'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

-- Ensure user_id is never null (critical for security)
ALTER TABLE public.bookings 
ALTER COLUMN user_id SET NOT NULL;