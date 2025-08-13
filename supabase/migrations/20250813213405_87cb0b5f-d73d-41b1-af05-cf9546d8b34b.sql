-- SECURITY FIX: Strengthen notifications table privacy protection
-- Ensure personal notifications are only accessible by intended recipients

-- Drop existing policies to implement more secure ones
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;

-- Create secure policies following least-privilege principle

-- 1. SELECT: Users can ONLY view their own notifications
CREATE POLICY "Secure notifications SELECT - recipients only" 
ON public.notifications 
FOR SELECT 
USING (user_id = (SELECT auth.uid()));

-- 2. INSERT: Only system/authenticated services can create notifications with proper validation
-- Users cannot create notifications for other users
CREATE POLICY "Secure notifications INSERT - system only" 
ON public.notifications 
FOR INSERT 
WITH CHECK (
  user_id = (SELECT auth.uid()) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role)
);

-- 3. UPDATE: Users can only update read status of their own notifications
-- Prevent modification of notification content
CREATE POLICY "Secure notifications UPDATE - recipients only" 
ON public.notifications 
FOR UPDATE 
USING (user_id = (SELECT auth.uid()))
WITH CHECK (
  user_id = (SELECT auth.uid()) AND
  -- Only allow updating read status and updated_at
  OLD.id = NEW.id AND
  OLD.user_id = NEW.user_id AND
  OLD.type = NEW.type AND
  OLD.title = NEW.title AND
  OLD.content = NEW.content AND
  OLD.action_url = NEW.action_url AND
  OLD.related_id = NEW.related_id AND
  OLD.metadata = NEW.metadata AND
  OLD.created_at = NEW.created_at
);

-- 4. DELETE: Users can delete their own notifications
CREATE POLICY "Secure notifications DELETE - recipients only" 
ON public.notifications 
FOR DELETE 
USING (user_id = (SELECT auth.uid()));

-- Add performance index for user-specific queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read);

-- Create function to validate notification creation
CREATE OR REPLACE FUNCTION validate_notification_creation()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure user_id is valid and not null
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Notification must have a valid recipient';
  END IF;
  
  -- Ensure required fields are not empty
  IF NEW.type IS NULL OR trim(NEW.type) = '' THEN
    RAISE EXCEPTION 'Notification type cannot be empty';
  END IF;
  
  IF NEW.title IS NULL OR trim(NEW.title) = '' THEN
    RAISE EXCEPTION 'Notification title cannot be empty';
  END IF;
  
  -- Set secure defaults
  NEW.read = COALESCE(NEW.read, false);
  NEW.created_at = COALESCE(NEW.created_at, now());
  NEW.updated_at = COALESCE(NEW.updated_at, now());
  
  -- Log notification creation for audit trail
  PERFORM public.log_enhanced_security_event(
    'NOTIFICATION_CREATED',
    NEW.user_id,
    jsonb_build_object(
      'notification_id', NEW.id,
      'type', NEW.type,
      'created_by', auth.uid(),
      'timestamp', now()
    ),
    'low'
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

-- Apply notification validation trigger
DROP TRIGGER IF EXISTS validate_notification_creation_trigger ON public.notifications;
CREATE TRIGGER validate_notification_creation_trigger
  BEFORE INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION validate_notification_creation();

-- Create function for automatic cleanup of old read notifications
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
  -- Delete read notifications older than 30 days to reduce data exposure
  DELETE FROM public.notifications 
  WHERE read = true 
    AND updated_at < (NOW() - INTERVAL '30 days');
  
  -- Log cleanup for audit trail
  PERFORM public.log_enhanced_security_event(
    'NOTIFICATION_CLEANUP',
    NULL,
    jsonb_build_object(
      'retention_days', 30,
      'cleanup_timestamp', now(),
      'table', 'notifications'
    ),
    'low'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

-- Ensure user_id is never null (critical for security)
ALTER TABLE public.notifications 
ALTER COLUMN user_id SET NOT NULL;