-- Assign admin role to first user and moderator role to second user
INSERT INTO public.user_roles (user_id, role)
VALUES 
  ('a60e7b7f-a454-4b13-8cd9-458d46d67e2b', 'admin'::app_role),
  ('8ffdf1d4-78a8-4050-bc72-b600ec36c325', 'moderator'::app_role)
ON CONFLICT (user_id, role) DO NOTHING;