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
CREATE POLICY "Secure notifications UPDATE - recipients only" 
ON public.notifications 
FOR UPDATE 
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

-- 4. DELETE: Users can delete their own notifications
CREATE POLICY "Secure notifications DELETE - recipients only" 
ON public.notifications 
FOR DELETE 
USING (user_id = (SELECT auth.uid()));

-- Add performance indexes for user-specific queries
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
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

-- Apply notification validation trigger
DROP TRIGGER IF EXISTS validate_notification_creation_trigger ON public.notifications;
CREATE TRIGGER validate_notification_creation_trigger
  BEFORE INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION validate_notification_creation();

-- Create function to prevent notification content tampering
CREATE OR REPLACE FUNCTION prevent_notification_tampering()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent updates to critical fields (only allow read status changes)
  IF OLD.user_id IS DISTINCT FROM NEW.user_id OR
     OLD.type IS DISTINCT FROM NEW.type OR
     OLD.title IS DISTINCT FROM NEW.title OR
     OLD.content IS DISTINCT FROM NEW.content OR
     OLD.action_url IS DISTINCT FROM NEW.action_url OR
     OLD.related_id IS DISTINCT FROM NEW.related_id OR
     OLD.metadata IS DISTINCT FROM NEW.metadata OR
     OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    
    RAISE EXCEPTION 'Cannot modify notification content after creation';
  END IF;
  
  -- Update the updated_at timestamp
  NEW.updated_at = now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

-- Apply notification tampering prevention
DROP TRIGGER IF EXISTS prevent_notification_tampering_trigger ON public.notifications;
CREATE TRIGGER prevent_notification_tampering_trigger
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION prevent_notification_tampering();

-- Ensure user_id is never null (critical for security)
ALTER TABLE public.notifications 
ALTER COLUMN user_id SET NOT NULL;