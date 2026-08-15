-- Substance interaction matrix: schema and read RPCs.
--
-- WHAT THIS IS FOR
--
-- The glossary now carries ~80 substance terms, each with a description and a
-- link to saferparty. What it cannot answer is the question people actually ask
-- before a night out: *can I combine these two?* That question has a real answer
-- with real consequences, and the harm-reduction community publishes it.
--
-- SYMMETRY IS ENFORCED BY THE SCHEMA, NOT BY CONVENTION
--
-- An interaction is a property of an unordered PAIR. Storing both directions
-- would let A→B and B→A disagree, and a matrix that contradicts itself on a
-- safety page is worse than no matrix. So exactly one row exists per pair,
-- pinned by `tag_a_id < tag_b_id`, and the read RPCs resolve direction. The
-- source data was checked for this before import: of 421 unordered pairs, zero
-- disagreed across the two directions.
--
-- STATUS IS A NORMALISED KEY, NOT THE SOURCE STRING
--
-- TripSit's labels ("Low Risk & No Synergy") are display text with an ampersand
-- and mixed case. Storing them raw would put source formatting into every URL,
-- filter and i18n key. The six keys below are ours; `severity_rank` is what the
-- UI sorts by so that "most dangerous first" is a database fact rather than a
-- hand-maintained array in TypeScript that can drift out of order.
--
-- ATTRIBUTION IS A COLUMN, NOT A FOOTNOTE
--
-- `source` and `source_url` are NOT NULL with defaults, so an unattributed row
-- cannot exist. The data and the notes are TripSit's work; every surface that
-- renders a row is expected to render the credit, and keeping provenance on the
-- row means a future second source can be added without guessing where each
-- claim came from — or removed wholesale if that ever becomes necessary.

create table if not exists public.substance_interactions (
  id          uuid primary key default gen_random_uuid(),
  tag_a_id    uuid not null references public.unified_tags(id) on delete cascade,
  tag_b_id    uuid not null references public.unified_tags(id) on delete cascade,
  status      text not null,
  note        text,
  source      text not null default 'tripsit',
  source_url  text not null default 'https://combo.tripsit.me/',
  source_pair text,
  fetched_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint substance_interactions_status_check check (status = any (array[
    'dangerous', 'unsafe', 'caution',
    'low_risk_decrease', 'low_risk_no_synergy', 'low_risk_synergy', 'unknown'])),
  -- One row per unordered pair. Both halves are load-bearing: the inequality
  -- picks a canonical direction, and without it the unique index below would
  -- happily accept the mirrored duplicate.
  constraint substance_interactions_canonical_order check (tag_a_id < tag_b_id)
);

create unique index if not exists substance_interactions_pair_uniq
  on public.substance_interactions (tag_a_id, tag_b_id);
create index if not exists substance_interactions_a_idx on public.substance_interactions (tag_a_id);
create index if not exists substance_interactions_b_idx on public.substance_interactions (tag_b_id);

comment on table public.substance_interactions is
  'Unordered pairwise drug-interaction ratings. One row per pair (tag_a_id < tag_b_id); read via get_substance_interactions / substance_interaction_matrix.';
comment on column public.substance_interactions.source_pair is
  'The upstream key pair, e.g. "ghb/gbl|opioids". Kept so a re-import can be diffed against what we actually stored.';

alter table public.substance_interactions enable row level security;

-- Public read. This is harm-reduction information whose entire value is being
-- readable by someone who is not logged in, at 2am, on a phone.
drop policy if exists substance_interactions_public_read on public.substance_interactions;
create policy substance_interactions_public_read on public.substance_interactions
  for select to public using (true);

-- A GRANT without a policy is inert and a policy without a GRANT is unreachable
-- (20260902100000, 20260906100000) — both halves, and writes stay with the
-- service role that runs the importer.
grant select on public.substance_interactions to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.substance_interactions from anon, authenticated;

-- Sort order for "worst first". IMMUTABLE so it can be used in an index later.
create or replace function public.substance_interaction_rank(p_status text)
returns int language sql immutable parallel safe as $$
  select case p_status
    when 'dangerous'           then 1
    when 'unsafe'              then 2
    when 'caution'             then 3
    when 'unknown'             then 4
    when 'low_risk_decrease'   then 5
    when 'low_risk_no_synergy' then 6
    when 'low_risk_synergy'    then 7
    else 99 end;
$$;

-- Everything one substance interacts with, resolved from whichever side of the
-- pair it sits on. Worst first — a reader scanning this list is looking for the
-- thing that will hurt them, and it must not be below the fold.
create or replace function public.get_substance_interactions(p_tag_id uuid)
returns table (
  other_id uuid, other_slug text, other_name text,
  status text, severity int, note text, source text, source_url text
)
language sql stable security definer set search_path = public as $$
  select o.id, o.slug, o.name, i.status,
         public.substance_interaction_rank(i.status), i.note, i.source, i.source_url
    from public.substance_interactions i
    join public.unified_tags o
      on o.id = case when i.tag_a_id = p_tag_id then i.tag_b_id else i.tag_a_id end
   where (i.tag_a_id = p_tag_id or i.tag_b_id = p_tag_id)
     and o.status = 'active'
   order by public.substance_interaction_rank(i.status), o.name;
$$;

-- One pair, either order — backs the two-substance checker.
create or replace function public.get_substance_interaction_pair(p_a uuid, p_b uuid)
returns table (status text, severity int, note text, source text, source_url text)
language sql stable security definer set search_path = public as $$
  select i.status, public.substance_interaction_rank(i.status), i.note, i.source, i.source_url
    from public.substance_interactions i
   where (i.tag_a_id = least(p_a, p_b) and i.tag_b_id = greatest(p_a, p_b));
$$;

-- The whole grid in one round trip. Returns the axis (every substance that has
-- at least one interaction) plus the flat cell list; the client pivots. Sending
-- ~440 cells beats 30 separate row queries, and a full N x N payload would be
-- mostly nulls.
create or replace function public.substance_interaction_matrix()
returns jsonb language sql stable security definer set search_path = public as $$
  with involved as (
    select distinct t.id, t.slug, t.name
      from public.unified_tags t
      join public.substance_interactions i on i.tag_a_id = t.id or i.tag_b_id = t.id
     where t.status = 'active'
  )
  select jsonb_build_object(
    'axis', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'slug', slug, 'name', name)
                                       order by name) from involved), '[]'::jsonb),
    'cells', coalesce((select jsonb_agg(jsonb_build_object(
                'a', i.tag_a_id, 'b', i.tag_b_id, 'status', i.status,
                'severity', public.substance_interaction_rank(i.status),
                'note', i.note))
              from public.substance_interactions i
              join involved ia on ia.id = i.tag_a_id
              join involved ib on ib.id = i.tag_b_id), '[]'::jsonb),
    'source', 'tripsit',
    'source_url', 'https://combo.tripsit.me/'
  );
$$;

revoke all on function public.get_substance_interactions(uuid) from public;
revoke all on function public.get_substance_interaction_pair(uuid, uuid) from public;
revoke all on function public.substance_interaction_matrix() from public;
grant execute on function public.get_substance_interactions(uuid) to anon, authenticated, service_role;
grant execute on function public.get_substance_interaction_pair(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.substance_interaction_matrix() to anon, authenticated, service_role;
grant execute on function public.substance_interaction_rank(text) to anon, authenticated, service_role;

do $verify$
declare v_a uuid; v_b uuid; v_n int;
begin
  select id into v_a from public.unified_tags where slug = 'mdma';
  select id into v_b from public.unified_tags where slug = 'maois';
  if v_a is null or v_b is null then raise exception 'substance_interactions: fixture tags missing'; end if;

  -- The canonical-order CHECK must actually reject a mirrored insert.
  begin
    insert into public.substance_interactions (tag_a_id, tag_b_id, status)
    values (greatest(v_a, v_b), least(v_a, v_b), 'caution');
    raise exception 'substance_interactions: mirrored row was accepted';
  exception when check_violation then null;
  end;

  -- And a bad status must be rejected.
  begin
    insert into public.substance_interactions (tag_a_id, tag_b_id, status)
    values (least(v_a, v_b), greatest(v_a, v_b), 'Low Risk & No Synergy');
    raise exception 'substance_interactions: raw source label was accepted as a status';
  exception when check_violation then null;
  end;

  select count(*) into v_n from public.substance_interactions;
  if v_n <> 0 then raise exception 'substance_interactions: table should be empty, has %', v_n; end if;
end
$verify$;
