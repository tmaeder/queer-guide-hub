-- Entity-link applier: approved entity_link_review rows now have an effect.
-- Before this, triage_action('entity-links','approve') only flipped status —
-- no consumer existed, so admin approvals changed nothing (found 2026-07-21).
--
-- Model:
--  * news_article_entities — junction of applied article↔entity links
--    (personality/organisation/venue/…); public-read, written only by the
--    SECURITY DEFINER applier.
--  * city/country links additionally union into news_articles.city_ids /
--    country_ids, which the frontend already consumes for news filters.
--  * AFTER UPDATE trigger on entity_link_review applies on any transition to
--    status='approved' with a candidate_id — independent of which surface
--    (triage_action RPC, direct SQL) performed the approval.

create table if not exists public.news_article_entities (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_articles(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  source text not null default 'entity_link_review',
  link_review_id uuid references public.entity_link_review(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (article_id, entity_type, entity_id)
);

comment on table public.news_article_entities is
  'Applied article↔entity links from approved entity_link_review rows. City/country links additionally union into news_articles.city_ids/country_ids.';

create index if not exists news_article_entities_entity_idx
  on public.news_article_entities (entity_type, entity_id);

alter table public.news_article_entities enable row level security;

do $$ begin
  create policy "Public can read news article entities"
    on public.news_article_entities for select using (true);
exception when duplicate_object then null; end $$;

create or replace function public.apply_entity_link(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row entity_link_review%rowtype;
begin
  select * into v_row from entity_link_review where id = p_review_id;
  if not found or v_row.status <> 'approved' or v_row.candidate_id is null or v_row.article_id is null then
    return;
  end if;

  insert into news_article_entities (article_id, entity_type, entity_id, link_review_id)
  values (v_row.article_id, v_row.entity_type, v_row.candidate_id, v_row.id)
  on conflict (article_id, entity_type, entity_id) do nothing;

  if v_row.entity_type = 'city' then
    update news_articles
       set city_ids = (select array(select distinct e from unnest(coalesce(city_ids, '{}') || v_row.candidate_id) e))
     where id = v_row.article_id
       and not (coalesce(city_ids, '{}') @> array[v_row.candidate_id]);
  elsif v_row.entity_type = 'country' then
    update news_articles
       set country_ids = (select array(select distinct e from unnest(coalesce(country_ids, '{}') || v_row.candidate_id) e))
     where id = v_row.article_id
       and not (coalesce(country_ids, '{}') @> array[v_row.candidate_id]);
  end if;
end;
$$;

revoke execute on function public.apply_entity_link(uuid) from public, anon, authenticated;

create or replace function public.trg_apply_entity_link()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'approved' and (old.status is distinct from 'approved') then
    perform apply_entity_link(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists entity_link_review_apply on public.entity_link_review;
create trigger entity_link_review_apply
  after update on public.entity_link_review
  for each row execute function public.trg_apply_entity_link();

-- Backfill: apply already-approved rows that have a candidate.
do $$
declare r record;
begin
  for r in select id from entity_link_review where status = 'approved' and candidate_id is not null loop
    perform apply_entity_link(r.id);
  end loop;
end $$;
