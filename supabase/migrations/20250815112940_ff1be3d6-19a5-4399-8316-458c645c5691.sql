-- Create storage bucket for personality images
INSERT INTO storage.buckets (id, name, public) VALUES ('personalities', 'personalities', true);

-- Create policies for personality image uploads
CREATE POLICY "Personality images are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'personalities');

CREATE POLICY "Authenticated users can upload personality images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'personalities' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own personality images" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'personalities' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete their own personality images" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'personalities' AND auth.uid() IS NOT NULL);