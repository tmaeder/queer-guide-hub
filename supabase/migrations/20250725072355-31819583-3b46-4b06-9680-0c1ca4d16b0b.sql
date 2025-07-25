-- Core User & Profile Schema Changes

-- Add verification_status and current_mode to profiles table
ALTER TABLE public.profiles 
ADD COLUMN verification_status VARCHAR(50) DEFAULT 'unverified',
ADD COLUMN current_mode VARCHAR(50) DEFAULT 'social';

-- Add check constraints for valid values
ALTER TABLE public.profiles 
ADD CONSTRAINT check_verification_status 
CHECK (verification_status IN ('unverified', 'email_verified', 'community_vouched', 'id_verified'));

ALTER TABLE public.profiles 
ADD CONSTRAINT check_current_mode 
CHECK (current_mode IN ('social', 'support_needed'));

-- Create user_connections table to replace simple follow/friend model
CREATE TABLE public.user_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_one_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_two_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL DEFAULT 'acquaintance',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_one_id, user_two_id)
);

-- Add check constraints for valid connection types and statuses
ALTER TABLE public.user_connections 
ADD CONSTRAINT check_connection_type 
CHECK (type IN ('trusted_contact', 'emergency_contact', 'acquaintance', 'blocked'));

ALTER TABLE public.user_connections 
ADD CONSTRAINT check_connection_status 
CHECK (status IN ('pending', 'accepted'));

-- Prevent self-connections
ALTER TABLE public.user_connections 
ADD CONSTRAINT check_no_self_connection 
CHECK (user_one_id != user_two_id);

-- Enable RLS on user_connections
ALTER TABLE public.user_connections ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_connections
CREATE POLICY "Users can view their own connections" 
ON public.user_connections 
FOR SELECT 
USING (user_one_id = auth.uid() OR user_two_id = auth.uid());

CREATE POLICY "Users can create connections" 
ON public.user_connections 
FOR INSERT 
WITH CHECK (user_one_id = auth.uid());

CREATE POLICY "Users can update their own connections" 
ON public.user_connections 
FOR UPDATE 
USING (user_one_id = auth.uid() OR user_two_id = auth.uid());

CREATE POLICY "Users can delete their own connections" 
ON public.user_connections 
FOR DELETE 
USING (user_one_id = auth.uid() OR user_two_id = auth.uid());

-- Local Support & Mutual Aid Schema Section

-- Skills master table
CREATE TABLE public.skills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0
);

-- Enable RLS on skills
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

-- Skills are viewable by everyone
CREATE POLICY "Skills are viewable by everyone" 
ON public.skills 
FOR SELECT 
USING (true);

-- Admins can manage skills
CREATE POLICY "Admins can manage skills" 
ON public.skills 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- User skills linking table
CREATE TABLE public.user_skills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  proficiency_level VARCHAR(50) DEFAULT 'beginner',
  years_experience INTEGER DEFAULT 0,
  is_offering BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, skill_id)
);

-- Add check constraint for proficiency levels
ALTER TABLE public.user_skills 
ADD CONSTRAINT check_proficiency_level 
CHECK (proficiency_level IN ('beginner', 'intermediate', 'advanced', 'expert'));

-- Enable RLS on user_skills
ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;

-- Users can manage their own skills
CREATE POLICY "Users can manage their own skills" 
ON public.user_skills 
FOR ALL 
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Skills are viewable by everyone
CREATE POLICY "User skills are viewable by everyone" 
ON public.user_skills 
FOR SELECT 
USING (true);

-- Aid requests table
CREATE TABLE public.aid_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  request_type VARCHAR(50) NOT NULL DEFAULT 'task_assistance',
  urgency VARCHAR(50) NOT NULL DEFAULT 'medium',
  status VARCHAR(50) NOT NULL DEFAULT 'open',
  visibility VARCHAR(50) NOT NULL DEFAULT 'public',
  location_text TEXT,
  city_id UUID REFERENCES public.cities(id),
  latitude NUMERIC,
  longitude NUMERIC,
  contact_method VARCHAR(50) DEFAULT 'app_message',
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  fulfillment_notes TEXT,
  tags TEXT[] DEFAULT '{}'
);

-- Add check constraints for aid_requests
ALTER TABLE public.aid_requests 
ADD CONSTRAINT check_request_type 
CHECK (request_type IN ('material_need', 'task_assistance', 'information', 'emotional_support'));

ALTER TABLE public.aid_requests 
ADD CONSTRAINT check_urgency 
CHECK (urgency IN ('low', 'medium', 'high', 'emergency'));

ALTER TABLE public.aid_requests 
ADD CONSTRAINT check_status 
CHECK (status IN ('open', 'in_progress', 'closed', 'fulfilled', 'cancelled'));

ALTER TABLE public.aid_requests 
ADD CONSTRAINT check_visibility 
CHECK (visibility IN ('public', 'local_area', 'trusted_contacts', 'private'));

-- Enable RLS on aid_requests
ALTER TABLE public.aid_requests ENABLE ROW LEVEL SECURITY;

-- Aid requests policies
CREATE POLICY "Users can create their own aid requests" 
ON public.aid_requests 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own aid requests" 
ON public.aid_requests 
FOR UPDATE 
USING (user_id = auth.uid());

CREATE POLICY "Public aid requests are viewable by everyone" 
ON public.aid_requests 
FOR SELECT 
USING (visibility = 'public' OR user_id = auth.uid());

CREATE POLICY "Users can delete their own aid requests" 
ON public.aid_requests 
FOR DELETE 
USING (user_id = auth.uid());

-- Aid offers table
CREATE TABLE public.aid_offers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  offer_type VARCHAR(50) NOT NULL DEFAULT 'task_assistance',
  availability VARCHAR(50) NOT NULL DEFAULT 'flexible',
  status VARCHAR(50) NOT NULL DEFAULT 'available',
  visibility VARCHAR(50) NOT NULL DEFAULT 'public',
  location_text TEXT,
  city_id UUID REFERENCES public.cities(id),
  latitude NUMERIC,
  longitude NUMERIC,
  contact_method VARCHAR(50) DEFAULT 'app_message',
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tags TEXT[] DEFAULT '{}'
);

-- Add check constraints for aid_offers
ALTER TABLE public.aid_offers 
ADD CONSTRAINT check_offer_type 
CHECK (offer_type IN ('material_donation', 'task_assistance', 'information', 'emotional_support', 'skill_sharing'));

ALTER TABLE public.aid_offers 
ADD CONSTRAINT check_availability 
CHECK (availability IN ('flexible', 'weekdays', 'weekends', 'evenings', 'emergency_only'));

ALTER TABLE public.aid_offers 
ADD CONSTRAINT check_offer_status 
CHECK (status IN ('available', 'busy', 'inactive', 'fulfilled'));

ALTER TABLE public.aid_offers 
ADD CONSTRAINT check_offer_visibility 
CHECK (visibility IN ('public', 'local_area', 'trusted_contacts', 'private'));

-- Enable RLS on aid_offers
ALTER TABLE public.aid_offers ENABLE ROW LEVEL SECURITY;

-- Aid offers policies
CREATE POLICY "Users can create their own aid offers" 
ON public.aid_offers 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own aid offers" 
ON public.aid_offers 
FOR UPDATE 
USING (user_id = auth.uid());

CREATE POLICY "Public aid offers are viewable by everyone" 
ON public.aid_offers 
FOR SELECT 
USING (visibility = 'public' OR user_id = auth.uid());

CREATE POLICY "Users can delete their own aid offers" 
ON public.aid_offers 
FOR DELETE 
USING (user_id = auth.uid());

-- Request responses table
CREATE TABLE public.request_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.aid_requests(id) ON DELETE CASCADE,
  responder_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  response_status VARCHAR(50) NOT NULL DEFAULT 'offered_help',
  notes TEXT,
  contact_info TEXT,
  estimated_completion TIMESTAMP WITH TIME ZONE,
  actual_completion TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(request_id, responder_user_id)
);

-- Add check constraint for response status
ALTER TABLE public.request_responses 
ADD CONSTRAINT check_response_status 
CHECK (response_status IN ('offered_help', 'accepted', 'completed', 'declined', 'cancelled'));

-- Enable RLS on request_responses
ALTER TABLE public.request_responses ENABLE ROW LEVEL SECURITY;

-- Request responses policies
CREATE POLICY "Users can create responses to requests" 
ON public.request_responses 
FOR INSERT 
WITH CHECK (responder_user_id = auth.uid());

CREATE POLICY "Responders can update their responses" 
ON public.request_responses 
FOR UPDATE 
USING (responder_user_id = auth.uid());

CREATE POLICY "Request creators and responders can view responses" 
ON public.request_responses 
FOR SELECT 
USING (
  responder_user_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM public.aid_requests 
    WHERE id = request_responses.request_id AND user_id = auth.uid()
  )
);

-- Community reviews table
CREATE TABLE public.community_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID REFERENCES public.aid_requests(id) ON DELETE SET NULL,
  reviewer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewee_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  review_type VARCHAR(50) NOT NULL,
  is_anonymous BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(request_id, reviewer_user_id, reviewee_user_id)
);

-- Add check constraint for review type
ALTER TABLE public.community_reviews 
ADD CONSTRAINT check_review_type 
CHECK (review_type IN ('as_requester', 'as_responder', 'general_interaction'));

-- Prevent self-reviews
ALTER TABLE public.community_reviews 
ADD CONSTRAINT check_no_self_review 
CHECK (reviewer_user_id != reviewee_user_id);

-- Enable RLS on community_reviews
ALTER TABLE public.community_reviews ENABLE ROW LEVEL SECURITY;

-- Community reviews policies
CREATE POLICY "Users can create reviews" 
ON public.community_reviews 
FOR INSERT 
WITH CHECK (reviewer_user_id = auth.uid());

CREATE POLICY "Users can update their own reviews" 
ON public.community_reviews 
FOR UPDATE 
USING (reviewer_user_id = auth.uid());

CREATE POLICY "Reviews are viewable by involved parties" 
ON public.community_reviews 
FOR SELECT 
USING (reviewer_user_id = auth.uid() OR reviewee_user_id = auth.uid());

-- Content Entity Enhancements

-- Add event_category to events table
ALTER TABLE public.events 
ADD COLUMN event_category VARCHAR(50) DEFAULT 'general';

-- Add check constraint for event categories
ALTER TABLE public.events 
ADD CONSTRAINT check_event_category 
CHECK (event_category IN (
  'general', 'volunteering_opportunity', 'support_group_meeting', 
  'skillshare_workshop', 'community_building', 'mutual_aid_coordination',
  'social_gathering', 'educational', 'advocacy'
));

-- Create indexes for better performance
CREATE INDEX idx_user_connections_user_one ON public.user_connections(user_one_id);
CREATE INDEX idx_user_connections_user_two ON public.user_connections(user_two_id);
CREATE INDEX idx_user_connections_type ON public.user_connections(type);
CREATE INDEX idx_user_skills_user_id ON public.user_skills(user_id);
CREATE INDEX idx_user_skills_skill_id ON public.user_skills(skill_id);
CREATE INDEX idx_aid_requests_user_id ON public.aid_requests(user_id);
CREATE INDEX idx_aid_requests_city_id ON public.aid_requests(city_id);
CREATE INDEX idx_aid_requests_status ON public.aid_requests(status);
CREATE INDEX idx_aid_requests_urgency ON public.aid_requests(urgency);
CREATE INDEX idx_aid_requests_location ON public.aid_requests(latitude, longitude);
CREATE INDEX idx_aid_offers_user_id ON public.aid_offers(user_id);
CREATE INDEX idx_aid_offers_city_id ON public.aid_offers(city_id);
CREATE INDEX idx_aid_offers_status ON public.aid_offers(status);
CREATE INDEX idx_aid_offers_location ON public.aid_offers(latitude, longitude);
CREATE INDEX idx_request_responses_request_id ON public.request_responses(request_id);
CREATE INDEX idx_request_responses_responder ON public.request_responses(responder_user_id);
CREATE INDEX idx_community_reviews_reviewee ON public.community_reviews(reviewee_user_id);
CREATE INDEX idx_events_category ON public.events(event_category);

-- Add triggers for updated_at timestamps
CREATE TRIGGER update_user_connections_updated_at
  BEFORE UPDATE ON public.user_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_skills_updated_at
  BEFORE UPDATE ON public.skills
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_aid_requests_updated_at
  BEFORE UPDATE ON public.aid_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_aid_offers_updated_at
  BEFORE UPDATE ON public.aid_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_request_responses_updated_at
  BEFORE UPDATE ON public.request_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_community_reviews_updated_at
  BEFORE UPDATE ON public.community_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some initial skills data
INSERT INTO public.skills (name, description, category) VALUES
('Plumbing', 'Basic plumbing repairs and maintenance', 'home_maintenance'),
('Dog Walking', 'Pet care and exercise services', 'pet_care'),
('Graphic Design', 'Visual design and creative services', 'creative'),
('Peer Support', 'Emotional support and active listening', 'mental_health'),
('Tutoring', 'Educational assistance and mentoring', 'education'),
('Transportation', 'Rides and delivery assistance', 'logistics'),
('Gardening', 'Plant care and landscaping', 'home_maintenance'),
('Cooking', 'Meal preparation and food assistance', 'food'),
('Technology Support', 'Computer and device troubleshooting', 'technology'),
('Language Translation', 'Communication assistance in multiple languages', 'communication'),
('Child Care', 'Supervised care for children', 'childcare'),
('Elder Care', 'Assistance and companionship for seniors', 'eldercare'),
('Home Repair', 'General maintenance and fix-it services', 'home_maintenance'),
('Administrative Help', 'Organization and paperwork assistance', 'office'),
('Event Planning', 'Coordination and organization of gatherings', 'social');