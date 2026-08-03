-- 'lgbtq-rights' was filed under the Sexuality & Kink subtree, so Safe Mode
-- treated an LGBTQ+ rights concept as adult content. It sits on 2 live venues.
-- Of the 13 adult tags still present on venues after the re-filing sweep, this
-- was the only one that is not genuinely an adult venue attribute -- the rest
-- (clothing-optional, nudist, sauna, adult-oriented, bathhouse, nudity, tantra,
-- erotic-massage, leather) are correctly gated.
do $do$
declare r record; v_cid uuid;
begin
  perform set_config('app.actor', 'admin:tag-refile-20260803c', true);
  select id into v_cid from public.tag_categories where slug = 'legal-rights';

  for r in
    select a.id from public.tag_category_assignments a
      join public.unified_tags t on t.id = a.tag_id
     where t.slug = 'lgbtq-rights'
       and a.category_id in (
         select tc.id from public.tag_categories tc
         left join public.tag_categories tcp on tcp.id = tc.parent_id
          where tc.name = 'Sexuality & Kink' or tcp.name = 'Sexuality & Kink')
  loop
    delete from public.tag_category_assignments where id = r.id;
  end loop;

  insert into public.tag_category_assignments (tag_id, category_id, is_primary)
  select t.id, v_cid, true from public.unified_tags t where t.slug = 'lgbtq-rights'
  on conflict (tag_id, category_id) do update set is_primary = true;
end $do$;

do $do$
begin
  if exists (select 1 from public.unified_tags where slug = 'lgbtq-rights' and is_adult) then
    raise exception 'lgbtq-rights is still flagged adult';
  end if;
end $do$;;
