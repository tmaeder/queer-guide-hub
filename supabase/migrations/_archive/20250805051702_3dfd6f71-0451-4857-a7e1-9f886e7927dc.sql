-- Add public read access for venues so non-authenticated users can view them
CREATE POLICY "Public read access for venues" 
ON public.venues 
FOR SELECT 
USING (true);