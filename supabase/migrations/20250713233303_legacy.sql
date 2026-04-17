-- Create a centralized tags table for better tag management
CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  usage_count INTEGER NOT NULL DEFAULT 0
);

-- Enable Row Level Security
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

-- Create policies for tags
CREATE POLICY "Tags are viewable by everyone" 
ON public.tags 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Authenticated users can manage tags" 
ON public.tags 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Create index for better performance
CREATE INDEX idx_tags_category ON public.tags(category);
CREATE INDEX idx_tags_name ON public.tags(name);
CREATE INDEX idx_tags_usage_count ON public.tags(usage_count DESC);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_tags_updated_at
BEFORE UPDATE ON public.tags
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert gender identity tags
INSERT INTO public.tags (name, category, description) VALUES
('Agender', 'gender-identity', 'Not identifying with any gender'),
('Altersex', 'gender-identity', 'Having anatomy that differs from typical male or female'),
('Androgyne', 'gender-identity', 'Having both masculine and feminine characteristics'),
('Anesigender', 'gender-identity', 'Having a gender identity that feels faded or unclear'),
('Apagender', 'gender-identity', 'Having a weak or absent connection to gender'),
('Bigender', 'gender-identity', 'Identifying as two genders'),
('boy', 'gender-identity', 'Young male person'),
('Butch', 'gender-identity', 'Masculine gender expression, often in lesbian communities'),
('Cisgender', 'gender-identity', 'Gender identity matches sex assigned at birth'),
('Cis Man', 'gender-identity', 'Cisgender man'),
('Cis Woman', 'gender-identity', 'Cisgender woman'),
('Crossdresser/Transvestite', 'gender-identity', 'Person who dresses in clothing of another gender'),
('Demiboy', 'gender-identity', 'Partial connection to boy/masculine identity'),
('Demigender', 'gender-identity', 'Partial connection to a gender'),
('Demigirl', 'gender-identity', 'Partial connection to girl/feminine identity'),
('Demiman', 'gender-identity', 'Partial connection to man/masculine identity'),
('Demiwoman', 'gender-identity', 'Partial connection to woman/feminine identity'),
('Eunuch', 'gender-identity', 'Person who has been castrated'),
('Female', 'gender-identity', 'Female gender identity'),
('Femboy/femboi', 'gender-identity', 'Feminine boy or man'),
('Femme', 'gender-identity', 'Feminine gender expression'),
('Gender Anarchist', 'gender-identity', 'Rejecting all gender categories and norms'),
('Genderfae', 'gender-identity', 'Fluid gender identity that never encompasses masculine'),
('Genderfaun', 'gender-identity', 'Fluid gender identity that never encompasses feminine'),
('Genderfluid', 'gender-identity', 'Gender identity that varies over time'),
('Genderflux', 'gender-identity', 'Gender identity that varies in intensity'),
('Genderfuck', 'gender-identity', 'Intentionally confusing or challenging gender norms'),
('Genderless', 'gender-identity', 'Having no gender identity'),
('Gender Neutral', 'gender-identity', 'Neither masculine nor feminine gender'),
('Gender Non-Conforming', 'gender-identity', 'Not conforming to gender norms'),
('Genderqueer', 'gender-identity', 'Gender identity outside traditional male/female binary'),
('Gender Questioning', 'gender-identity', 'Exploring or uncertain about gender identity'),
('girl', 'gender-identity', 'Young female person'),
('Glitchgender', 'gender-identity', 'Gender identity that feels corrupted or unclear'),
('Intersex', 'gender-identity', 'Born with sex characteristics that do not fit typical male/female'),
('Intersex Female', 'gender-identity', 'Intersex person identifying as female'),
('Intersex Male', 'gender-identity', 'Intersex person identifying as male'),
('Male', 'gender-identity', 'Male gender identity'),
('Man', 'gender-identity', 'Adult male gender identity'),
('Masc', 'gender-identity', 'Masculine gender expression'),
('Müllerian', 'gender-identity', 'Referring to Müllerian duct development'),
('Multigender', 'gender-identity', 'Having multiple gender identities'),
('Musicgender', 'gender-identity', 'Gender identity connected to music'),
('Neogender', 'gender-identity', 'New or unique gender identity'),
('Non-Binary', 'gender-identity', 'Gender identity outside the male/female binary'),
('Pangender', 'gender-identity', 'Identifying with many or all genders'),
('Paragirl', 'gender-identity', 'Mostly girl but not entirely'),
('Polygender', 'gender-identity', 'Having multiple gender identities'),
('Pupgender', 'gender-identity', 'Gender identity connected to puppies or dogs'),
('Questioning', 'gender-identity', 'Exploring gender identity'),
('Tomboy', 'gender-identity', 'Girl or woman with masculine traits'),
('Trans Man', 'gender-identity', 'Transgender man'),
('Trans Non-Binary', 'gender-identity', 'Transgender non-binary person'),
('Trans Woman', 'gender-identity', 'Transgender woman'),
('Transfeminine', 'gender-identity', 'Transgender with feminine identity'),
('Transmasculine', 'gender-identity', 'Transgender with masculine identity'),
('Transgender', 'gender-identity', 'Gender identity differs from sex assigned at birth'),
('Transsexual', 'gender-identity', 'Person who has medically transitioned'),
('Two-Spirit', 'gender-identity', 'Traditional Native American gender identity'),
('Unsure', 'gender-identity', 'Uncertain about gender identity'),
('Wolffian', 'gender-identity', 'Referring to Wolffian duct development'),
('Woman', 'gender-identity', 'Adult female gender identity'),
('Xenogender', 'gender-identity', 'Gender identity that cannot be described in traditional terms'),
('XXY', 'gender-identity', 'Klinefelter syndrome chromosome pattern');

-- Insert some common general tags for other categories
INSERT INTO public.tags (name, category, description) VALUES
('LGBTQ+', 'community', 'Lesbian, Gay, Bisexual, Transgender, Queer/Questioning community'),
('Pride', 'community', 'LGBTQ+ pride and celebration'),
('Inclusive', 'community', 'Welcoming to all people'),
('Safe Space', 'community', 'Environment free from harassment'),
('Support Group', 'community', 'Peer support and assistance'),
('Education', 'general', 'Learning and teaching'),
('Awareness', 'general', 'Raising consciousness about issues'),
('Diversity', 'general', 'Variety and inclusion'),
('Equality', 'general', 'Equal rights and treatment'),
('Activism', 'general', 'Political or social action'),
('Mental Health', 'health', 'Psychological wellbeing'),
('Healthcare', 'health', 'Medical services and care'),
('Wellness', 'health', 'Overall health and wellbeing'),
('Therapy', 'health', 'Professional counseling'),
('Social', 'events', 'Social gatherings and activities'),
('Workshop', 'events', 'Educational or skill-building sessions'),
('Conference', 'events', 'Professional or academic meetings'),
('Networking', 'events', 'Professional connection building'),
('Celebration', 'events', 'Festive or commemorative events');

-- Create function to update tag usage counts
CREATE OR REPLACE FUNCTION public.update_tag_usage_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Update usage counts for all tags
  UPDATE public.tags 
  SET usage_count = (
    SELECT COALESCE(
      (SELECT COUNT(*) FROM public.events WHERE tags @> ARRAY[tags.name]) +
      (SELECT COUNT(*) FROM public.venues WHERE tags @> ARRAY[tags.name]) +
      (SELECT COUNT(*) FROM public.marketplace_listings WHERE tags @> ARRAY[tags.name]) +
      (SELECT COUNT(*) FROM public.community_posts WHERE tags @> ARRAY[tags.name]),
      0
    )
  );
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to update tag usage counts when content is modified
CREATE TRIGGER update_tag_counts_events
AFTER INSERT OR UPDATE OR DELETE ON public.events
FOR EACH STATEMENT
EXECUTE FUNCTION public.update_tag_usage_count();

CREATE TRIGGER update_tag_counts_venues
AFTER INSERT OR UPDATE OR DELETE ON public.venues
FOR EACH STATEMENT
EXECUTE FUNCTION public.update_tag_usage_count();

CREATE TRIGGER update_tag_counts_marketplace
AFTER INSERT OR UPDATE OR DELETE ON public.marketplace_listings
FOR EACH STATEMENT
EXECUTE FUNCTION public.update_tag_usage_count();

CREATE TRIGGER update_tag_counts_community
AFTER INSERT OR UPDATE OR DELETE ON public.community_posts
FOR EACH STATEMENT
EXECUTE FUNCTION public.update_tag_usage_count();