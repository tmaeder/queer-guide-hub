-- 1. Canonicalize legacy relation_type values. Store only broader/related/exact_match.
--    Flip any legacy 'narrower' edge into a 'broader' edge by swapping endpoints
--    (RHS is evaluated from the OLD row, so this swap is correct).
update public.tag_relations
set source_tag_id = target_tag_id,
    target_tag_id = source_tag_id,
    relation_type = 'broader'
where lower(relation_type) = 'narrower';

update public.tag_relations
set relation_type = case
  when lower(relation_type) in ('broader', 'parent')                then 'broader'
  when lower(relation_type) in ('exact_match', 'exactmatch', 'same_as') then 'exact_match'
  else 'related'
end
where lower(relation_type) not in ('broader', 'related', 'exact_match');

-- 2. Drop self-loops and exact directional duplicates before constraining.
delete from public.tag_relations where source_tag_id = target_tag_id;
delete from public.tag_relations a using public.tag_relations b
where a.ctid < b.ctid
  and a.source_tag_id = b.source_tag_id
  and a.target_tag_id = b.target_tag_id
  and a.relation_type = b.relation_type;

-- 3. Constraints: predicate vocab + no self edge.
alter table public.tag_relations
  add constraint tag_relations_relation_type_chk
    check (relation_type in ('broader', 'related', 'exact_match')),
  add constraint tag_relations_no_self_chk
    check (source_tag_id <> target_tag_id);

create unique index if not exists tag_relations_uniq
  on public.tag_relations (source_tag_id, target_tag_id, relation_type);

-- 4. Cycle guard: a new broader edge child->parent must not close a loop
--    (i.e. child must not already be an ancestor of parent).
create or replace function public.tag_relations_no_cycle()
returns trigger language plpgsql as $$
begin
  if new.relation_type = 'broader' then
    if exists (
      with recursive anc as (
        select new.target_tag_id as node
        union all
        select r.target_tag_id
        from public.tag_relations r
        join anc on r.source_tag_id = anc.node
        where r.relation_type = 'broader'
      )
      select 1 from anc where node = new.source_tag_id
    ) then
      raise exception 'tag_relations: broader edge %->% would create a cycle',
        new.source_tag_id, new.target_tag_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tag_relations_no_cycle on public.tag_relations;
create trigger trg_tag_relations_no_cycle
  before insert or update on public.tag_relations
  for each row execute function public.tag_relations_no_cycle();

-- 5. Directional convenience views (narrower is derived, never stored).
create or replace view public.tag_broader as
select source_tag_id as child_id, target_tag_id as parent_id, confidence, review_status
from public.tag_relations where relation_type = 'broader';

create or replace view public.tag_narrower as
select target_tag_id as parent_id, source_tag_id as child_id, confidence, review_status
from public.tag_relations where relation_type = 'broader';

grant select on public.tag_broader, public.tag_narrower to anon, authenticated, service_role;
