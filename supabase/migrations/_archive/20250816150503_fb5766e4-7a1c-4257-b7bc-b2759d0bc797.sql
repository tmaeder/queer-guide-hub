-- First add the editor role to the existing app_role enum
ALTER TYPE app_role ADD VALUE 'editor';

-- Create CMS Content Management System with corrected role references

-- First, create enums for content types and statuses
CREATE TYPE cms_content_type AS ENUM (
  'event',
  'space',
  'place', 
  'market',
  'resource',
  'community',
  'news',
  'page',
  'personality'
);

CREATE TYPE cms_workflow_state AS ENUM (
  'draft',
  'review',
  'published',
  'archived'
);

CREATE TYPE cms_visibility_level AS ENUM (
  'public',
  'private',
  'restricted'
);

CREATE TYPE cms_relationship_type AS ENUM (
  'one_to_one',
  'one_to_many',
  'many_to_many'
);

CREATE TYPE cms_media_role AS ENUM (
  'cover',
  'gallery',
  'attachment',
  'avatar',
  'thumbnail'
);

-- Core CMS content table
CREATE TABLE cms_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type cms_content_type NOT NULL,
  slug TEXT NOT NULL,
  title JSONB NOT NULL DEFAULT '{}', -- Localized titles
  description JSONB DEFAULT '{}', -- Localized descriptions
  content_data JSONB NOT NULL DEFAULT '{}', -- Type-specific data
  workflow_state cms_workflow_state NOT NULL DEFAULT 'draft',
  visibility_level cms_visibility_level NOT NULL DEFAULT 'private',
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  published_at TIMESTAMP WITH TIME ZONE,
  published_by UUID REFERENCES auth.users(id),
  
  -- SEO and indexing
  meta_title JSONB DEFAULT '{}',
  meta_description JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  featured_weight INTEGER DEFAULT 0,
  
  -- Soft delete
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by UUID REFERENCES auth.users(id),
  
  -- External integration
  external_ids JSONB DEFAULT '{}', -- {provider: external_id}
  source_metadata JSONB DEFAULT '{}',
  
  UNIQUE(content_type, slug),
  CONSTRAINT valid_slug CHECK (slug ~ '^[a-z0-9\-]+$')
);

-- Content revisions for version history
CREATE TABLE cms_content_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES cms_content(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  title JSONB NOT NULL,
  description JSONB,
  content_data JSONB NOT NULL,
  workflow_state cms_workflow_state NOT NULL,
  visibility_level cms_visibility_level NOT NULL,
  meta_title JSONB,
  meta_description JSONB,
  tags TEXT[],
  
  -- Revision metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  change_summary TEXT,
  
  UNIQUE(content_id, revision_number)
);

-- Content relationships
CREATE TABLE cms_content_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_content_id UUID NOT NULL REFERENCES cms_content(id) ON DELETE CASCADE,
  to_content_id UUID NOT NULL REFERENCES cms_content(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL, -- e.g., 'venue', 'speaker', 'author'
  role_metadata JSONB DEFAULT '{}', -- Additional relationship data
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  UNIQUE(from_content_id, to_content_id, relationship_type)
);

-- Media management
CREATE TABLE cms_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  storage_path TEXT NOT NULL,
  
  -- Media metadata
  alt_text JSONB DEFAULT '{}', -- Localized alt text
  caption JSONB DEFAULT '{}', -- Localized captions
  attribution TEXT,
  license TEXT,
  source_url TEXT,
  author TEXT,
  
  -- Upload info
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES auth.users(id),
  
  -- External source tracking
  external_source TEXT,
  external_id TEXT,
  
  UNIQUE(storage_path)
);

-- Content media associations
CREATE TABLE cms_content_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES cms_content(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES cms_media(id) ON DELETE CASCADE,
  media_role cms_media_role NOT NULL DEFAULT 'gallery',
  sort_order INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(content_id, media_id, media_role)
);

-- External data connectors
CREATE TABLE cms_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL, -- 'wikidata', 'openstreetmap', etc.
  config JSONB NOT NULL DEFAULT '{}',
  mapping_profile JSONB NOT NULL DEFAULT '{}',
  sync_schedule TEXT, -- CRON expression
  last_sync_at TIMESTAMP WITH TIME ZONE,
  next_sync_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Sync jobs tracking
CREATE TABLE cms_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id UUID NOT NULL REFERENCES cms_connectors(id),
  job_type TEXT NOT NULL, -- 'initial_import', 'delta_update', 'enrichment'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
  records_processed INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_details JSONB,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Duplicate detection candidates
CREATE TABLE cms_duplicate_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id_1 UUID NOT NULL REFERENCES cms_content(id) ON DELETE CASCADE,
  content_id_2 UUID NOT NULL REFERENCES cms_content(id) ON DELETE CASCADE,
  similarity_score NUMERIC(3,2) NOT NULL,
  matching_criteria JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'merged', 'not_duplicate', 'deferred'
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  decision_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT valid_similarity_score CHECK (similarity_score >= 0 AND similarity_score <= 1),
  CONSTRAINT different_content CHECK (content_id_1 != content_id_2),
  UNIQUE(content_id_1, content_id_2)
);

-- Content audit log
CREATE TABLE cms_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES cms_content(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'publish', 'archive', 'merge'
  actor_id UUID REFERENCES auth.users(id),
  changes JSONB, -- Before/after diffs
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address INET,
  user_agent TEXT
);

-- Review queue for content needing approval
CREATE TABLE cms_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES cms_content(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL, -- 'publish', 'merge', 'conflict'
  priority INTEGER DEFAULT 0,
  assigned_to UUID REFERENCES auth.users(id),
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id),
  resolution TEXT,
  
  UNIQUE(content_id, review_type)
);

-- Enable RLS on all tables
ALTER TABLE cms_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_content_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_content_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_content_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_duplicate_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_review_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies for content
CREATE POLICY "Public content viewable by all" ON cms_content
  FOR SELECT USING (
    visibility_level = 'public' AND 
    workflow_state = 'published' AND 
    deleted_at IS NULL
  );

CREATE POLICY "Authenticated users can view all non-deleted content" ON cms_content
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND 
    deleted_at IS NULL
  );

CREATE POLICY "Authenticated users can create content" ON cms_content
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Content creators and admins can update" ON cms_content
  FOR UPDATE USING (
    auth.uid() = created_by OR 
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'editor'::app_role)
  );

CREATE POLICY "Admins can delete content" ON cms_content
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for media
CREATE POLICY "Public media viewable by all" ON cms_media
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can upload media" ON cms_media
  FOR INSERT WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Media uploaders and admins can update" ON cms_media
  FOR UPDATE USING (
    auth.uid() = uploaded_by OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

-- RLS Policies for relationships
CREATE POLICY "Relationships viewable by authenticated users" ON cms_content_relationships
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create relationships" ON cms_content_relationships
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- RLS Policies for admin tables
CREATE POLICY "Admins manage connectors" ON cms_connectors
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins view sync jobs" ON cms_sync_jobs
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Editors manage duplicate detection" ON cms_duplicate_candidates
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'editor'::app_role)
  );

CREATE POLICY "Admins view audit logs" ON cms_audit_log
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Editors manage review queue" ON cms_review_queue
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'editor'::app_role)
  );

-- Indexes for performance
CREATE INDEX idx_cms_content_type_state ON cms_content(content_type, workflow_state);
CREATE INDEX idx_cms_content_slug ON cms_content(slug);
CREATE INDEX idx_cms_content_published_at ON cms_content(published_at) WHERE published_at IS NOT NULL;
CREATE INDEX idx_cms_content_featured ON cms_content(featured_weight) WHERE featured_weight > 0;
CREATE INDEX idx_cms_content_tags ON cms_content USING GIN(tags);
CREATE INDEX idx_cms_content_external_ids ON cms_content USING GIN(external_ids);
CREATE INDEX idx_cms_relationships_from ON cms_content_relationships(from_content_id);
CREATE INDEX idx_cms_relationships_to ON cms_content_relationships(to_content_id);
CREATE INDEX idx_cms_media_path ON cms_media(storage_path);
CREATE INDEX idx_cms_duplicates_score ON cms_duplicate_candidates(similarity_score);
CREATE INDEX idx_cms_audit_content ON cms_audit_log(content_id);
CREATE INDEX idx_cms_audit_timestamp ON cms_audit_log(timestamp);

-- Functions for content management
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER cms_content_revision_trigger
  AFTER INSERT OR UPDATE ON cms_content
  FOR EACH ROW EXECUTE FUNCTION cms_create_revision();

-- Function to log content changes
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

  INSERT INTO cms_audit_log (
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER cms_content_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON cms_content
  FOR EACH ROW EXECUTE FUNCTION cms_log_changes();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION cms_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cms_content_timestamp_trigger
  BEFORE UPDATE ON cms_content
  FOR EACH ROW EXECUTE FUNCTION cms_update_timestamp();