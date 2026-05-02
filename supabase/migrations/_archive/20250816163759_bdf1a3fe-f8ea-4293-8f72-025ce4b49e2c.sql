-- Create storage bucket for CMS media uploads
INSERT INTO storage.buckets (id, name, public) 
VALUES ('cms-media', 'cms-media', true);

-- Create RLS policies for cms-media bucket
CREATE POLICY "Authenticated users can upload CMS media files" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'cms-media' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated users can view CMS media files" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'cms-media' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated users can update their own CMS media files" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'cms-media' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Authenticated users can delete their own CMS media files" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'cms-media' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Public access to CMS media files" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'cms-media');