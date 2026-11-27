-- commit_venue_staging_item filled an existing venue's empty/other/unknown
-- category with the incoming one. When a gays-cruising listing was merged
-- into a landmark by name (Rote Fabrik, Zentralbibliothek Zürich, malls),
-- that fill turned the landmark into `cruising`, which also hides it from
-- signed-out readers. A merged source may no longer set `cruising` on a venue
-- that already exists; new venues created from a cruising listing are
-- unaffected (that is the INSERT branch). Patched in place from the live
-- definition, so nothing else in the function is restated.

do $$
declare
  v_def  text := pg_get_functiondef('public.commit_venue_staging_item'::regproc);
  v_code text := regexp_replace(pg_get_functiondef('public.commit_venue_staging_item'::regproc), '--[^' || chr(10) || ']*', '', 'g');
  v_from text := $s$AND v_category NOT IN ('unknown','other')$s$;
  v_to   text := $s$AND v_category NOT IN ('unknown','other','cruising')$s$;
begin
  if position(v_to in v_code) > 0 then
    return; -- already applied
  end if;
  if (length(v_code) - length(replace(v_code, v_from, ''))) / length(v_from) <> 1
     or (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from) <> 1 then
    raise exception 'commit_venue_staging_item: expected exactly one category fill guard';
  end if;
  execute replace(v_def, v_from, v_to);
end $$;

do $verify$
begin
  if position($s$AND v_category NOT IN ('unknown','other','cruising')$s$
              in regexp_replace(pg_get_functiondef('public.commit_venue_staging_item'::regproc), '--[^' || chr(10) || ']*', '', 'g')) = 0 then
    raise exception 'commit_venue_staging_item still fills cruising onto existing venues';
  end if;
end $verify$;
