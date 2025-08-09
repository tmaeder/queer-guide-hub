-- Temporarily relax prevent_role_escalation for bootstrap, then restore
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin','moderator','contributor','user');
  END IF;
END $$;

-- 1) Relaxed version (allow when auth.uid() is null, e.g., migrations)
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Allow system/migration context
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') THEN
    IF NEW.role IN ('admin'::public.app_role, 'moderator'::public.app_role) THEN
      IF NOT public.has_role((SELECT auth.uid()), 'admin'::public.app_role) THEN
        RAISE EXCEPTION 'Insufficient privileges to assign elevated roles';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Insert admin role
DO $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'tmaeder@me.com' LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No user found with email %', 'tmaeder@me.com';
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;

-- 3) Restore strict version
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    IF NEW.role IN ('admin'::public.app_role, 'moderator'::public.app_role) THEN
      IF NOT public.has_role((SELECT auth.uid()), 'admin'::public.app_role) THEN
        RAISE EXCEPTION 'Insufficient privileges to assign elevated roles';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;