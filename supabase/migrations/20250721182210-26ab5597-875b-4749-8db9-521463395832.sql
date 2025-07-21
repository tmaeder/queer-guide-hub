-- Create event_types table
CREATE TABLE public.event_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  color TEXT DEFAULT '#6366f1',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create event_amenities table
CREATE TABLE public.event_amenities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create event_services table
CREATE TABLE public.event_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_services ENABLE ROW LEVEL SECURITY;

-- RLS Policies for event_types
CREATE POLICY "Event types are viewable by everyone" 
ON public.event_types 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage event types" 
ON public.event_types 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for event_amenities
CREATE POLICY "Event amenities are viewable by everyone" 
ON public.event_amenities 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage event amenities" 
ON public.event_amenities 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for event_services
CREATE POLICY "Event services are viewable by everyone" 
ON public.event_services 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage event services" 
ON public.event_services 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Triggers for updated_at
CREATE TRIGGER update_event_types_updated_at
  BEFORE UPDATE ON public.event_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_event_amenities_updated_at
  BEFORE UPDATE ON public.event_amenities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_event_services_updated_at
  BEFORE UPDATE ON public.event_services
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert sample event types
INSERT INTO public.event_types (name, description, icon, color) VALUES
('Conference', 'Professional conferences and seminars', 'Users', '#3b82f6'),
('Workshop', 'Educational workshops and training sessions', 'Wrench', '#10b981'),
('Networking', 'Professional networking events', 'Network', '#8b5cf6'),
('Social', 'Social gatherings and parties', 'Heart', '#f59e0b'),
('Cultural', 'Cultural events and festivals', 'Music', '#ef4444'),
('Sports', 'Sporting events and competitions', 'Trophy', '#06b6d4'),
('Community', 'Community service and volunteer events', 'Users', '#84cc16'),
('Business', 'Business meetings and corporate events', 'Briefcase', '#6366f1');

-- Insert sample event amenities
INSERT INTO public.event_amenities (name, description, icon, category) VALUES
('WiFi', 'Wireless internet access', 'Wifi', 'Technology'),
('Audio System', 'Professional sound system', 'Volume2', 'Technology'),
('Projector', 'Video projection equipment', 'Monitor', 'Technology'),
('Microphone', 'Audio recording and amplification', 'Mic', 'Technology'),
('Parking', 'On-site parking available', 'Car', 'Accessibility'),
('Wheelchair Access', 'Wheelchair accessible venue', 'Accessibility', 'Accessibility'),
('Air Conditioning', 'Climate controlled environment', 'Wind', 'Comfort'),
('Catering', 'Food and beverage service', 'Coffee', 'Food & Beverage'),
('Bar Service', 'Alcoholic beverage service', 'Wine', 'Food & Beverage'),
('Photography', 'Professional photography service', 'Camera', 'Services');

-- Insert sample event services
INSERT INTO public.event_services (name, description, icon, category) VALUES
('Event Planning', 'Full event planning and coordination', 'Calendar', 'Planning'),
('Registration', 'Event registration and check-in', 'UserCheck', 'Administration'),
('Live Streaming', 'Live video streaming service', 'Video', 'Technology'),
('Translation', 'Real-time translation services', 'Languages', 'Communication'),
('Security', 'Event security and crowd management', 'Shield', 'Safety'),
('Photography', 'Professional event photography', 'Camera', 'Documentation'),
('Videography', 'Professional video recording', 'Video', 'Documentation'),
('Decoration', 'Event decoration and styling', 'Palette', 'Aesthetics'),
('Cleanup', 'Post-event cleanup service', 'Trash2', 'Maintenance'),
('Transportation', 'Guest transportation coordination', 'Bus', 'Logistics');