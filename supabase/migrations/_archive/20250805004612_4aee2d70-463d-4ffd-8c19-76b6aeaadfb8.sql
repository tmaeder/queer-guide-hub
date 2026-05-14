-- Create edge function to handle Turnstile verification
-- This will be implemented in the edge function file

-- First, let's create a table to track captcha verification attempts for security monitoring
CREATE TABLE IF NOT EXISTS public.captcha_verifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    success BOOLEAN NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.captcha_verifications ENABLE ROW LEVEL SECURITY;

-- Admins can view all captcha verification logs
CREATE POLICY "Admins can view captcha verifications" 
ON public.captcha_verifications 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() 
        AND role IN ('admin', 'moderator')
    )
);

-- System can insert captcha verification records
CREATE POLICY "System can insert captcha verifications" 
ON public.captcha_verifications 
FOR INSERT 
WITH CHECK (true);