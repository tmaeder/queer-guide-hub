-- Insert sample profiles with placeholder user IDs
-- Note: These are placeholder profiles for demonstration purposes
-- In a real app, these would be created when users sign up

INSERT INTO public.profiles (
  user_id,
  display_name,
  bio,
  avatar_url,
  location,
  pronouns,
  is_business,
  created_at,
  updated_at
) VALUES 
(
  '11111111-1111-1111-1111-111111111111',
  'Alex Rainbow',
  'Pride advocate and community organizer. Love bringing people together for events and celebrations! 🏳️‍🌈',
  NULL,
  'San Francisco, CA',
  'they/them',
  false,
  now() - interval '6 months',
  now() - interval '6 months'
),
(
  '22222222-2222-2222-2222-222222222222',
  'Jordan Smith',
  'Bookworm and coffee enthusiast. Always looking for new LGBTQ+ literature recommendations.',
  NULL,
  'Portland, OR',
  'she/her',
  false,
  now() - interval '4 months',
  now() - interval '4 months'
),
(
  '33333333-3333-3333-3333-333333333333',
  'Casey Williams',
  'Gaming enthusiast and streamer. Building inclusive gaming communities one match at a time.',
  NULL,
  'Austin, TX',
  'he/him',
  false,
  now() - interval '3 months',
  now() - interval '3 months'
),
(
  '44444444-4444-4444-4444-444444444444',
  'Riley Chen',
  'Software engineer and parent. Balancing code, kids, and community involvement.',
  NULL,
  'Seattle, WA',
  'she/they',
  false,
  now() - interval '8 months',
  now() - interval '8 months'
),
(
  '55555555-5555-5555-5555-555555555555',
  'Sam Rodriguez',
  'Marketing professional with a passion for diversity and inclusion in tech.',
  NULL,
  'Denver, CO',
  'he/him',
  true,
  now() - interval '2 months',
  now() - interval '2 months'
),
(
  '66666666-6666-6666-6666-666666666666',
  'Taylor Park',
  'Digital artist and illustrator. Creating queer art that celebrates our community.',
  NULL,
  'Los Angeles, CA',
  'they/she',
  true,
  now() - interval '5 months',
  now() - interval '5 months'
);