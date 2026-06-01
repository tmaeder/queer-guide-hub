-- Fix public.is_admin(uuid).
--
-- It was defined with `SET search_path TO ''` AND an unqualified `FROM
-- user_roles`, so with the empty search_path the table never resolved and the
-- function raised `relation "user_roles" does not exist` on EVERY call —
-- verified both as a direct call and embedded in a WHERE predicate (the way an
-- RLS USING clause evaluates it).
--
-- Blast radius: 49 RLS policies and 3 functions reference is_admin. The app
-- mostly survived because RLS evaluates permissive policies with OR and
-- short-circuits when an earlier policy passes — so is_admin was usually never
-- evaluated. But any admin-override path gated SOLELY on is_admin (e.g. an admin
-- mutating a row they don't otherwise have access to) errored out.
--
-- Fix: qualify the table (public.user_roles), keeping the secure empty
-- search_path. Behaviour-preserving for non-admins — is_admin still returns
-- false, so this cannot widen access; it only restores the intended admin path.
-- Verified post-fix: is_admin(<admin>) = true, is_admin(<non-admin>) = false.
create or replace function public.is_admin(user_id uuid)
returns boolean language sql stable set search_path to ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = is_admin.user_id
      and ur.role = 'admin'
  );
$$;
