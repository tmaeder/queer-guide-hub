-- Create accessibility attributes table
CREATE TABLE public.accessibility_attributes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT DEFAULT 'general',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create target groups table
CREATE TABLE public.target_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT DEFAULT '#6366f1',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.accessibility_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_groups ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for accessibility attributes
CREATE POLICY "Accessibility attributes are viewable by everyone" 
ON public.accessibility_attributes 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage accessibility attributes" 
ON public.accessibility_attributes 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create RLS policies for target groups
CREATE POLICY "Target groups are viewable by everyone" 
ON public.target_groups 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage target groups" 
ON public.target_groups 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add triggers for updated_at
CREATE TRIGGER update_accessibility_attributes_updated_at
BEFORE UPDATE ON public.accessibility_attributes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_target_groups_updated_at
BEFORE UPDATE ON public.target_groups
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add accessibility and target group columns to events table
ALTER TABLE public.events 
ADD COLUMN accessibility_attributes TEXT[] DEFAULT '{}',
ADD COLUMN target_groups TEXT[] DEFAULT '{}',
ADD COLUMN accessibility_notes TEXT;

-- Add accessibility and target group columns to venues table
ALTER TABLE public.venues 
ADD COLUMN accessibility_attributes TEXT[] DEFAULT '{}',
ADD COLUMN target_groups TEXT[] DEFAULT '{}',
ADD COLUMN accessibility_notes TEXT;

-- Insert sample accessibility attributes
INSERT INTO public.accessibility_attributes (name, description, icon, category, sort_order) VALUES
('Wheelchair Accessible', 'Venue/event is accessible for wheelchair users', 'wheelchair', 'mobility', 1),
('Accessible Parking', 'Designated accessible parking spaces available', 'car', 'mobility', 2),
('Accessible Restrooms', 'Restrooms designed for accessibility', 'restroom', 'mobility', 3),
('Elevator Access', 'Elevator available for multi-level access', 'elevator', 'mobility', 4),
('Ramp Access', 'Ramps available for easy access', 'ramp', 'mobility', 5),
('Sign Language Interpretation', 'Sign language interpreters available', 'sign-language', 'hearing', 6),
('Audio Description', 'Audio descriptions provided for visual content', 'audio', 'visual', 7),
('Large Print Materials', 'Materials available in large print', 'print', 'visual', 8),
('Braille Materials', 'Materials available in Braille', 'braille', 'visual', 9),
('Quiet Space Available', 'Designated quiet spaces for sensory breaks', 'quiet', 'sensory', 10),
('Service Animals Welcome', 'Service animals are welcome', 'dog', 'general', 11),
('Accessible Seating', 'Designated accessible seating areas', 'seat', 'mobility', 12);

-- Insert sample target groups
INSERT INTO public.target_groups (name, description, icon, color, sort_order) VALUES
('LGBTQ+ Community', 'Events and venues welcoming to LGBTQ+ individuals', 'rainbow', '#ff6b6b', 1),
('Families', 'Family-friendly events and venues', 'users', '#4ecdc4', 2),
('Students', 'Targeted towards students and young adults', 'graduation-cap', '#45b7d1', 3),
('Seniors', 'Designed for senior community members', 'heart', '#96ceb4', 4),
('Professionals', 'Business and professional networking', 'briefcase', '#6c5ce7', 5),
('Artists & Creatives', 'For artists, musicians, and creative professionals', 'palette', '#fd79a8', 6),
('Sports Enthusiasts', 'Sports and fitness focused', 'activity', '#fdcb6e', 7),
('Tech Community', 'Technology and innovation focused', 'computer', '#00b894', 8),
('Women', 'Events specifically for women', 'user', '#e17055', 9),
('Youth', 'Targeted towards children and teenagers', 'smile', '#74b9ff', 10),
('Entrepreneurs', 'For business owners and startup community', 'trending-up', '#a29bfe', 11),
('Health & Wellness', 'Focus on health, wellness, and mindfulness', 'heart-pulse', '#fd79a8', 12);