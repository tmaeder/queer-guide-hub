-- Continue with additional core tables
CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',
  category_id UUID REFERENCES public.marketplace_categories(id),
  seller_id UUID NOT NULL,
  location TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  images TEXT[],
  contact_info JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'sold', 'inactive')),
  views_count INTEGER DEFAULT 0,
  featured BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create marketplace categories table
CREATE TABLE IF NOT EXISTS public.marketplace_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  parent_id UUID REFERENCES public.marketplace_categories(id),
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user bookmarks table
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('venue', 'event', 'article', 'listing', 'tag')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unified tag assignments table
CREATE TABLE IF NOT EXISTS public.unified_tag_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tag_id UUID NOT NULL REFERENCES public.unified_tags(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('venue', 'event', 'article', 'listing', 'profile', 'group')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tag_id, entity_id, entity_type)
);

-- Create venue check-ins table
CREATE TABLE IF NOT EXISTS public.venue_checkins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  note TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tag categories table
CREATE TABLE IF NOT EXISTS public.tag_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add category_id to unified_tags if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'unified_tags' AND column_name = 'category_id') THEN
    ALTER TABLE public.unified_tags ADD COLUMN category_id UUID REFERENCES public.tag_categories(id);
  END IF;
END $$;

-- Enable RLS on all tables
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unified_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies for marketplace_listings
CREATE POLICY "Public can view active marketplace listings"
ON public.marketplace_listings FOR SELECT
USING (status = 'active');

CREATE POLICY "Users can create their own listings"
ON public.marketplace_listings FOR INSERT
WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Users can update their own listings"
ON public.marketplace_listings FOR UPDATE
USING (auth.uid() = seller_id);

-- RLS Policies for marketplace_categories
CREATE POLICY "Public can view marketplace categories"
ON public.marketplace_categories FOR SELECT
USING (true);

-- RLS Policies for bookmarks
CREATE POLICY "Users can manage their own bookmarks"
ON public.bookmarks FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS Policies for unified_tag_assignments
CREATE POLICY "Public can view tag assignments"
ON public.unified_tag_assignments FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can create tag assignments"
ON public.unified_tag_assignments FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- RLS Policies for venue_checkins
CREATE POLICY "Users can view all checkins"
ON public.venue_checkins FOR SELECT
USING (true);

CREATE POLICY "Users can create their own checkins"
ON public.venue_checkins FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own checkins"
ON public.venue_checkins FOR UPDATE
USING (auth.uid() = user_id);

-- RLS Policies for tag_categories
CREATE POLICY "Public can view tag categories"
ON public.tag_categories FOR SELECT
USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_seller_id ON public.marketplace_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_category_id ON public.marketplace_listings(category_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_location ON public.marketplace_listings USING gin(to_tsvector('english', location));
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_entity ON public.bookmarks(user_id, entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_unified_tag_assignments_entity ON public.unified_tag_assignments(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_unified_tag_assignments_tag ON public.unified_tag_assignments(tag_id);
CREATE INDEX IF NOT EXISTS idx_venue_checkins_venue_id ON public.venue_checkins(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_checkins_user_id ON public.venue_checkins(user_id);