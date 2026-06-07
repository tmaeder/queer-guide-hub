-- user_role_permissions — per-content-type granular permissions backing the
-- editor role tier. Read by useGranularRoles (effectiveRole='editor' when a
-- user has rows here); admin-managed. Makes the long-defined-but-unwired
-- `editor` app_role a first-class, DB-enforced role.
--
-- No seed: prod currently has only admin (3) + moderator (1) users, zero
-- editors. Admins assign editors by inserting rows here. Tiny table — safe on
-- the disk-constrained prod (schema + RLS only, no bulk data).

create table if not exists public.user_role_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null,
  permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, content_type)
);

create index if not exists idx_user_role_permissions_user
  on public.user_role_permissions(user_id);

alter table public.user_role_permissions enable row level security;

-- A user reads their own permission rows; admins read all.
create policy "urp_select_own_or_admin"
  on public.user_role_permissions
  for select to authenticated
  using (
    auth.uid() = user_id
    or public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Only admins write.
create policy "urp_admin_insert"
  on public.user_role_permissions
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy "urp_admin_update"
  on public.user_role_permissions
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy "urp_admin_delete"
  on public.user_role_permissions
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

grant select, insert, update, delete on public.user_role_permissions to authenticated;

create trigger trg_urp_updated_at
  before update on public.user_role_permissions
  for each row execute function public.set_updated_at();
