-- Milestone ↔ personality link backfill support.
--
-- Two pieces:
--   1. milestone_link_proposals — a review queue for name-matched links the
--      backfill is NOT confident enough to auto-insert (description-only matches,
--      mononyms, ambiguous common names). High-confidence verbatim full-name
--      title matches go straight into milestone_links; everything else lands
--      here for an admin to approve/reject. Kept OUT of milestone_links so the
--      public get_milestone RPC never renders an unreviewed guess.
--   2. history_key_figures() — powers the re-enabled "key figures of this era"
--      strip on /history, aggregated from the (now populated) links.

-- ---------------------------------------------------------------------------
-- milestone_link_proposals
-- ---------------------------------------------------------------------------
create table if not exists public.milestone_link_proposals (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestones(id) on delete cascade,
  entity_type text not null default 'personality'
    check (entity_type in ('personality','event','venue','news','organization')),
  entity_id uuid not null,
  matched_name text,                 -- the personality name string that matched
  matched_field text                 -- where it matched: 'title' | 'description'
    check (matched_field in ('title','description')),
  confidence text not null           -- 'medium' (desc, unique) | 'low' (mononym/ambiguous)
    check (confidence in ('high','medium','low')),
  score numeric,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  unique (milestone_id, entity_type, entity_id)
);

create index if not exists idx_milestone_link_proposals_status
  on public.milestone_link_proposals(status, confidence);
create index if not exists idx_milestone_link_proposals_entity
  on public.milestone_link_proposals(entity_type, entity_id);

alter table public.milestone_link_proposals enable row level security;
grant select, insert, update, delete on public.milestone_link_proposals to service_role;

-- Admin-only surface — never exposed to anon/authenticated directly; the review
-- UI reads through the SECURITY DEFINER list RPC below.
drop policy if exists milestone_link_proposals_admin_all on public.milestone_link_proposals;
create policy milestone_link_proposals_admin_all on public.milestone_link_proposals
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- list_milestone_link_proposals — resolved rows for the admin review queue
-- ---------------------------------------------------------------------------
create or replace function public.list_milestone_link_proposals(
  p_status text default 'pending',
  p_limit int default 200
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(row order by (row->>'created_at')), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', pr.id,
      'milestone_id', pr.milestone_id,
      'milestone_title', m.title,
      'milestone_slug', m.slug,
      'milestone_date', m.date,
      'entity_type', pr.entity_type,
      'entity_id', pr.entity_id,
      'personality_name', p.name,
      'personality_slug', p.slug,
      'personality_image_url', p.image_url,
      'matched_name', pr.matched_name,
      'matched_field', pr.matched_field,
      'confidence', pr.confidence,
      'status', pr.status,
      'created_at', pr.created_at
    ) as row
    from public.milestone_link_proposals pr
    join public.milestones m on m.id = pr.milestone_id
    left join public.personalities p
      on p.id = pr.entity_id and pr.entity_type = 'personality'
    where public.is_admin(auth.uid())
      and (p_status is null or pr.status = p_status)
    order by pr.created_at
    limit greatest(1, least(p_limit, 1000))
  ) s;
$$;

revoke all on function public.list_milestone_link_proposals(text, int) from public;
grant execute on function public.list_milestone_link_proposals(text, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- approve_milestone_link_proposal — commit a proposal into milestone_links
-- ---------------------------------------------------------------------------
create or replace function public.approve_milestone_link_proposal(
  p_id uuid,
  p_role text default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  pr public.milestone_link_proposals%rowtype;
begin
  perform public.assert_admin_or_internal();

  select * into pr from public.milestone_link_proposals where id = p_id for update;
  if not found then
    raise exception 'proposal % not found', p_id;
  end if;

  insert into public.milestone_links (milestone_id, entity_type, entity_id, role, sort_order)
  values (pr.milestone_id, pr.entity_type, pr.entity_id, p_role,
          coalesce((select max(sort_order) + 1 from public.milestone_links
                    where milestone_id = pr.milestone_id), 0))
  on conflict (milestone_id, entity_type, entity_id) do nothing;

  update public.milestone_link_proposals
    set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_id;
end;
$$;

revoke all on function public.approve_milestone_link_proposal(uuid, text) from public;
grant execute on function public.approve_milestone_link_proposal(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- reject_milestone_link_proposal
-- ---------------------------------------------------------------------------
create or replace function public.reject_milestone_link_proposal(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.assert_admin_or_internal();
  update public.milestone_link_proposals
    set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_id;
  if not found then
    raise exception 'proposal % not found', p_id;
  end if;
end;
$$;

revoke all on function public.reject_milestone_link_proposal(uuid) from public;
grant execute on function public.reject_milestone_link_proposal(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- history_key_figures — personalities linked to published era milestones.
-- One row per (personality, milestone) link; the client groups by era (era
-- boundaries live in src/config/historyEras.ts) and picks the top N per era.
-- Mirrors get_milestone's visibility + safety gating so anon never sees a
-- figure from a gated milestone.
-- ---------------------------------------------------------------------------
create or replace function public.history_key_figures()
returns table (
  personality_id uuid,
  name text,
  slug text,
  image_url text,
  year int
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select p.id, p.name, p.slug, p.image_url,
         extract(year from m.date)::int as year
  from public.milestone_links ml
  join public.milestones m on m.id = ml.milestone_id
  join public.personalities p on p.id = ml.entity_id
  where ml.entity_type = 'personality'
    and m.status = 'published'
    and m.duplicate_of_id is null
    and m.date is not null
    and ((not m.safety_gated) or (select auth.uid()) is not null)
    and p.visibility = 'public'
    and p.duplicate_of_id is null;
$$;

revoke all on function public.history_key_figures() from public;
grant execute on function public.history_key_figures() to anon, authenticated, service_role;
