-- Create placeholders storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('placeholders', 'placeholders', true)
ON CONFLICT (id) DO NOTHING;

-- Create placeholder metadata table
CREATE TABLE IF NOT EXISTS public.placeholder_images (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  filename text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'generic',
  description text,
  file_size integer,
  mime_type text,
  width integer,
  height integer,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.placeholder_images ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Public read access for placeholder images"
  ON public.placeholder_images
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage placeholder images"
  ON public.placeholder_images
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Storage policies for placeholders bucket
CREATE POLICY "Public read access for placeholders"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'placeholders');

CREATE POLICY "Admins can upload placeholders"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'placeholders' AND
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update placeholders"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'placeholders' AND
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete placeholders"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'placeholders' AND
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Update trigger for placeholder_images
CREATE OR REPLACE FUNCTION update_placeholder_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_placeholder_images_updated_at
  BEFORE UPDATE ON public.placeholder_images
  FOR EACH ROW
  EXECUTE FUNCTION update_placeholder_images_updated_at();