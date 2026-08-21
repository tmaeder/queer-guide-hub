-- Milestone review queue (data-quality, 2026). `category='other'` is 49% of
-- the live corpus (1,570/3,208) — the largest single bucket, larger than any
-- real category — almost certainly an artifact of the bulk import's
-- enrichment defaulting ambiguous rows rather than genuine
-- uncategorizability. category drives public badges/filters, so a
-- reclassification pass must not auto-apply blindly; this is the human gate,
-- mirroring personality_review_queue / city_review_queue. The reclassifier
-- itself (scripts/data-quality/reclassify-milestone-categories.ts) is a
-- separate, later step — this migration only builds the queue + RPCs.

begin;

create table if not exists public.milestone_review_queue (
  id             uuid primary key default gen_random_uuid(),
  milestone_id   uuid not null references public.milestones(id) on delete cascade,
  field          text not null check (field in ('category')),
  proposed_value jsonb not null,
  citations      jsonb not null default '[]'::jsonb,
  confidence     numeric(3,2),
  model          text,
  status         text not null default 'open' check (status in ('open','approved','rejected')),
  reviewer_id    uuid references auth.users(id) on delete set null,
  reviewer_note  text,
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz
);
create unique index if not exists uq_milestone_review_queue_open
  on public.milestone_review_queue(milestone_id, field) where status='open';
alter table public.milestone_review_queue enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='milestone_review_queue' and policyname='admin_read_milestone_review_queue') then
    create policy admin_read_milestone_review_queue on public.milestone_review_queue
      for select to authenticated using (has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]));
  end if;
end $$;

create or replace function public.approve_milestone_review(p_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer set search_path to 'public', 'pg_temp'
as $$
declare r public.milestone_review_queue%rowtype;
begin
  if not has_any_role_jwt(array['admin'::app_role]) then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into r from public.milestone_review_queue where id=p_id and status='open' for update;
  if not found then raise exception 'review item not found or not open'; end if;

  if r.field = 'category' then
    update public.milestones set category=r.proposed_value->>'value',
      field_provenance=jsonb_set(coalesce(field_provenance,'{}'::jsonb),'{category}',
        jsonb_build_object('source','llm+human','confidence',r.confidence,'approved_at',now()),true),
      updated_at=now() where id=r.milestone_id;
  end if;

  update public.milestone_review_queue
     set status='approved', reviewer_id=auth.uid(), reviewed_at=now(), reviewer_note=p_note where id=p_id;
  if not exists (select 1 from public.milestone_review_queue where milestone_id=r.milestone_id and status='open') then
    update public.milestones set needs_attention=false where id=r.milestone_id;
  end if;
  return jsonb_build_object('approved',true,'field',r.field,'milestone_id',r.milestone_id);
end;
$$;

create or replace function public.reject_milestone_review(p_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer set search_path to 'public', 'pg_temp'
as $$
declare r public.milestone_review_queue%rowtype;
begin
  if not has_any_role_jwt(array['admin'::app_role]) then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into r from public.milestone_review_queue where id=p_id and status='open' for update;
  if not found then raise exception 'review item not found or not open'; end if;
  update public.milestone_review_queue
     set status='rejected', reviewer_id=auth.uid(), reviewed_at=now(), reviewer_note=p_note where id=p_id;
  if not exists (select 1 from public.milestone_review_queue where milestone_id=r.milestone_id and status='open') then
    update public.milestones set needs_attention=false where id=r.milestone_id;
  end if;
  return jsonb_build_object('rejected',true,'field',r.field,'milestone_id',r.milestone_id);
end;
$$;

revoke all on function public.approve_milestone_review(uuid,text) from public;
revoke all on function public.reject_milestone_review(uuid,text) from public;
grant execute on function public.approve_milestone_review(uuid,text) to authenticated, service_role;
grant execute on function public.reject_milestone_review(uuid,text) to authenticated, service_role;

commit;
