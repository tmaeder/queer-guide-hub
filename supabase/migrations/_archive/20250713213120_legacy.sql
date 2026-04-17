-- Create events table
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL, -- party, workshop, meetup, pride, rally, etc.
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE,
  venue_id UUID REFERENCES public.venues(id),
  venue_name TEXT, -- for events without venue_id
  address TEXT,
  city TEXT NOT NULL,
  state TEXT,
  country TEXT NOT NULL DEFAULT 'US',
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  website TEXT,
  ticket_url TEXT,
  price_min DECIMAL(10,2),
  price_max DECIMAL(10,2),
  is_free BOOLEAN DEFAULT FALSE,
  age_restriction TEXT, -- all-ages, 18+, 21+
  tags TEXT[], -- lgbt-friendly, trans-friendly, drag, music, etc.
  images TEXT[], -- array of image URLs
  max_attendees INTEGER,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_pattern TEXT, -- weekly, monthly, etc.
  organizer_name TEXT,
  organizer_contact TEXT,
  featured BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'postponed', 'completed')),
  created_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Create policies for events
CREATE POLICY "Events are viewable by everyone" 
ON public.events 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can create events" 
ON public.events 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own events" 
ON public.events 
FOR UPDATE 
USING (auth.uid() = created_by);

-- Create event attendees table
CREATE TABLE public.event_attendees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  status TEXT DEFAULT 'going' CHECK (status IN ('going', 'interested', 'not_going')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- Enable RLS on attendees
ALTER TABLE public.event_attendees ENABLE ROW LEVEL SECURITY;

-- Create policies for attendees
CREATE POLICY "Attendees are viewable by everyone" 
ON public.event_attendees 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can manage their attendance" 
ON public.event_attendees 
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add triggers for timestamps
CREATE TRIGGER update_events_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_events_start_date ON public.events(start_date);
CREATE INDEX idx_events_city ON public.events(city);
CREATE INDEX idx_events_event_type ON public.events(event_type);
CREATE INDEX idx_events_tags ON public.events USING GIN(tags);
CREATE INDEX idx_events_featured ON public.events(featured) WHERE featured = true;
CREATE INDEX idx_event_attendees_event_id ON public.event_attendees(event_id);
CREATE INDEX idx_event_attendees_user_id ON public.event_attendees(user_id);