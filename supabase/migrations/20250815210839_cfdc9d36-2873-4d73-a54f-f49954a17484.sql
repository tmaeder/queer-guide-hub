-- Create storage bucket for adult model images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('adult-model-images', 'adult-model-images', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

-- Create RLS policies for the bucket
CREATE POLICY "Adult model images are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'adult-model-images');

CREATE POLICY "Admins can upload adult model images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'adult-model-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update adult model images" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'adult-model-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete adult model images" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'adult-model-images' AND has_role(auth.uid(), 'admin'::app_role));