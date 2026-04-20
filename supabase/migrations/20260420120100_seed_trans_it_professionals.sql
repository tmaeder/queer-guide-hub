-- Seed: stable private test group for QA of the request-to-join flow.
-- Idempotent: guarded on name. Safe to re-run.
-- Owner is the oldest auth.users row; if the table is empty, the insert
-- is skipped (NULL created_by violates NOT NULL) and the migration is a no-op.

INSERT INTO public.community_groups
  (name, description, is_private, tags, member_count, rules, created_by)
SELECT
  'Trans IT Professionals',
  'A private space for trans and non-binary people working in IT, software, and tech-adjacent roles. Share job leads, transition-at-work stories, and peer support.',
  true,
  ARRAY['trans', 'tech', 'career', 'support'],
  0,
  'Respect pronouns. No outing. No recruiters without permission.',
  u.id
FROM (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1) u
WHERE NOT EXISTS (
  SELECT 1 FROM public.community_groups WHERE name = 'Trans IT Professionals'
);

-- Make the seed owner an admin member so approval RPCs have a valid actor.
INSERT INTO public.group_memberships (group_id, user_id, role)
SELECT cg.id, cg.created_by, 'admin'
FROM public.community_groups cg
WHERE cg.name = 'Trans IT Professionals'
ON CONFLICT (group_id, user_id) DO NOTHING;
