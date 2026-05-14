-- Update existing tags to sexual-orientations category and add missing ones
UPDATE public.unified_tags 
SET category = 'sexual-orientations' 
WHERE slug IN (
'abrosexual', 'accipiosexual', 'aceflux', 'achillean', 'aegosexual', 'allosexual', 'androgynosexual', 'androsexual', 'asexual', 'aurasexual', 'autosexual', 'bdsm-orientated', 'benignosexual', 'bicurious', 'bisexual', 'cupiosexual', 'demisexual', 'dyke', 'finsexual', 'fraysexual', 'gay', 'graysexual', 'gynesexual', 'heteroflexible', 'heterosexual', 'heterotypical', 'homoflexible', 'homosexual', 'iamvanosexual', 'lesbian', 'megasexual', 'minsexual', 'monosexual', 'nebulasexual', 'neosexual', 'neptunic', 'noetisexual', 'novosexual', 'objectum-sexuality', 'omnisexual', 'pansexual', 'phallosexual', 'placiosexual', 'polysexual', 'pornosexual', 'queer', 'questioning', 'reciprosexual', 'requissexual', 'sapiosexual', 'sapphic', 'sexually-fluid', 'skoliosexual', 'soulsexual', 'straight', 'symbiosexual', 'trysexual', 'unlabeled', 'unsure', 'vulvosexual'
);

-- Insert the missing ones that weren't in the query results
INSERT INTO public.unified_tags (name, slug, category) VALUES
('Fluctuating/Evolving', 'fluctuating-evolving', 'sexual-orientations'),
('Pivotsexual', 'pivotsexual', 'sexual-orientations');