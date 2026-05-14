-- Promote a specific user to admin by email
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'tmaeder@me.com' LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No user found with email %', 'tmaeder@me.com';
  END IF;

  -- Grant admin role (idempotent)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Log security event
  PERFORM public.log_enhanced_security_event(
    'ROLE_BOOTSTRAP_ADMIN',
    v_uid,
    jsonb_build_object('email','tmaeder@me.com','role','admin','source','bootstrap'),
    'high'
  );
END $$;