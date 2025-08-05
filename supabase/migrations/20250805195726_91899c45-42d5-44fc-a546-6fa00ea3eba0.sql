-- Create donations table to track donation records
CREATE TABLE public.donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  amount INTEGER NOT NULL, -- Amount in cents
  currency TEXT DEFAULT 'usd',
  stripe_session_id TEXT UNIQUE,
  donor_name TEXT,
  message TEXT,
  is_anonymous BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

-- Create policies for donations
CREATE POLICY "Donations are viewable by admins" 
ON public.donations 
FOR SELECT 
USING (has_role((SELECT auth.uid()), 'admin'));

-- Allow public viewing of non-anonymous donations (for donor wall)
CREATE POLICY "Public donations are viewable by everyone" 
ON public.donations 
FOR SELECT 
USING (NOT is_anonymous AND status = 'completed');

-- Allow users to view their own donations
CREATE POLICY "Users can view their own donations" 
ON public.donations 
FOR SELECT 
USING (auth.uid() = user_id);

-- Edge functions can insert donations
CREATE POLICY "System can create donations" 
ON public.donations 
FOR INSERT 
WITH CHECK (true);

-- Edge functions can update donation status
CREATE POLICY "System can update donations" 
ON public.donations 
FOR UPDATE 
USING (true);