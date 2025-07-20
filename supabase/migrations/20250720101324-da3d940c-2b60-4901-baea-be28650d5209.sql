-- Create storage bucket for user photos
INSERT INTO storage.buckets (id, name, public) VALUES ('user-photos', 'user-photos', true);

-- Create table for photo metadata
CREATE TABLE public.user_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  filename TEXT NOT NULL,
  caption TEXT,
  storage_path TEXT NOT NULL,
  file_size INTEGER,
  content_type TEXT,
  is_profile_picture BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_photos ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view public photos" 
ON public.user_photos 
FOR SELECT 
USING (true);

CREATE POLICY "Users can manage their own photos" 
ON public.user_photos 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create storage policies for user photos
CREATE POLICY "Anyone can view user photos" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'user-photos');

CREATE POLICY "Users can upload their own photos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'user-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own photos" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'user-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own photos" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'user-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add trigger for updated_at
CREATE TRIGGER update_user_photos_updated_at
BEFORE UPDATE ON public.user_photos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();