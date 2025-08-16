-- Fix security warnings for CMS tables

-- Fix missing policies for cms_content_revisions
CREATE POLICY "Users can view revisions of content they can see" ON cms_content_revisions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM cms_content 
      WHERE cms_content.id = cms_content_revisions.content_id 
      AND (
        (cms_content.visibility_level = 'public' AND cms_content.workflow_state = 'published' AND cms_content.deleted_at IS NULL)
        OR 
        (auth.uid() IS NOT NULL AND cms_content.deleted_at IS NULL)
      )
    )
  );

-- Fix missing policies for cms_content_media
CREATE POLICY "Content media viewable by authenticated users" ON cms_content_media
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Content creators can manage media associations" ON cms_content_media
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM cms_content 
      WHERE cms_content.id = cms_content_media.content_id 
      AND (
        cms_content.created_by = auth.uid() 
        OR has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'editor'::app_role)
      )
    )
  );

-- Fix function search paths
CREATE OR REPLACE FUNCTION cms_create_revision()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO cms_content_revisions (
    content_id, revision_number, title, description, content_data,
    workflow_state, visibility_level, meta_title, meta_description, tags,
    created_by, change_summary
  ) VALUES (
    NEW.id,
    COALESCE((
      SELECT MAX(revision_number) + 1 
      FROM cms_content_revisions 
      WHERE content_id = NEW.id
    ), 1),
    NEW.title, NEW.description, NEW.content_data,
    NEW.workflow_state, NEW.visibility_level, NEW.meta_title, NEW.meta_description, NEW.tags,
    NEW.updated_by, 'Auto-generated revision'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION cms_log_changes()
RETURNS TRIGGER AS $$
DECLARE
  action_type TEXT;
  changes_data JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    action_type := 'create';
    changes_data := jsonb_build_object('new', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    action_type := 'update';
    changes_data := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    action_type := 'delete';
    changes_data := jsonb_build_object('old', to_jsonb(OLD));
  END IF;

  INSERT INTO public.cms_audit_log (
    content_id, action, actor_id, changes, timestamp
  ) VALUES (
    COALESCE(NEW.id, OLD.id),
    action_type,
    auth.uid(),
    changes_data,
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION cms_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';