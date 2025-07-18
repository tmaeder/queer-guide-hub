-- Add image_url column to tags table
ALTER TABLE public.tags ADD COLUMN image_url TEXT;

-- Create storage bucket for tag images
INSERT INTO storage.buckets (id, name, public) VALUES ('tag-images', 'tag-images', true);

-- Create storage policies for tag images
CREATE POLICY "Tag images are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'tag-images');

CREATE POLICY "Authenticated users can upload tag images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'tag-images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update tag images" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'tag-images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete tag images" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'tag-images' AND auth.uid() IS NOT NULL);