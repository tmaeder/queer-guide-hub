-- 1) Ensure role enum and user_roles table exist (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin','moderator','contributor','user');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Policies (safe if they already exist via naming)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'Admins can view user_roles' AND polrelid = 'public.user_roles'::regclass
  ) THEN
    EXECUTE $$CREATE POLICY "Admins can view user_roles" ON public.user_roles
      FOR SELECT USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role))$$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'Users can view their own roles' AND polrelid = 'public.user_roles'::regclass
  ) THEN
    EXECUTE $$CREATE POLICY "Users can view their own roles" ON public.user_roles
      FOR SELECT USING (user_id = (SELECT auth.uid()))$$;
  END IF;
END $$;

-- 2) Ensure has_role helper exists
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- 3) Make prevent_role_escalation allow system/migration context (auth.uid() is null)
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Allow system contexts where auth.uid() is null (triggers, migrations)
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

-- Attach the trigger if not already attached
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_role_escalation'
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_prevent_role_escalation BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation()';
  END IF;
END $$;

-- 4) Auto-assign admin to @queer.guide emails on signup
CREATE OR REPLACE FUNCTION public.handle_domain_admin_auto_assign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_domain text;
BEGIN
  -- Extract domain safely
  v_domain := split_part(lower(NEW.email), '@', 2);
  IF v_domain = 'queer.guide' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users (after insert)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created_assign_admin'
  ) THEN
    EXECUTE 'CREATE TRIGGER on_auth_user_created_assign_admin AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_domain_admin_auto_assign()';
  END IF;
END $$;