-- Add public read access for events so non-authenticated users can view them
CREATE POLICY "Public read access for events" 
ON public.events 
FOR SELECT 
USING (true);