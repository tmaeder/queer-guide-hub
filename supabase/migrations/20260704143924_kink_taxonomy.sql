-- Kink/interest checklist taxonomy (KinkList-style, LGBTQ+-adapted).
-- Deliberately NOT unified_tags: needs axis/versioning metadata and must stay
-- out of search indexing, admin tag tooling and SEO surfaces. Vocabulary itself
-- is 18+ content — readable only by intimate-eligible members.

create table if not exists public.kink_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,                     -- STABLE public id (never positional)
  label text not null,
  label_i18n jsonb not null default '{}'::jsonb,
  description text,
  description_i18n jsonb not null default '{}'::jsonb,
  axis text not null check (axis in ('general','give_receive','self_partner','dom_sub')),
  sort_order int not null default 100,
  is_active boolean not null default true,
  added_in_version int not null default 1
);

create table if not exists public.kink_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.kink_categories(id) on delete cascade,
  slug text not null unique,                     -- stable id, e.g. 'impact-spanking'
  label text not null,
  label_i18n jsonb not null default '{}'::jsonb,
  description text,                              -- one-line consent-forward definition
  description_i18n jsonb not null default '{}'::jsonb,
  axis_override text check (axis_override in ('general','give_receive','self_partner','dom_sub')),
  discussion_recommended boolean not null default false,
  sort_order int not null default 100,
  is_active boolean not null default true,
  added_in_version int not null default 1,
  deprecated_at timestamptz,
  replaced_by_id uuid references public.kink_items(id),
  unified_tag_slug text                          -- bridge to existing intimate-* unified_tags
);

create index if not exists kink_items_category_idx
  on public.kink_items(category_id, sort_order);

create table if not exists public.kink_taxonomy_versions (
  version int primary key,
  released_at timestamptz not null default now(),
  notes text
);

alter table public.kink_categories enable row level security;
alter table public.kink_categories force row level security;
alter table public.kink_items enable row level security;
alter table public.kink_items force row level security;
alter table public.kink_taxonomy_versions enable row level security;
alter table public.kink_taxonomy_versions force row level security;

-- Read: intimate-eligible members only. Writes: migrations/service_role only
-- (no insert/update/delete policies).
drop policy if exists kink_categories_member_read on public.kink_categories;
create policy kink_categories_member_read on public.kink_categories
  for select to authenticated
  using (is_active and public.is_intimate_eligible(auth.uid()));

drop policy if exists kink_items_member_read on public.kink_items;
create policy kink_items_member_read on public.kink_items
  for select to authenticated
  using (is_active and public.is_intimate_eligible(auth.uid()));

drop policy if exists kink_taxonomy_versions_member_read on public.kink_taxonomy_versions;
create policy kink_taxonomy_versions_member_read on public.kink_taxonomy_versions
  for select to authenticated
  using (public.is_intimate_eligible(auth.uid()));
