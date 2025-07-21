-- Add news-related tags to the unified_tags table
INSERT INTO public.unified_tags (name, slug, category, description, color) VALUES
-- Politics & Rights
('LGBTQ+ Rights', 'lgbtq-rights', 'politics', 'Coverage of LGBTQ+ rights and legal issues', '#9333ea'),
('Same-Sex Marriage', 'same-sex-marriage', 'politics', 'News about marriage equality', '#9333ea'),
('Discrimination', 'discrimination', 'politics', 'Coverage of discrimination issues', '#dc2626'),
('Anti-LGBTQ+ Legislation', 'anti-lgbtq-legislation', 'politics', 'News about anti-LGBTQ+ laws and policies', '#dc2626'),
('Pride Month', 'pride-month', 'politics', 'Pride-related news and events', '#ef4444'),

-- Health & Wellness
('HIV/AIDS', 'hiv-aids', 'health', 'HIV/AIDS related news and research', '#059669'),
('Mental Health', 'mental-health', 'health', 'LGBTQ+ mental health coverage', '#059669'),
('Healthcare Access', 'healthcare-access', 'health', 'Healthcare access and issues for LGBTQ+ people', '#059669'),
('Gender-Affirming Care', 'gender-affirming-care', 'health', 'Transgender healthcare and treatment news', '#059669'),

-- Culture & Arts
('LGBTQ+ Culture', 'lgbtq-culture', 'culture', 'Cultural news and stories', '#7c3aed'),
('Entertainment', 'entertainment', 'culture', 'LGBTQ+ representation in entertainment', '#7c3aed'),
('Pride Events', 'pride-events', 'culture', 'Pride parades and community events', '#7c3aed'),
('Drag Culture', 'drag-culture', 'culture', 'Drag performance and culture news', '#7c3aed'),

-- Education
('LGBTQ+ Education', 'lgbtq-education', 'education', 'Education policy and school-related news', '#dc2626'),
('Campus Life', 'campus-life', 'education', 'University and college LGBTQ+ news', '#dc2626'),

-- Business & Economics
('Corporate Pride', 'corporate-pride', 'business', 'Corporate LGBTQ+ support and initiatives', '#ea580c'),
('Workplace Discrimination', 'workplace-discrimination', 'business', 'Employment and workplace issues', '#ea580c'),
('Economic Impact', 'economic-impact', 'business', 'Economic studies and business news', '#ea580c'),

-- International
('International News', 'international-news', 'news', 'Global LGBTQ+ news', '#0284c7'),
('Human Rights', 'human-rights', 'news', 'International human rights coverage', '#0284c7'),

-- Sports
('LGBTQ+ Sports', 'lgbtq-sports', 'news', 'Sports and athletics coverage', '#16a34a'),
('Transgender Athletes', 'transgender-athletes', 'news', 'Coverage of transgender athletes', '#16a34a'),

-- Community
('Coming Out', 'coming-out', 'community', 'Coming out stories and support', '#8b5cf6'),
('Community Support', 'community-support', 'community', 'Community programs and support systems', '#8b5cf6'),
('Youth Issues', 'youth-issues', 'community', 'LGBTQ+ youth news and issues', '#8b5cf6'),

-- News Categories
('Breaking News', 'breaking-news', 'news', 'Urgent and breaking news stories', '#dc2626'),
('Opinion', 'opinion', 'news', 'Opinion pieces and editorial content', '#6b7280'),
('Investigation', 'investigation', 'news', 'Investigative journalism', '#6b7280')

ON CONFLICT (slug) DO NOTHING;