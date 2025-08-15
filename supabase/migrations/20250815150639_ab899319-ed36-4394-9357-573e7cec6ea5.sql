-- Create policies for tag images storage
CREATE POLICY "Tag images are publicly readable" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'tag-images');

CREATE POLICY "System can upload tag images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'tag-images');