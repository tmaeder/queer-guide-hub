-- Run after 99991791920002. All fixtures are rolled back.
BEGIN;

INSERT INTO public.redirects (id, type, source_path, target, is_enabled)
VALUES ('c064bf41-0bb3-4c86-bbb5-5b2a351b2753', 'PATH', '/__inventory_policy_test', '/tags', false);

INSERT INTO public.username_redirects (old_username, user_id, expires_at)
SELECT '__inventory_expired_policy_test', id, now() - interval '1 day'
FROM auth.users LIMIT 1;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"role":"authenticated","user_role":"admin"}';
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM public.redirects WHERE id = 'c064bf41-0bb3-4c86-bbb5-5b2a351b2753') THEN
    RAISE EXCEPTION 'Admin inventory cannot read a disabled redirect';
  END IF;
  IF NOT EXISTS (SELECT FROM public.username_redirects WHERE old_username = '__inventory_expired_policy_test') THEN
    RAISE EXCEPTION 'Admin inventory cannot read an expired username alias';
  END IF;
END $$;

SET LOCAL request.jwt.claims = '{"role":"authenticated","user_role":"user"}';
DO $$
BEGIN
  IF EXISTS (SELECT FROM public.redirects WHERE id = 'c064bf41-0bb3-4c86-bbb5-5b2a351b2753') THEN
    RAISE EXCEPTION 'Ordinary member can read a disabled redirect';
  END IF;
  IF EXISTS (SELECT FROM public.username_redirects WHERE old_username = '__inventory_expired_policy_test') THEN
    RAISE EXCEPTION 'Ordinary member can read an expired username alias';
  END IF;
END $$;

RESET ROLE;
ROLLBACK;
