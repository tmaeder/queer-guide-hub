-- Two community centres shown on /meet published U+FFFD where a letter was lost
-- at ingest ("Z�rich", "L�becker Strasse"). Exact, guarded replacements only:
-- each row is matched by id AND by the broken text, so a later edit wins.
-- The wider set (~105 venue fields carrying U+FFFD) needs per-row evidence
-- for the missing letter and is not touched here.
select set_config('app.actor', 'migration:community_centre_replacement_chars', true);

update public.venues
set description = replace(description, 'Z' || chr(65533) || 'rich', 'Zürich'),
    city = replace(city, 'Z' || chr(65533) || 'rich', 'Zürich')
where id = '4165cace-4c9e-40d4-a23b-67706b49c1df'
  and (description like '%Z' || chr(65533) || 'rich%' or city like '%Z' || chr(65533) || 'rich%');

update public.venues
set description = replace(description, 'L' || chr(65533) || 'becker', 'Lübecker')
where id = '8e39b7fa-dc42-4396-95de-d6ef92be69c6'
  and description like '%L' || chr(65533) || 'becker%';

do $verify$
begin
  if exists (
    select 1 from public.venues
    where id in ('4165cace-4c9e-40d4-a23b-67706b49c1df', '8e39b7fa-dc42-4396-95de-d6ef92be69c6')
      and (description like '%' || chr(65533) || '%' or city like '%' || chr(65533) || '%')
  ) then
    raise exception 'community centre rows still carry U+FFFD';
  end if;
end
$verify$;
