-- Create bookings table for flight and hotel reservations
CREATE TABLE public.bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  booking_type TEXT NOT NULL CHECK (booking_type IN ('flight', 'hotel')),
  booking_reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  
  -- Flight specific fields
  flight_data JSONB,
  departure_airport TEXT,
  arrival_airport TEXT,
  departure_date TIMESTAMP WITH TIME ZONE,
  return_date TIMESTAMP WITH TIME ZONE,
  passengers INTEGER,
  
  -- Hotel specific fields
  hotel_data JSONB,
  hotel_name TEXT,
  hotel_location TEXT,
  check_in_date DATE,
  check_out_date DATE,
  rooms INTEGER,
  guests INTEGER,
  
  -- Common fields
  total_price NUMERIC(10,2),
  currency TEXT DEFAULT 'USD',
  traveler_details JSONB,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own bookings" 
ON public.bookings 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own bookings" 
ON public.bookings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bookings" 
ON public.bookings 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_bookings_updated_at
BEFORE UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_bookings_user_id ON public.bookings(user_id);
CREATE INDEX idx_bookings_type ON public.bookings(booking_type);
CREATE INDEX idx_bookings_status ON public.bookings(status);
CREATE INDEX idx_bookings_departure_date ON public.bookings(departure_date);
CREATE INDEX idx_bookings_check_in_date ON public.bookings(check_in_date);