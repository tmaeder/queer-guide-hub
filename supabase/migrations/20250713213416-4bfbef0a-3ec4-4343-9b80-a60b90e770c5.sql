-- Create marketplace listings table
CREATE TABLE public.marketplace_listings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- products, services, events, classes, etc.
  subcategory TEXT, -- clothing, jewelry, consulting, etc.
  price DECIMAL(10,2),
  price_type TEXT DEFAULT 'fixed' CHECK (price_type IN ('fixed', 'starting_at', 'negotiable', 'free')),
  currency TEXT DEFAULT 'USD',
  business_name TEXT NOT NULL,
  business_type TEXT, -- online, physical, both
  contact_email TEXT,
  contact_phone TEXT,
  website TEXT,
  social_media JSONB, -- {instagram: '', facebook: '', etc}
  location TEXT, -- city, state for physical businesses
  shipping_available BOOLEAN DEFAULT FALSE,
  shipping_info TEXT,
  tags TEXT[], -- handmade, organic, women-owned, etc.
  images TEXT[], -- array of image URLs
  featured BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'sold_out', 'archived')),
  views_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

-- Create policies for marketplace listings
CREATE POLICY "Listings are viewable by everyone" 
ON public.marketplace_listings 
FOR SELECT 
USING (status = 'active');

CREATE POLICY "Authenticated users can create listings" 
ON public.marketplace_listings 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own listings" 
ON public.marketplace_listings 
FOR UPDATE 
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own listings" 
ON public.marketplace_listings 
FOR DELETE 
USING (auth.uid() = created_by);

-- Create marketplace reviews table
CREATE TABLE public.marketplace_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  content TEXT,
  purchase_verified BOOLEAN DEFAULT FALSE,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(listing_id, user_id) -- One review per user per listing
);

-- Enable RLS on reviews
ALTER TABLE public.marketplace_reviews ENABLE ROW LEVEL SECURITY;

-- Create policies for reviews
CREATE POLICY "Reviews are viewable by everyone" 
ON public.marketplace_reviews 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can create reviews" 
ON public.marketplace_reviews 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reviews" 
ON public.marketplace_reviews 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reviews" 
ON public.marketplace_reviews 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create marketplace favorites table
CREATE TABLE public.marketplace_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(listing_id, user_id)
);

-- Enable RLS on favorites
ALTER TABLE public.marketplace_favorites ENABLE ROW LEVEL SECURITY;

-- Create policies for favorites
CREATE POLICY "Users can view their own favorites" 
ON public.marketplace_favorites 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can manage favorites" 
ON public.marketplace_favorites 
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add triggers for timestamps
CREATE TRIGGER update_marketplace_listings_updated_at
BEFORE UPDATE ON public.marketplace_listings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketplace_reviews_updated_at
BEFORE UPDATE ON public.marketplace_reviews
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_marketplace_listings_category ON public.marketplace_listings(category);
CREATE INDEX idx_marketplace_listings_subcategory ON public.marketplace_listings(subcategory);
CREATE INDEX idx_marketplace_listings_tags ON public.marketplace_listings USING GIN(tags);
CREATE INDEX idx_marketplace_listings_business_name ON public.marketplace_listings(business_name);
CREATE INDEX idx_marketplace_listings_location ON public.marketplace_listings(location);
CREATE INDEX idx_marketplace_listings_featured ON public.marketplace_listings(featured) WHERE featured = true;
CREATE INDEX idx_marketplace_reviews_listing_id ON public.marketplace_reviews(listing_id);
CREATE INDEX idx_marketplace_reviews_rating ON public.marketplace_reviews(rating);
CREATE INDEX idx_marketplace_favorites_user_id ON public.marketplace_favorites(user_id);
CREATE INDEX idx_marketplace_favorites_listing_id ON public.marketplace_favorites(listing_id);