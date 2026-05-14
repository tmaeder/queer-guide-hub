-- Create city_favorites table
CREATE TABLE IF NOT EXISTS public.city_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  city_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, city_id)
);

-- Enable RLS on city_favorites
ALTER TABLE public.city_favorites ENABLE ROW LEVEL SECURITY;

-- Create policies for city_favorites
CREATE POLICY "Users can manage their own city favorites" 
ON public.city_favorites 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create country_favorites table  
CREATE TABLE IF NOT EXISTS public.country_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  country_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, country_id)
);

-- Enable RLS on country_favorites
ALTER TABLE public.country_favorites ENABLE ROW LEVEL SECURITY;

-- Create policies for country_favorites
CREATE POLICY "Users can manage their own country favorites" 
ON public.country_favorites 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);