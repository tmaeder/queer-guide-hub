-- Create security_events table for security monitoring
CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- Create policies for security_events
CREATE POLICY "Admin users can view all security events"
  ON public.security_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "System can insert security events"
  ON public.security_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create security_monitoring table for critical alerts
CREATE TABLE IF NOT EXISTS public.security_monitoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  metadata JSONB DEFAULT '{}',
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.security_monitoring ENABLE ROW LEVEL SECURITY;

-- Create policies for security_monitoring
CREATE POLICY "Admin users can manage security monitoring"
  ON public.security_monitoring
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Create function to log enhanced security events
CREATE OR REPLACE FUNCTION public.log_enhanced_security_event(
  p_event_type TEXT,
  p_user_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_severity TEXT DEFAULT 'medium'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  event_id UUID;
BEGIN
  -- Generate event ID
  event_id := gen_random_uuid();
  
  -- Insert into security_events table
  INSERT INTO public.security_events (
    id,
    event_type,
    user_id,
    metadata,
    created_at
  ) VALUES (
    event_id,
    p_event_type,
    COALESCE(p_user_id, auth.uid()),
    p_metadata || jsonb_build_object(
      'severity', p_severity,
      'timestamp', NOW(),
      'ip_address', current_setting('request.headers', true)::json->>'x-forwarded-for'
    ),
    NOW()
  );
  
  -- For critical events, also add to monitoring
  IF p_severity = 'critical' THEN
    INSERT INTO public.security_monitoring (
      id,
      event_type,
      severity,
      metadata
    ) VALUES (
      gen_random_uuid(),
      'SECURITY_INCIDENT_' || p_event_type,
      p_severity,
      p_metadata || jsonb_build_object(
        'incident_id', event_id,
        'requires_immediate_action', true
      )
    );
  END IF;
  
  RETURN event_id;
END;
$$;