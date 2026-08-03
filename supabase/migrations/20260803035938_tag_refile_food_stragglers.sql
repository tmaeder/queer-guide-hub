-- Final pass on food/drink terms that survived the venue-residue sweep because
-- they also carry news assignments, so the venue-only signal did not match them.
--
-- Kept adult on purpose: shame, transformation, big, public, vinyl, buns,
-- boots, cigars, spandex-clothing. Each is a plausible kink term (humiliation,
-- TF, size, public play, gear) and the cost of wrongly un-hiding is higher than
-- the cost of a slightly over-cautious Safe Mode.
do $do$
declare r record; v_n int := 0;
begin
  perform set_config('app.actor', 'admin:tag-refile-20260803b', true);

  for r in
    select a.id from public.tag_category_assignments a
      join public.unified_tags t on t.id = a.tag_id and t.status = 'active'
     where t.slug in ('ice-cream','chocolate','gin','tea','espresso','office','electronics','leader','clothing')
       and a.category_id in (
         select tc.id from public.tag_categories tc
         left join public.tag_categories tcp on tcp.id = tc.parent_id
          where tc.name = 'Sexuality & Kink' or tcp.name = 'Sexuality & Kink')
  loop
    delete from public.tag_category_assignments where id = r.id;
    v_n := v_n + 1;
  end loop;

  for r in
    select t.id tag_id, c.id cat_id
      from public.unified_tags t
      join (values
        ('ice-cream','venues-nightlife'), ('chocolate','venues-nightlife'),
        ('gin','venues-nightlife'), ('tea','venues-nightlife'),
        ('espresso','venues-nightlife'), ('office','workplace-education-policy'),
        ('electronics','professions-allies'), ('leader','professions-allies'),
        ('clothing','expression-presentation')
      ) m(slug, cat) on m.slug = t.slug
      join public.tag_categories c on c.slug = m.cat
     where t.status = 'active'
  loop
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    values (r.tag_id, r.cat_id, true)
    on conflict (tag_id, category_id) do update set is_primary = true;
  end loop;

  raise notice 'removed % kink assignments from food/office stragglers', v_n;
end $do$;

do $do$
declare v_bad int;
begin
  select count(*) into v_bad from public.unified_tags
   where slug in ('ice-cream','chocolate','gin','tea','espresso','office') and is_adult;
  if v_bad > 0 then raise exception '% food/office tags still is_adult', v_bad; end if;
end $do$;;
