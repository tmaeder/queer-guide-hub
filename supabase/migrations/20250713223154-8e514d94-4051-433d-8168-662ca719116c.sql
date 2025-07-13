-- Create content management tables

-- Content types enum
CREATE TYPE public.content_type AS ENUM (
  'blog_post',
  'page',
  'legal_document',
  'press_release',
  'about_content'
);

-- Content status enum  
CREATE TYPE public.content_status AS ENUM (
  'draft',
  'published',
  'archived'
);

-- Main content table
CREATE TABLE public.content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content_type public.content_type NOT NULL,
  status public.content_status NOT NULL DEFAULT 'draft',
  excerpt TEXT,
  content TEXT NOT NULL,
  meta_description TEXT,
  meta_keywords TEXT[],
  featured_image TEXT,
  author_id UUID,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  seo_data JSONB DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}'
);

-- Content categories table
CREATE TABLE public.content_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Content tags table (separate from existing tags)
CREATE TABLE public.content_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Junction table for content-category relationships
CREATE TABLE public.content_category_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.content_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(content_id, category_id)
);

-- Junction table for content-tag relationships
CREATE TABLE public.content_tag_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.content_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(content_id, tag_id)
);

-- Content revisions for version history
CREATE TABLE public.content_revisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  revision_number INTEGER NOT NULL,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_category_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_revisions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for content
CREATE POLICY "Published content is viewable by everyone" 
ON public.content FOR SELECT 
USING (status = 'published');

CREATE POLICY "Authenticated users can view all content" 
ON public.content FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create content" 
ON public.content FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update their own content" 
ON public.content FOR UPDATE 
TO authenticated
USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete their own content" 
ON public.content FOR DELETE 
TO authenticated
USING (auth.uid() = author_id);

-- RLS Policies for categories (public read, authenticated write)
CREATE POLICY "Categories are viewable by everyone" 
ON public.content_categories FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can manage categories" 
ON public.content_categories FOR ALL 
TO authenticated
USING (true);

-- RLS Policies for tags (public read, authenticated write)
CREATE POLICY "Content tags are viewable by everyone" 
ON public.content_tags FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can manage content tags" 
ON public.content_tags FOR ALL 
TO authenticated
USING (true);

-- RLS Policies for assignments (follow content permissions)
CREATE POLICY "Category assignments follow content visibility" 
ON public.content_category_assignments FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.content 
    WHERE content.id = content_category_assignments.content_id 
    AND (content.status = 'published' OR auth.uid() = content.author_id)
  )
);

CREATE POLICY "Authenticated users can manage category assignments" 
ON public.content_category_assignments FOR ALL 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.content 
    WHERE content.id = content_category_assignments.content_id 
    AND auth.uid() = content.author_id
  )
);

CREATE POLICY "Tag assignments follow content visibility" 
ON public.content_tag_assignments FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.content 
    WHERE content.id = content_tag_assignments.content_id 
    AND (content.status = 'published' OR auth.uid() = content.author_id)
  )
);

CREATE POLICY "Authenticated users can manage tag assignments" 
ON public.content_tag_assignments FOR ALL 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.content 
    WHERE content.id = content_tag_assignments.content_id 
    AND auth.uid() = content.author_id
  )
);

-- RLS Policies for revisions
CREATE POLICY "Authors can view revisions of their content" 
ON public.content_revisions FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.content 
    WHERE content.id = content_revisions.content_id 
    AND auth.uid() = content.author_id
  )
);

CREATE POLICY "Authors can create revisions for their content" 
ON public.content_revisions FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.content 
    WHERE content.id = content_revisions.content_id 
    AND auth.uid() = content.author_id
  )
);

-- Create indexes for performance
CREATE INDEX idx_content_slug ON public.content(slug);
CREATE INDEX idx_content_type ON public.content(content_type);
CREATE INDEX idx_content_status ON public.content(status);
CREATE INDEX idx_content_published_at ON public.content(published_at);
CREATE INDEX idx_content_author ON public.content(author_id);
CREATE INDEX idx_content_categories_slug ON public.content_categories(slug);
CREATE INDEX idx_content_tags_slug ON public.content_tags(slug);

-- Create triggers for updated_at
CREATE TRIGGER update_content_updated_at
  BEFORE UPDATE ON public.content
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_content_categories_updated_at
  BEFORE UPDATE ON public.content_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default categories
INSERT INTO public.content_categories (name, slug, description, color) VALUES
('Technology', 'technology', 'Articles about technology and innovation', '#3b82f6'),
('Community', 'community', 'Community stories and features', '#8b5cf6'),
('Safety', 'safety', 'Safety guides and information', '#ef4444'),
('Business', 'business', 'Business and marketplace content', '#10b981'),
('Events', 'events', 'Event coverage and announcements', '#f59e0b'),
('Legal', 'legal', 'Legal documents and policies', '#6b7280');

-- Insert default tags
INSERT INTO public.content_tags (name, slug) VALUES
('LGBTQ+', 'lgbtq'),
('Safety', 'safety'),
('Community', 'community'),
('Technology', 'technology'),
('Business', 'business'),
('Events', 'events'),
('Guide', 'guide'),
('Tips', 'tips'),
('News', 'news'),
('Updates', 'updates');

-- Insert sample blog content
INSERT INTO public.content (
  title, 
  slug, 
  content_type, 
  status, 
  excerpt, 
  content, 
  meta_description,
  published_at
) VALUES
(
  'Building Safer Spaces: How We Verify LGBTQ+ Friendly Venues',
  'building-safer-spaces-venue-verification',
  'blog_post',
  'published',
  'A deep dive into our verification process and why it matters for community safety.',
  '<h2>Our Commitment to Safety</h2><p>At The Queer Guide, safety isn''t just a feature—it''s our foundation. Every venue, event, and business listed on our platform goes through a rigorous verification process designed to ensure that LGBTQ+ individuals can trust the spaces they''re entering.</p><h2>The Verification Process</h2><p>Our verification process involves multiple steps and stakeholders...</p>',
  'Learn about The Queer Guide''s comprehensive venue verification process for LGBTQ+ safety.',
  now()
),
(
  'Terms of Service',
  'terms-of-service',
  'legal_document',
  'published',
  'Terms of Service for The Queer Guide platform.',
  '<h2>1. Acceptance of Terms</h2><p>By accessing and using The Queer Guide ("the Service"), you accept and agree to be bound by the terms and provision of this agreement.</p>',
  'Terms of Service for The Queer Guide platform',
  now()
);