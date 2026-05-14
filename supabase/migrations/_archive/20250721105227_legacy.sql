-- Create venue_checkins table
CREATE TABLE public.venue_checkins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  checked_in_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  distance_meters DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.venue_checkins ENABLE ROW LEVEL SECURITY;

-- Create policies for venue check-ins
CREATE POLICY "Check-ins are viewable by authenticated users" 
ON public.venue_checkins 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create check-ins" 
ON public.venue_checkins 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own check-ins" 
ON public.venue_checkins 
FOR SELECT 
USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_venue_checkins_venue_id ON public.venue_checkins(venue_id);
CREATE INDEX idx_venue_checkins_user_id ON public.venue_checkins(user_id);
CREATE INDEX idx_venue_checkins_date ON public.venue_checkins(checked_in_at DESC);