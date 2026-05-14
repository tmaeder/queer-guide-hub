-- Create venues table
CREATE TABLE public.venues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT,
  country TEXT NOT NULL DEFAULT 'US',
  postal_code TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  phone TEXT,
  website TEXT,
  email TEXT,
  instagram TEXT,
  category TEXT NOT NULL, -- bar, restaurant, cafe, club, hotel, etc.
  tags TEXT[], -- lgbt-friendly, trans-friendly, drag-shows, etc.
  amenities TEXT[], -- wifi, parking, wheelchair-accessible, etc.
  price_range INTEGER CHECK (price_range >= 1 AND price_range <= 4), -- 1-4 dollar signs
  hours JSONB, -- opening hours for each day
  images TEXT[], -- array of image URLs
  verified BOOLEAN DEFAULT FALSE,
  featured BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

-- Create policies for venues
CREATE POLICY "Venues are viewable by everyone" 
ON public.venues 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can create venues" 
ON public.venues 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own venues" 
ON public.venues 
FOR UPDATE 
USING (auth.uid() = created_by OR EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND is_business = true
));

-- Create venue reviews table
CREATE TABLE public.venue_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  content TEXT,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(venue_id, user_id) -- One review per user per venue
);

-- Enable RLS on reviews
ALTER TABLE public.venue_reviews ENABLE ROW LEVEL SECURITY;

-- Create policies for reviews
CREATE POLICY "Reviews are viewable by everyone" 
ON public.venue_reviews 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can create reviews" 
ON public.venue_reviews 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reviews" 
ON public.venue_reviews 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reviews" 
ON public.venue_reviews 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add triggers for timestamps
CREATE TRIGGER update_venues_updated_at
BEFORE UPDATE ON public.venues
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_venue_reviews_updated_at
BEFORE UPDATE ON public.venue_reviews
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_venues_city ON public.venues(city);
CREATE INDEX idx_venues_category ON public.venues(category);
CREATE INDEX idx_venues_tags ON public.venues USING GIN(tags);
CREATE INDEX idx_venues_location ON public.venues(latitude, longitude);
CREATE INDEX idx_venue_reviews_venue_id ON public.venue_reviews(venue_id);
CREATE INDEX idx_venue_reviews_rating ON public.venue_reviews(rating);