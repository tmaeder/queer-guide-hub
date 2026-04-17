-- Insert sample community groups
INSERT INTO public.community_groups (
  name, 
  description, 
  is_private, 
  created_by, 
  rules, 
  tags, 
  member_count
) VALUES 
(
  'Pride Events & Meetups',
  'Join us for local pride events, parades, and community meetups. A space to coordinate and celebrate together!',
  false,
  (SELECT user_id FROM public.profiles LIMIT 1),
  'Be respectful and inclusive. No discrimination of any kind. Share events and meetups relevant to the LGBTQ+ community.',
  ARRAY['pride', 'events', 'meetups', 'community', 'local'],
  5
),
(
  'Trans Support Network',
  'A supportive space for transgender individuals and allies. Share resources, experiences, and find community.',
  false,
  (SELECT user_id FROM public.profiles LIMIT 1),
  'This is a safe space. Respect everyone''s journey and identity. No transphobia or discrimination.',
  ARRAY['transgender', 'support', 'resources', 'community', 'safe-space'],
  8
),
(
  'LGBTQ+ Book Club',
  'Monthly book discussions featuring LGBTQ+ authors and themes. Currently reading "Red: A Crayon''s Story".',
  false,
  (SELECT user_id FROM public.profiles LIMIT 1),
  'Participate respectfully in discussions. Give spoiler warnings. Suggest books for future reads.',
  ARRAY['books', 'reading', 'literature', 'discussion', 'culture'],
  12
),
(
  'Queer Gaming Squad',
  'Gamers unite! Find teammates, discuss games, and organize gaming sessions in a welcoming environment.',
  false,
  (SELECT user_id FROM public.profiles LIMIT 1),
  'No toxic behavior. Be inclusive and welcoming to gamers of all skill levels.',
  ARRAY['gaming', 'esports', 'online', 'multiplayer', 'community'],
  15
),
(
  'Rainbow Parents',
  'Support group for LGBTQ+ parents and those planning to start families. Share experiences and advice.',
  true,
  (SELECT user_id FROM public.profiles LIMIT 1),
  'Private group for safety. Respect privacy and confidentiality. Focus on family and parenting topics.',
  ARRAY['parenting', 'family', 'support', 'private', 'advice'],
  6
),
(
  'LGBTQ+ Professionals',
  'Networking and career support for LGBTQ+ professionals. Share job opportunities and workplace advice.',
  false,
  (SELECT user_id FROM public.profiles LIMIT 1),
  'Keep discussions professional and constructive. No spam or irrelevant job postings.',
  ARRAY['career', 'professional', 'networking', 'workplace', 'opportunities'],
  22
),
(
  'Art & Creativity Collective',
  'Share your creative works, get feedback, and collaborate on artistic projects. All mediums welcome!',
  false,
  (SELECT user_id FROM public.profiles LIMIT 1),
  'Give constructive feedback. Credit original artists. Share your own work and support others.',
  ARRAY['art', 'creativity', 'collaboration', 'feedback', 'projects'],
  9
),
(
  'Mental Health & Wellness',
  'A supportive community focused on mental health awareness, self-care, and wellness resources.',
  false,
  (SELECT user_id FROM public.profiles LIMIT 1),
  'This is not a substitute for professional help. Be supportive and kind. Share resources responsibly.',
  ARRAY['mental-health', 'wellness', 'self-care', 'support', 'resources'],
  18
);