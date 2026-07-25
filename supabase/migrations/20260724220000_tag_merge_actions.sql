-- Conservative auto-merge: ONLY pairs that are both highly similar AND lexical string-variants.
-- Embedding similarity alone is ~50% false-positive at >=0.97 (e.g. Misterbandb/LGBTQ-Friendly,
-- AIDS/HIV) — the lexical_variant gate is what makes this safe. Batched (search-trigger storm).
create or replace function public.run_tag_auto_merge(p_min_similarity numeric default 0.97, p_limit int default 25)
returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_n int := 0;
begin
  perform public.assert_admin_or_internal();
  for r in
    select id, canonical_id, duplicate_id from public.tag_merge_review
    where status = 'pending' and lexical_variant = true and similarity >= p_min_similarity
    order by similarity desc
    limit greatest(p_limit, 0)
  loop
    begin
      perform public.merge_tag_concept(r.canonical_id, r.duplicate_id, 'auto', 'auto:lexical-variant');
      update public.tag_merge_review set status='auto_merged', decided_at=now(), decided_by='auto' where id=r.id;
      v_n := v_n + 1;
    exception when others then
      update public.tag_merge_review set status='rejected', decided_at=now(), decided_by='auto',
             reason = coalesce(reason,'')||' | auto-merge failed: '||sqlerrm where id=r.id;
    end;
  end loop;
  return v_n;
end $$;

create or replace function public.approve_tag_merge(p_review_id uuid, p_actor text default 'admin')
returns uuid
language plpgsql security definer set search_path = public as $$
declare r public.tag_merge_review; v_audit uuid;
begin
  perform public.assert_admin_or_internal();
  select * into r from public.tag_merge_review where id = p_review_id;
  if not found then raise exception 'approve_tag_merge: review not found'; end if;
  if r.status <> 'pending' then raise exception 'approve_tag_merge: already %', r.status; end if;
  v_audit := public.merge_tag_concept(r.canonical_id, r.duplicate_id, p_actor, 'review:approve');
  update public.tag_merge_review set status='approved', decided_at=now(), decided_by=p_actor where id=p_review_id;
  return v_audit;
end $$;

-- Reject a proposed merge. p_add_exclusion=true records a permanent do-not-merge guard.
create or replace function public.reject_tag_merge(p_review_id uuid, p_add_exclusion boolean default false, p_actor text default 'admin')
returns boolean
language plpgsql security definer set search_path = public as $$
declare r public.tag_merge_review;
begin
  perform public.assert_admin_or_internal();
  select * into r from public.tag_merge_review where id = p_review_id;
  if not found then raise exception 'reject_tag_merge: review not found'; end if;
  update public.tag_merge_review set status='rejected', decided_at=now(), decided_by=p_actor where id=p_review_id;
  if p_add_exclusion then
    insert into public.tag_relationship_exclusions (tag1_id, tag2_id, reason)
    values (least(r.canonical_id,r.duplicate_id), greatest(r.canonical_id,r.duplicate_id),
            'rejected merge — kept distinct via review')
    on conflict do nothing;
  end if;
  return true;
end $$;

revoke all on function public.run_tag_auto_merge(numeric,int) from public;
revoke all on function public.approve_tag_merge(uuid,text) from public;
revoke all on function public.reject_tag_merge(uuid,boolean,text) from public;
grant execute on function public.run_tag_auto_merge(numeric,int) to service_role;
grant execute on function public.approve_tag_merge(uuid,text) to service_role, authenticated;
grant execute on function public.reject_tag_merge(uuid,boolean,text) to service_role, authenticated;
