-- search_autocomplete: among featured cities, more content ranks first.
--
-- After 99991793066862, `ber` offered Bergen (Norway) before Berlin: both are
-- featured cities with identical trigram similarity to "ber" (0.375), so the
-- last tie-break was the title, and "Bergen" < "Berlin". Nothing measured how
-- much the guide holds for a city (Berlin 1,037 venues, Bergen a handful).
-- Same mechanism: `san` -> San Jose before San Francisco, `ba` -> Baku/Basra.
--
-- Featured cities now carry their venue count (place_content) and are ordered
-- by it right after the featured-place flag. The count uses only venues so it
-- rides the existing partial index search_documents_lower_city_venue, and is
-- computed only for featured city candidates (a handful per keystroke);
-- measured latency is unchanged (ber 350 -> 222 ms, am 623 -> 503 ms).
-- Population was rejected: it ranks Amman above Amsterdam for `am`.
--
-- Patched from the live definition with exactly-once replacements.

do $patch$
declare
  v_fn  regprocedure := 'api_private.search_autocomplete(text,text[],integer,timestamp with time zone,boolean)';
  v_src text := pg_get_functiondef(v_fn);
  v_old1 text := '(is_featured and entity_type in (''city'',''country'',''queer_village'')) as place_featured,';
  v_new1 text := '(is_featured and entity_type in (''city'',''country'',''queer_village'')) as place_featured,
      case when is_featured and entity_type = ''city'' then (select count(*) from public.search_documents v where v.entity_type = ''venue'' and lower(v.city) = lower(search_documents.title)) end as place_content,';
  v_old2 text := 'place_featured desc, sim desc';
  v_new2 text := 'place_featured desc, place_content desc nulls last, sim desc';
  v_old3 text := 'z.place_featured desc, z.sim desc';
  v_new3 text := 'z.place_featured desc, z.place_content desc nulls last, z.sim desc';
  v_n int;
begin
  if position('as place_content' in v_src) > 0 then
    return; -- already applied
  end if;
  v_n := (length(v_src) - length(replace(v_src, v_old1, ''))) / length(v_old1);
  if v_n <> 1 then
    raise exception 'search_autocomplete place_featured column: expected exactly 1 occurrence, found %', v_n;
  end if;
  -- `place_featured desc, sim desc` appears in the per-type rank and the top-N
  -- order; the final aggregate spells it `z.place_featured desc, z.sim desc`.
  v_n := (length(v_src) - length(replace(v_src, v_old2, ''))) / length(v_old2);
  if v_n <> 2 then
    raise exception 'search_autocomplete ordering: expected 2 occurrences of the featured/sim key, found %', v_n;
  end if;
  v_n := (length(v_src) - length(replace(v_src, v_old3, ''))) / length(v_old3);
  if v_n <> 1 then
    raise exception 'search_autocomplete final ordering: expected exactly 1 occurrence, found %', v_n;
  end if;
  v_src := replace(v_src, v_old1, v_new1);
  v_src := replace(v_src, v_old2, v_new2);
  v_src := replace(v_src, v_old3, v_new3);
  execute v_src;
end
$patch$;

do $verify$
declare
  v jsonb;
  q text;
  v_first_n bigint;
  v_max_n bigint;
begin
  -- Property, robust to the small CI snapshot: when the first suggestion is a
  -- featured city, no other featured city matching the same prefix has more
  -- venues.
  foreach q in array array['ber', 'par', 'new y', 'san', 'lon'] loop
    v := api_private.search_autocomplete(q, null, 8, now(), false);
    if exists (select 1 from public.search_documents d
               where d.entity_id::text = v->0->>'objectID' and d.entity_type = 'city' and d.is_featured) then
      select count(*) into v_first_n from public.search_documents
       where entity_type = 'venue' and lower(city) = lower(v->0->>'title');
      select max(n) into v_max_n from (
        select (select count(*) from public.search_documents x
                 where x.entity_type = 'venue' and lower(x.city) = lower(c.title)) n
          from public.search_documents c
         where c.entity_type = 'city' and c.is_featured and not c.safety_gated
           and c.title ilike q || '%') s;
      if v_first_n < v_max_n then
        raise exception 'autocomplete(%) leads with % (% venues) although a featured city with % venues matches', q, v->0->>'title', v_first_n, v_max_n;
      end if;
    end if;
  end loop;
end
$verify$;
