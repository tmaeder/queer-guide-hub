-- Consolidate multiple permissive RLS policies for performance optimization
-- This combines multiple policies for the same table/role/action into single policies with OR logic

-- Table: public.accessibility_attributes | Role: anon | Action: SELECT
DROP POLICY IF EXISTS "Accessibility attributes public read" ON public.accessibility_attributes;
DROP POLICY IF EXISTS "Admins can manage accessibility attributes" ON public.accessibility_attributes;

CREATE POLICY "Combined SELECT policy for accessibility_attributes" ON public.accessibility_attributes
FOR SELECT TO anon, authenticated
USING (
  -- Accessibility attributes public read
  true
  OR
  -- Admins can manage accessibility attributes  
  has_role((SELECT auth.uid()), 'admin'::app_role)
);

-- Table: public.attributes | Role: anon | Action: SELECT
DROP POLICY IF EXISTS "Admins can manage attributes" ON public.attributes;
DROP POLICY IF EXISTS "Attributes are viewable by everyone" ON public.attributes;

CREATE POLICY "Combined SELECT policy for attributes" ON public.attributes
FOR SELECT TO anon, authenticated
USING (
  -- Attributes are viewable by everyone
  true
  OR
  -- Admins can manage attributes
  has_role((SELECT auth.uid()), 'admin'::app_role)
);

-- Table: public.comment_likes | Role: anon | Action: SELECT
DROP POLICY IF EXISTS "Comment likes access control" ON public.comment_likes;
DROP POLICY IF EXISTS "Comment likes are viewable by everyone" ON public.comment_likes;

CREATE POLICY "Combined SELECT policy for comment_likes" ON public.comment_likes
FOR SELECT TO anon, authenticated
USING (
  -- Comment likes are viewable by everyone
  true
  OR
  -- Comment likes access control
  (SELECT auth.uid()) = user_id
);

-- Table: public.community_groups | Role: anon | Action: SELECT
DROP POLICY IF EXISTS "Private groups are viewable by members" ON public.community_groups;
DROP POLICY IF EXISTS "Public groups are viewable by everyone" ON public.community_groups;
DROP POLICY IF EXISTS "Users can view their own groups" ON public.community_groups;

CREATE POLICY "Combined SELECT policy for community_groups" ON public.community_groups
FOR SELECT TO anon, authenticated
USING (
  -- Public groups are viewable by everyone
  (is_private = false)
  OR
  -- Private groups are viewable by members
  ((is_private = true) AND (((SELECT auth.uid()) = created_by) OR is_group_member_or_admin(id, false)))
  OR
  -- Users can view their own groups
  ((SELECT auth.uid()) = created_by)
);

-- Table: public.content_embeddings | Role: anon | Action: SELECT
DROP POLICY IF EXISTS "Admins can manage content embeddings" ON public.content_embeddings;
DROP POLICY IF EXISTS "Content embeddings are viewable by everyone" ON public.content_embeddings;

CREATE POLICY "Combined SELECT policy for content_embeddings" ON public.content_embeddings
FOR SELECT TO anon, authenticated
USING (
  -- Content embeddings are viewable by everyone
  true
  OR
  -- Admins can manage content embeddings
  has_role((SELECT auth.uid()), 'admin'::app_role)
);

-- Table: public.conversation_participants | Role: anon | Action: SELECT
DROP POLICY IF EXISTS "Users can view other participants in their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can view their own participant records" ON public.conversation_participants;

CREATE POLICY "Combined SELECT policy for conversation_participants" ON public.conversation_participants
FOR SELECT TO anon, authenticated
USING (
  -- Users can view their own participant records
  (user_id = (SELECT auth.uid()))
  OR
  -- Users can view other participants in their conversations
  is_conversation_participant(conversation_id, (SELECT auth.uid()))
);

-- Table: public.donations | Role: anon | Action: INSERT
DROP POLICY IF EXISTS "Admins can manage donations for legal compliance" ON public.donations;
DROP POLICY IF EXISTS "System can create donations" ON public.donations;

CREATE POLICY "Combined INSERT policy for donations" ON public.donations
FOR INSERT TO anon, authenticated
WITH CHECK (
  -- System can create donations
  true
  OR
  -- Admins can manage donations for legal compliance
  has_role((SELECT auth.uid()), 'admin'::app_role)
);

-- Table: public.donations | Role: anon | Action: SELECT
DROP POLICY IF EXISTS "Donations are viewable by admins" ON public.donations;
DROP POLICY IF EXISTS "Donors can view their own donations" ON public.donations;
DROP POLICY IF EXISTS "Restricted donation access" ON public.donations;
DROP POLICY IF EXISTS "Users can view their own donations" ON public.donations;

CREATE POLICY "Combined SELECT policy for donations" ON public.donations
FOR SELECT TO anon, authenticated
USING (
  -- Donors/Users can view their own donations
  (user_id = (SELECT auth.uid()))
  OR
  -- Admins can view donations (with security logging)
  (has_role((SELECT auth.uid()), 'admin'::app_role) AND ((SELECT log_enhanced_security_event('ADMIN_DONATION_ACCESS'::text, (SELECT auth.uid()), jsonb_build_object('accessed_donation', donations.id, 'donor_data_access', true), 'critical'::text)) IS NOT NULL))
);

-- Table: public.donations | Role: anon | Action: UPDATE
DROP POLICY IF EXISTS "System can update donations" ON public.donations;

CREATE POLICY "Combined UPDATE policy for donations" ON public.donations
FOR UPDATE TO anon, authenticated
USING (
  -- System can update donations
  true
  OR
  -- Admins can manage donations for legal compliance
  has_role((SELECT auth.uid()), 'admin'::app_role)
)
WITH CHECK (
  -- System can update donations
  true
  OR
  -- Admins can manage donations for legal compliance
  has_role((SELECT auth.uid()), 'admin'::app_role)
);

-- Table: public.email_templates | Role: anon | Action: SELECT
DROP POLICY IF EXISTS "Admins can manage email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Email templates are viewable by admins" ON public.email_templates;

CREATE POLICY "Combined SELECT policy for email_templates" ON public.email_templates
FOR SELECT TO anon, authenticated
USING (
  -- Email templates are viewable by admins / Admins can manage email templates
  has_role((SELECT auth.uid()), 'admin'::app_role)
);