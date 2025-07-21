-- Create venue categories table
CREATE TABLE IF NOT EXISTS public.venue_categories (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT,
    color TEXT DEFAULT '#6366f1',
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create venue amenities table
CREATE TABLE IF NOT EXISTS public.venue_amenities (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT,
    category TEXT DEFAULT 'general',
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create venue services table
CREATE TABLE IF NOT EXISTS public.venue_services (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT,
    category TEXT DEFAULT 'general',
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.venue_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_services ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for venue categories
CREATE POLICY "Venue categories are viewable by everyone" 
ON public.venue_categories 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage venue categories" 
ON public.venue_categories 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create RLS policies for venue amenities
CREATE POLICY "Venue amenities are viewable by everyone" 
ON public.venue_amenities 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage venue amenities" 
ON public.venue_amenities 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create RLS policies for venue services
CREATE POLICY "Venue services are viewable by everyone" 
ON public.venue_services 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage venue services" 
ON public.venue_services 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add triggers for updated_at
CREATE TRIGGER update_venue_categories_updated_at
    BEFORE UPDATE ON public.venue_categories
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_venue_amenities_updated_at
    BEFORE UPDATE ON public.venue_amenities
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_venue_services_updated_at
    BEFORE UPDATE ON public.venue_services
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some sample data for venue categories
INSERT INTO public.venue_categories (name, slug, description, icon, color) VALUES
('Restaurants & Dining', 'restaurants-dining', 'Restaurants, cafes, bars, and dining establishments', 'UtensilsCrossed', '#ef4444'),
('Entertainment & Nightlife', 'entertainment-nightlife', 'Clubs, bars, lounges, and entertainment venues', 'Music', '#8b5cf6'),
('Health & Wellness', 'health-wellness', 'Gyms, spas, wellness centers, and health services', 'Heart', '#10b981'),
('Retail & Shopping', 'retail-shopping', 'Stores, boutiques, and shopping centers', 'ShoppingBag', '#f59e0b'),
('Professional Services', 'professional-services', 'Legal, financial, consulting, and professional services', 'Briefcase', '#3b82f6'),
('Community Centers', 'community-centers', 'Community centers, libraries, and public spaces', 'Building2', '#6366f1'),
('Accommodation', 'accommodation', 'Hotels, B&Bs, and lodging facilities', 'Hotel', '#ec4899'),
('Arts & Culture', 'arts-culture', 'Museums, galleries, theaters, and cultural venues', 'Palette', '#f97316')
ON CONFLICT (slug) DO NOTHING;

-- Insert some sample data for venue amenities
INSERT INTO public.venue_amenities (name, slug, description, icon, category) VALUES
('WiFi', 'wifi', 'Free wireless internet access', 'Wifi', 'connectivity'),
('Parking', 'parking', 'On-site parking available', 'Car', 'accessibility'),
('Wheelchair Accessible', 'wheelchair-accessible', 'Fully accessible for wheelchair users', 'Accessibility', 'accessibility'),
('Air Conditioning', 'air-conditioning', 'Climate controlled environment', 'Wind', 'comfort'),
('Outdoor Seating', 'outdoor-seating', 'Patio or outdoor dining area', 'Trees', 'seating'),
('Pet Friendly', 'pet-friendly', 'Pets welcome', 'Heart', 'policies'),
('Live Music', 'live-music', 'Regular live music performances', 'Music', 'entertainment'),
('Private Rooms', 'private-rooms', 'Private dining or meeting rooms available', 'Door', 'seating'),
('Delivery Available', 'delivery-available', 'Food delivery service', 'Truck', 'services'),
('Takeout Available', 'takeout-available', 'Takeout orders accepted', 'Package', 'services'),
('Reservations Required', 'reservations-required', 'Advance reservations needed', 'Calendar', 'policies'),
('Credit Cards Accepted', 'credit-cards-accepted', 'Accepts major credit cards', 'CreditCard', 'payment'),
('Cash Only', 'cash-only', 'Cash payments only', 'Banknote', 'payment'),
('Group Friendly', 'group-friendly', 'Accommodates large groups', 'Users', 'policies'),
('LGBTQ+ Safe Space', 'lgbtq-safe-space', 'Certified LGBTQ+ friendly environment', 'Rainbow', 'safety')
ON CONFLICT (slug) DO NOTHING;

-- Insert some sample data for venue services
INSERT INTO public.venue_services (name, slug, description, icon, category) VALUES
('Dine-In', 'dine-in', 'Table service dining', 'UtensilsCrossed', 'dining'),
('Takeout', 'takeout', 'Food to-go service', 'Package', 'dining'),
('Delivery', 'delivery', 'Food delivery service', 'Truck', 'dining'),
('Catering', 'catering', 'Event and party catering', 'ChefHat', 'dining'),
('Private Events', 'private-events', 'Private party and event hosting', 'CalendarDays', 'events'),
('Meeting Rooms', 'meeting-rooms', 'Business meeting facilities', 'Presentation', 'business'),
('Event Planning', 'event-planning', 'Full event planning services', 'Calendar', 'events'),
('Entertainment', 'entertainment', 'Live entertainment and shows', 'Music', 'entertainment'),
('Shopping', 'shopping', 'Retail shopping services', 'ShoppingBag', 'retail'),
('Personal Training', 'personal-training', 'One-on-one fitness training', 'Dumbbell', 'fitness'),
('Group Classes', 'group-classes', 'Fitness and wellness group classes', 'Users', 'fitness'),
('Spa Services', 'spa-services', 'Massage, facials, and spa treatments', 'Sparkles', 'wellness'),
('Hair Services', 'hair-services', 'Hair styling and grooming', 'Scissors', 'beauty'),
('Legal Consultation', 'legal-consultation', 'Legal advice and representation', 'Scale', 'professional'),
('Financial Planning', 'financial-planning', 'Financial advisory services', 'TrendingUp', 'professional')
ON CONFLICT (slug) DO NOTHING;