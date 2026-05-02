-- Lock down direct table privileges for profiles and rely on RLS/view
REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated; -- allow owners/admins via RLS; select privilege is needed but RLS restricts rows
GRANT UPDATE ON TABLE public.profiles TO authenticated; -- RLS enforces row ownership

-- Ensure the safe view is the only public exposure
REVOKE ALL ON TABLE public.profiles FROM anon;
GRANT SELECT ON public.profiles_public TO anon, authenticated;