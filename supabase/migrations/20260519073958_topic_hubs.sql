-- Topic hubs — editorial collections shown on /resources and at /resources/topic/:slug.
-- Migrated from src/pages/resources/topics.config.ts (kept as offline fallback).

create table public.topic_hubs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  icon_name text not null,             -- string key matched to a Lucide icon on the client
  tag_cluster text[] not null default '{}',
  cms_parent_slug text not null,
  adult boolean not null default false,
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index topic_hubs_sort_idx on public.topic_hubs (sort_order, slug) where is_published;

alter table public.topic_hubs enable row level security;

-- Public read of published rows.
create policy topic_hubs_public_read on public.topic_hubs
  for select using (is_published = true);

-- updated_at trigger
create or replace function public.tg_topic_hubs_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists topic_hubs_set_updated_at on public.topic_hubs;
create trigger topic_hubs_set_updated_at before update on public.topic_hubs
  for each row execute function public.tg_topic_hubs_set_updated_at();

-- Seed from topics.config.ts. icon_name is the imported icon's symbol name.
insert into public.topic_hubs (slug, title, description, icon_name, tag_cluster, cms_parent_slug, adult, sort_order) values
  ('coming-out', 'Coming out', 'Telling family, friends, colleagues. Scripts, timing, safety.', 'Heart', array['Coming Out','Questioning','Identity','Family'], 'guides/coming-out', false, 10),
  ('trans-health', 'Trans health', 'HRT, gender-affirming care, providers, navigating systems.', 'Stethoscope', array['Transgender','HRT','Gender-affirming Care','Trans Health'], 'guides/trans-health', false, 20),
  ('travel-safety', 'Travel safety', 'Country safety, border crossings, visas, what to pack.', 'Plane', array['Travel Safety','Travel','Border Crossing','Visa'], 'guides/travel-safety', false, 30),
  ('legal-rights', 'Legal rights', 'Marriage, adoption, discrimination, name & gender changes.', 'Scale', array['Legal Rights','Marriage Equality','Adoption','Discrimination'], 'guides/legal-rights', false, 40),
  ('mental-health', 'Mental health', 'Therapy, peer support, minority stress, finding help.', 'Brain', array['Mental Health','Therapy','Minority Stress','Suicide Prevention'], 'guides/mental-health', false, 50),
  ('family-relationships', 'Family & relationships', 'Parents, partners, kids, chosen family, conflict.', 'Users', array['Family','Relationships','Parenting','Chosen Family'], 'guides/family-relationships', false, 60),
  ('activism', 'Activism', 'Organising, protesting safely, NGOs, history.', 'Megaphone', array['Activism','Pride','Rights & Activism','NGO'], 'guides/activism', false, 70),
  ('sex-relationships', 'Sex & relationships', 'Safer sex, sexual health, consent, kink basics.', 'HeartHandshake', array['Sexual Health','Safer Sex','Consent','PrEP'], 'guides/sex', true, 80);
