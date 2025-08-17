-- Reorganize tags into new category structure
-- First, update existing categories to match the new structure

-- Identity & Orientation -> Gender Identity & Expression
UPDATE unified_tags 
SET category = 'Gender Identity & Expression'
WHERE category IN ('genders', 'identity') 
   OR name ILIKE '%gender%' 
   OR name ILIKE '%trans%' 
   OR name ILIKE '%cisgender%' 
   OR name ILIKE '%non-binary%' 
   OR name ILIKE '%genderfluid%'
   OR name ILIKE '%agender%'
   OR name ILIKE '%bigender%'
   OR name ILIKE '%demigender%'
   OR name ILIKE '%pangender%';

-- Identity & Orientation -> Sexual & Romantic Orientations
UPDATE unified_tags 
SET category = 'Sexual & Romantic Orientations'
WHERE category IN ('sexual-orientations', 'romantic-orientations')
   OR name ILIKE '%sexual%' 
   OR name ILIKE '%romantic%' 
   OR name ILIKE '%gay%' 
   OR name ILIKE '%lesbian%' 
   OR name ILIKE '%bisexual%' 
   OR name ILIKE '%pansexual%' 
   OR name ILIKE '%asexual%' 
   OR name ILIKE '%demisexual%' 
   OR name ILIKE '%heterosexual%' 
   OR name ILIKE '%homosexual%'
   OR name ILIKE '%aromantic%'
   OR name ILIKE '%demiromantic%'
   OR name ILIKE '%polyromantic%';

-- Relationships & Dynamics -> Relationship Structures
UPDATE unified_tags 
SET category = 'Relationship Structures'
WHERE category = 'relationships'
   OR name ILIKE '%polyamory%' 
   OR name ILIKE '%monogamy%' 
   OR name ILIKE '%relationship%' 
   OR name ILIKE '%marriage%' 
   OR name ILIKE '%partnership%' 
   OR name ILIKE '%dating%' 
   OR name ILIKE '%couple%' 
   OR name ILIKE '%triad%' 
   OR name ILIKE '%quad%'
   OR name ILIKE '%polycule%'
   OR name ILIKE '%hierarchy%'
   OR name ILIKE '%solo poly%';

-- Relationships & Dynamics -> Partner Roles & Titles
UPDATE unified_tags 
SET category = 'Partner Roles & Titles'
WHERE name ILIKE '%partner%' 
   OR name ILIKE '%boyfriend%' 
   OR name ILIKE '%girlfriend%' 
   OR name ILIKE '%spouse%' 
   OR name ILIKE '%husband%' 
   OR name ILIKE '%wife%' 
   OR name ILIKE '%metamour%' 
   OR name ILIKE '%anchor%' 
   OR name ILIKE '%primary%' 
   OR name ILIKE '%secondary%'
   OR name ILIKE '%nesting%'
   OR name ILIKE '%comet%';

-- Sexual Practices, Kink & BDSM -> Core Concepts & Philosophies
UPDATE unified_tags 
SET category = 'Core Concepts & Philosophies'
WHERE name ILIKE '%bdsm%' 
   OR name ILIKE '%kink%' 
   OR name ILIKE '%fetish%' 
   OR name ILIKE '%consent%' 
   OR name ILIKE '%safe%sane%consensual%' 
   OR name ILIKE '%rack%' 
   OR name ILIKE '%prick%' 
   OR name ILIKE '%negotiation%' 
   OR name ILIKE '%limits%' 
   OR name ILIKE '%safeword%'
   OR name ILIKE '%scene%'
   OR name ILIKE '%vanilla%'
   OR name ILIKE '%kink friendly%';

-- Sexual Practices, Kink & BDSM -> Roles & Power Dynamics
UPDATE unified_tags 
SET category = 'Roles & Power Dynamics'
WHERE name ILIKE '%dominant%' 
   OR name ILIKE '%submissive%' 
   OR name ILIKE '%master%' 
   OR name ILIKE '%slave%' 
   OR name ILIKE '%daddy%' 
   OR name ILIKE '%mommy%' 
   OR name ILIKE '%switch%' 
   OR name ILIKE '%top%' 
   OR name ILIKE '%bottom%' 
   OR name ILIKE '%sadist%' 
   OR name ILIKE '%masochist%'
   OR name ILIKE '%dom%'
   OR name ILIKE '%sub%'
   OR name ILIKE '%sir%'
   OR name ILIKE '%mistress%'
   OR name ILIKE '%little%'
   OR name ILIKE '%brat%'
   OR name ILIKE '%caregiver%'
   OR name ILIKE '%pet%'
   OR name ILIKE '%owner%';

-- Sexual Practices, Kink & BDSM -> Kink & Fetish Domains
UPDATE unified_tags 
SET category = 'Kink & Fetish Domains'
WHERE category IN ('kink-activities', 'toys-equipment', 'philia')
   OR name ILIKE '%bondage%' 
   OR name ILIKE '%rope%' 
   OR name ILIKE '%latex%' 
   OR name ILIKE '%leather%' 
   OR name ILIKE '%foot%' 
   OR name ILIKE '%spanking%' 
   OR name ILIKE '%impact%' 
   OR name ILIKE '%wax%' 
   OR name ILIKE '%sensory%' 
   OR name ILIKE '%electro%'
   OR name ILIKE '%medical%'
   OR name ILIKE '%needle%'
   OR name ILIKE '%piercing%'
   OR name ILIKE '%edge%'
   OR name ILIKE '%roleplay%'
   OR name ILIKE '%age%play%'
   OR name ILIKE '%puppy%'
   OR name ILIKE '%pony%'
   OR name ILIKE '%furry%'
   OR name ILIKE '%diaper%'
   OR name ILIKE '%watersports%'
   OR name ILIKE '%scat%';

-- Community, Culture, & Support -> Community & Events
UPDATE unified_tags 
SET category = 'Community & Events'
WHERE category IN ('community', 'gay-culture', 'culture')
   OR name ILIKE '%pride%' 
   OR name ILIKE '%event%' 
   OR name ILIKE '%festival%' 
   OR name ILIKE '%parade%' 
   OR name ILIKE '%party%' 
   OR name ILIKE '%club%' 
   OR name ILIKE '%bar%' 
   OR name ILIKE '%gathering%' 
   OR name ILIKE '%meetup%' 
   OR name ILIKE '%conference%'
   OR name ILIKE '%munch%'
   OR name ILIKE '%social%'
   OR name ILIKE '%networking%'
   OR name ILIKE '%group%';

-- Community, Culture, & Support -> Activism & Social Issues
UPDATE unified_tags 
SET category = 'Activism & Social Issues'
WHERE category IN ('activism', 'politics', 'legal')
   OR name ILIKE '%rights%' 
   OR name ILIKE '%activism%' 
   OR name ILIKE '%advocacy%' 
   OR name ILIKE '%discrimination%' 
   OR name ILIKE '%equality%' 
   OR name ILIKE '%justice%' 
   OR name ILIKE '%legislation%' 
   OR name ILIKE '%policy%' 
   OR name ILIKE '%protest%' 
   OR name ILIKE '%campaign%'
   OR name ILIKE '%civil%'
   OR name ILIKE '%human rights%'
   OR name ILIKE '%marriage equality%'
   OR name ILIKE '%employment%'
   OR name ILIKE '%housing%'
   OR name ILIKE '%healthcare%'
   OR name ILIKE '%education%'
   OR name ILIKE '%military%'
   OR name ILIKE '%religious%'
   OR name ILIKE '%conversion therapy%';

-- Community, Culture, & Support -> Support & Resources
UPDATE unified_tags 
SET category = 'Support & Resources'
WHERE category IN ('safety-resources', 'education')
   OR name ILIKE '%support%' 
   OR name ILIKE '%help%' 
   OR name ILIKE '%resource%' 
   OR name ILIKE '%counseling%' 
   OR name ILIKE '%therapy%' 
   OR name ILIKE '%helpline%' 
   OR name ILIKE '%crisis%' 
   OR name ILIKE '%suicide%' 
   OR name ILIKE '%mental health%' 
   OR name ILIKE '%guidance%'
   OR name ILIKE '%hotline%'
   OR name ILIKE '%emergency%'
   OR name ILIKE '%shelter%'
   OR name ILIKE '%refuge%'
   OR name ILIKE '%outreach%';

-- Community, Culture, & Support -> Slang & Cultural Terms
UPDATE unified_tags 
SET category = 'Slang & Cultural Terms'
WHERE name ILIKE '%slang%' 
   OR name ILIKE '%term%' 
   OR name ILIKE '%lingo%' 
   OR name ILIKE '%jargon%' 
   OR name ILIKE '%gay lingo%' 
   OR name ILIKE '%polari%' 
   OR name ILIKE '%code%' 
   OR name ILIKE '%signal%' 
   OR name ILIKE '%symbol%' 
   OR name ILIKE '%flag%'
   OR name ILIKE '%hanky%'
   OR name ILIKE '%bear%'
   OR name ILIKE '%twink%'
   OR name ILIKE '%otter%'
   OR name ILIKE '%daddy%'
   OR name ILIKE '%circuit%'
   OR name ILIKE '%cruise%'
   OR name ILIKE '%trade%'
   OR name ILIKE '%trick%'
   OR name ILIKE '%queen%'
   OR name ILIKE '%king%'
   OR name ILIKE '%femme%'
   OR name ILIKE '%butch%'
   OR name ILIKE '%stud%';

-- Health, Safety, & Wellness -> Safety Practices & Concepts
UPDATE unified_tags 
SET category = 'Safety Practices & Concepts'
WHERE name ILIKE '%safety%' 
   OR name ILIKE '%protection%' 
   OR name ILIKE '%prep%' 
   OR name ILIKE '%pep%' 
   OR name ILIKE '%condom%' 
   OR name ILIKE '%barrier%' 
   OR name ILIKE '%testing%' 
   OR name ILIKE '%screening%' 
   OR name ILIKE '%safe sex%' 
   OR name ILIKE '%safer sex%'
   OR name ILIKE '%harm reduction%'
   OR name ILIKE '%risk%'
   OR name ILIKE '%prevention%'
   OR name ILIKE '%clean%'
   OR name ILIKE '%sterile%'
   OR name ILIKE '%hygiene%';

-- Health, Safety, & Wellness -> Health & Wellness Resources
UPDATE unified_tags 
SET category = 'Health & Wellness Resources'
WHERE category IN ('health', 'sexual-health')
   OR name ILIKE '%health%' 
   OR name ILIKE '%wellness%' 
   OR name ILIKE '%clinic%' 
   OR name ILIKE '%doctor%' 
   OR name ILIKE '%medical%' 
   OR name ILIKE '%treatment%' 
   OR name ILIKE '%medication%' 
   OR name ILIKE '%hormone%' 
   OR name ILIKE '%therapy%' 
   OR name ILIKE '%surgery%'
   OR name ILIKE '%transition%'
   OR name ILIKE '%healthcare%'
   OR name ILIKE '%provider%'
   OR name ILIKE '%specialist%'
   OR name ILIKE '%gynecology%'
   OR name ILIKE '%urology%'
   OR name ILIKE '%endocrinology%';

-- Health, Safety, & Wellness -> STIs & Health Conditions
UPDATE unified_tags 
SET category = 'STIs & Health Conditions'
WHERE name ILIKE '%sti%' 
   OR name ILIKE '%std%' 
   OR name ILIKE '%hiv%' 
   OR name ILIKE '%aids%' 
   OR name ILIKE '%syphilis%' 
   OR name ILIKE '%gonorrhea%' 
   OR name ILIKE '%chlamydia%' 
   OR name ILIKE '%herpes%' 
   OR name ILIKE '%hpv%' 
   OR name ILIKE '%hepatitis%'
   OR name ILIKE '%infection%'
   OR name ILIKE '%disease%'
   OR name ILIKE '%outbreak%'
   OR name ILIKE '%viral%'
   OR name ILIKE '%bacterial%'
   OR name ILIKE '%parasitic%';

-- Health, Safety, & Wellness -> Substances & Harm Reduction
UPDATE unified_tags 
SET category = 'Substances & Harm Reduction'
WHERE category = 'party-drugs'
   OR name ILIKE '%drug%' 
   OR name ILIKE '%substance%' 
   OR name ILIKE '%alcohol%' 
   OR name ILIKE '%marijuana%' 
   OR name ILIKE '%cannabis%' 
   OR name ILIKE '%poppers%' 
   OR name ILIKE '%mdma%' 
   OR name ILIKE '%cocaine%' 
   OR name ILIKE '%meth%' 
   OR name ILIKE '%addiction%'
   OR name ILIKE '%recovery%'
   OR name ILIKE '%detox%'
   OR name ILIKE '%sober%'
   OR name ILIKE '%clean%'
   OR name ILIKE '%rehab%'
   OR name ILIKE '%overdose%'
   OR name ILIKE '%needle%'
   OR name ILIKE '%exchange%'
   OR name ILIKE '%chemsex%'
   OR name ILIKE '%party and play%'
   OR name ILIKE '%pnp%';

-- Keep Professions as is
-- Tags already categorized as 'Professions' stay in that category

-- Everything else goes to Miscellaneous / Uncategorized
UPDATE unified_tags 
SET category = 'Miscellaneous'
WHERE category IN ('general', 'content', 'entertainment', 'business', 'news', 'arts', 'history', 'literature', 'sports', 'travel')
   OR category IS NULL
   OR category = '';

-- Update any remaining uncategorized tags
UPDATE unified_tags 
SET category = 'Miscellaneous'
WHERE category NOT IN (
    'Gender Identity & Expression',
    'Sexual & Romantic Orientations', 
    'Relationship Structures',
    'Partner Roles & Titles',
    'Core Concepts & Philosophies',
    'Roles & Power Dynamics',
    'Kink & Fetish Domains',
    'Community & Events',
    'Activism & Social Issues',
    'Support & Resources',
    'Slang & Cultural Terms',
    'Safety Practices & Concepts',
    'Health & Wellness Resources',
    'STIs & Health Conditions',
    'Substances & Harm Reduction',
    'Professions'
);