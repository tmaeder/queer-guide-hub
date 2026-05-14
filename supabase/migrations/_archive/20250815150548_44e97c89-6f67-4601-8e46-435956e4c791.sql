-- Create the tag-images storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('tag-images', 'tag-images', true);

-- Create policy for public read access to tag images
CREATE POLICY "Tag images are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'tag-images');

-- Create policy for system to upload images
CREATE POLICY "System can upload tag images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'tag-images');