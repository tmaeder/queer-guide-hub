begin;

create or replace function public.normalize_personality_data_contract()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.wikidata_qid is not null then
    new.wikidata_qid := upper(btrim(new.wikidata_qid));
    new.wikidata_status := case when new.wikidata_qid ~ '^Q[0-9]+$'
      then 'resolved' else 'needs_review' end;
  elsif new.wikidata_status = 'resolved' then
    new.wikidata_status := 'needs_review';
  end if;
  if new.image_url is not null and (
    new.image_url ~* '/(default|users/default)/.*male[.]jpg'
    or new.image_url ~* '(drag.race|season).*(poster|promotional[_ -]?photo)'
  ) then
    new.image_url := null;
    new.image_status := 'rejected';
  elsif new.image_url is not null and new.image_status = 'pending' then
    new.image_status := 'needs_review';
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_personality_data_contract()
  from public, anon, authenticated;

insert into private.personality_remediation_audit
  (batch_key, personality_id, field_name, old_value, new_value, reason)
select 'personality-placeholder-images-v1', p.id, 'image_url', to_jsonb(p.image_url), null,
       'shared default avatar or season artwork is not a verified portrait'
from public.personalities p
where p.image_url is not null and (
  p.image_url ~* '/(default|users/default)/.*male[.]jpg'
  or p.image_url ~* '(drag.race|season).*(poster|promotional[_ -]?photo)'
)
on conflict do nothing;

update public.personalities p
set image_url=null, image_status='rejected', updated_at=now()
from private.personality_remediation_audit a
where a.batch_key='personality-placeholder-images-v1'
  and a.personality_id=p.id and a.field_name='image_url'
  and p.image_url is not null;

commit;
