-- Create queer personalities table
CREATE TABLE public.personalities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  pronouns TEXT,
  description TEXT,
  bio TEXT,
  birth_date DATE,
  death_date DATE,
  is_living BOOLEAN DEFAULT true,
  profession TEXT,
  fields JSONB DEFAULT '[]'::JSONB, -- e.g., ["activism", "arts", "politics", "sports"]
  achievements JSONB DEFAULT '[]'::JSONB,
  image_url TEXT,
  social_links JSONB DEFAULT '{}'::JSONB,
  website_url TEXT,
  nationality TEXT,
  birth_place TEXT,
  tags TEXT[] DEFAULT '{}',
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'disputed')),
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'draft')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  view_count INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT false
);

-- Enable RLS
ALTER TABLE public.personalities ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public personalities are viewable by everyone"
ON public.personalities
FOR SELECT
USING (visibility = 'public');

CREATE POLICY "Users can view their own personalities"
ON public.personalities
FOR SELECT
USING (auth.uid() = created_by);

CREATE POLICY "Authenticated users can create personalities"
ON public.personalities
FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own personalities"
ON public.personalities
FOR UPDATE
USING (auth.uid() = created_by);

CREATE POLICY "Admins can manage all personalities"
ON public.personalities
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create function to update view count
CREATE OR REPLACE FUNCTION public.increment_personality_views(personality_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.personalities 
  SET view_count = view_count + 1,
      updated_at = now()
  WHERE id = personality_id;
$$;

-- Create indexes for better performance
CREATE INDEX idx_personalities_fields ON public.personalities USING GIN(fields);
CREATE INDEX idx_personalities_tags ON public.personalities USING GIN(tags);
CREATE INDEX idx_personalities_verification_status ON public.personalities(verification_status);
CREATE INDEX idx_personalities_visibility ON public.personalities(visibility);
CREATE INDEX idx_personalities_is_featured ON public.personalities(is_featured);
CREATE INDEX idx_personalities_name ON public.personalities(name);

-- Create trigger for updating timestamps
CREATE TRIGGER update_personalities_updated_at
BEFORE UPDATE ON public.personalities
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();