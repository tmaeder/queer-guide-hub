-- Insert community identity and role tags
INSERT INTO public.tags (name, category, description) 
SELECT name, category, description FROM (VALUES
  ('Bear', 'roles', 'Larger, hairy men in gay community'),
  ('Bottom', 'roles', 'Receiving partner in sexual activities'),
  ('Cub', 'roles', 'Young bear in gay community'),
  ('Otter', 'roles', 'Lean, hairy men in gay community'),
  ('Pig', 'roles', 'Person into raw or uninhibited sexual activities'),
  ('Side', 'roles', 'Person who doesn''t engage in anal penetration'),
  ('Top', 'roles', 'Giving partner in sexual activities'),
  ('Twink', 'roles', 'Young, slender gay men'),
  ('Twunk', 'roles', 'Muscular twink'),
  ('Versatile', 'roles', 'Person who both tops and bottoms')
) AS new_tags(name, category, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.tags WHERE tags.name = new_tags.name
);