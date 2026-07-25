-- DAM: add a real `partner` role.
-- Must live in its OWN migration: Postgres forbids using a new enum label in the
-- same transaction that adds it, and Supabase wraps each migration file in a txn.
-- The RLS predicates that reference 'partner' land in the next migration.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'partner';
