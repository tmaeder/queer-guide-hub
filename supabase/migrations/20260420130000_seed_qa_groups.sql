-- QA fixture seed for Groups feature.
-- Creates deterministic QA users, three fixture groups (1 public, 2 private),
-- memberships, and one pending join request for the request-to-join flow.
--
-- Idempotent: all inserts guarded with ON CONFLICT / NOT EXISTS.
-- UUIDs are prefixed aaaaaaaa- so they are easy to grep and clean up.
--
-- Documented in Dev/web/docs/qa-groups-fixtures.md

-- 1. QA users (auth.users) + profiles
-- Stable UUIDs so e2e tests and manual QA can reference them directly.
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'qa-admin@qa.local',
   crypt('qa-password', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"qa":true,"role":"admin"}'::jsonb,
   now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'qa-member@qa.local',
   crypt('qa-password', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"qa":true,"role":"member"}'::jsonb,
   now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'qa-nonmember@qa.local',
   crypt('qa-password', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"qa":true,"role":"nonmember"}'::jsonb,
   now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'qa-requester@qa.local',
   crypt('qa-password', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"qa":true,"role":"requester"}'::jsonb,
   now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (user_id, display_name, pronouns)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'QA Admin',     'they/them'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'QA Member',    'she/her'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'QA Nonmember', 'he/him'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'QA Requester', 'they/them')
ON CONFLICT (user_id) DO NOTHING;

-- 2. Fixture groups
-- b001: public, immediate join/leave
-- b002: private, request-to-join (Trans IT Professionals - also seeded earlier
--        with a variable UUID; this entry uses a stable UUID for QA)
-- b003: private, for search + empty/non-empty variation

INSERT INTO public.community_groups
  (id, name, description, is_private, tags, rules, created_by, created_at, updated_at)
VALUES
  ('aaaaaaaa-0000-0000-0000-00000000b001',
   'LGBTQ+ Book Club',
   'Monthly book club reading queer fiction, memoir, and poetry. Open to everyone - immediate join, no approval needed.',
   false,
   ARRAY['books', 'lgbtq', 'culture'],
   'Be kind. No spoilers without warnings.',
   'aaaaaaaa-0000-0000-0000-000000000001',
   '2026-01-01 10:00:00+00', '2026-01-01 10:00:00+00'),
  ('aaaaaaaa-0000-0000-0000-00000000b002',
   'Trans IT Professionals',
   'A private space for trans and non-binary people working in IT, software, and tech-adjacent roles. Share job leads, transition-at-work stories, and peer support.',
   true,
   ARRAY['trans', 'tech', 'career', 'support'],
   'Respect pronouns. No outing. No recruiters without permission.',
   'aaaaaaaa-0000-0000-0000-000000000001',
   '2026-01-02 10:00:00+00', '2026-01-02 10:00:00+00'),
  ('aaaaaaaa-0000-0000-0000-00000000b003',
   'Polyamory Discussion Circle',
   'A closed discussion group for people practicing or exploring polyamory and ethical non-monogamy. Request to join.',
   true,
   ARRAY['polyamory', 'relationships', 'community'],
   'Confidentiality first. No judgement.',
   'aaaaaaaa-0000-0000-0000-000000000001',
   '2026-01-03 10:00:00+00', '2026-01-03 10:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- 3. Memberships
-- b001 (public): admin + one member
-- b002 (private): admin + one member
-- b003 (private): admin only (empty-state variation)
INSERT INTO public.group_memberships (group_id, user_id, role)
VALUES
  ('aaaaaaaa-0000-0000-0000-00000000b001', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin'),
  ('aaaaaaaa-0000-0000-0000-00000000b001', 'aaaaaaaa-0000-0000-0000-000000000002', 'member'),
  ('aaaaaaaa-0000-0000-0000-00000000b002', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin'),
  ('aaaaaaaa-0000-0000-0000-00000000b002', 'aaaaaaaa-0000-0000-0000-000000000002', 'member'),
  ('aaaaaaaa-0000-0000-0000-00000000b003', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (group_id, user_id) DO NOTHING;

-- 4. Pending join request: qa-requester wants to join Trans IT Professionals.
-- Drives the admin-approval test path. Stable ID for e2e targeting.
INSERT INTO public.group_join_requests (id, group_id, user_id, status, message)
VALUES
  ('aaaaaaaa-0000-0000-0000-00000000c001',
   'aaaaaaaa-0000-0000-0000-00000000b002',
   'aaaaaaaa-0000-0000-0000-000000000004',
   'pending',
   'QA fixture: pending request for admin approval flow.')
ON CONFLICT (id) DO NOTHING;

-- 5. Ensure member_count is correct (triggers may not have fired for
-- ON CONFLICT DO NOTHING rows; recompute defensively).
UPDATE public.community_groups g
SET member_count = COALESCE((
  SELECT count(*) FROM public.group_memberships m WHERE m.group_id = g.id
), 0)
WHERE g.id IN (
  'aaaaaaaa-0000-0000-0000-00000000b001',
  'aaaaaaaa-0000-0000-0000-00000000b002',
  'aaaaaaaa-0000-0000-0000-00000000b003'
);
