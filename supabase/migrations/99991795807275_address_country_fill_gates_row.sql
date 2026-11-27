-- When the address guard fills an empty country_id, the row's safety gate must
-- see that country.
--
-- guard_explicit_address_country() (trigger zzzx_address_country on venues,
-- events, hotels, organizations; BEFORE INSERT OR UPDATE OF address, country_id)
-- fills a NULL country_id from an explicit country at the end of the address.
-- Every table's gate trigger is column-scoped, and a column list fires on the
-- columns NAMED IN THE STATEMENT, so `update venues set address = '..., X'`
-- fills country_id without the gate ever being recomputed. hotels and
-- organizations are worse: their gate triggers sort BEFORE zzzx, so even a
-- statement that names city_id runs the gate first and the fill afterwards.
--
-- Not live: explicit_address_country_code() parses only GB, CA, AU, DE, IT, US,
-- IE and ES, none criminalizing, so today the fill cannot move a row into a
-- high-risk country. It becomes an outing exposure the day someone adds one
-- (found by the 2026-11-27 column-scoped trigger sweep).
--
-- The fix only ever ADDS the gate. It does not restate any table's rule: venues
-- also gate on category, organizations on their primary venue, and both of
-- those inputs are untouched by this function. Filling a NULL country can only
-- add high-risk evidence, so OR-ing the location term in is correct for all
-- four tables. It never sets false; the table's own rule decides that.
--
-- Patched on the LIVE body by exactly-once anchor rather than restated.

do $patch$
declare
  v_src  text := pg_get_functiondef('public.guard_explicit_address_country'::regproc);
  v_old  text := 'new.country_id:=resolved_id;';
  v_new  text := 'new.country_id:=resolved_id;
   if resolved_id is not null and public.location_is_high_risk(resolved_id, new.city_id) then
     new.safety_gated:=true;
   end if;';
  v_hits int;
begin
  if position('location_is_high_risk(resolved_id' in v_src) > 0 then
    return; -- already applied
  end if;
  v_hits := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_hits <> 1 then
    raise exception 'guard_explicit_address_country anchor found % times, expected 1', v_hits;
  end if;
  execute replace(v_src, v_old, v_new);
end $patch$;

do $verify$
declare
  v_src text;
  v_bad text;
begin
  v_src := regexp_replace(pg_get_functiondef('public.guard_explicit_address_country'::regproc),
                          '--[^' || chr(10) || ']*', '', 'g');
  if position('location_is_high_risk(resolved_id, new.city_id)' in v_src) = 0 then
    raise exception 'P1 failed: the address guard does not gate the country it fills';
  end if;
  -- Fail closed only: this function must never clear the gate.
  if v_src ~* 'safety_gated\s*:=\s*false' then
    raise exception 'P2 failed: the address guard can clear safety_gated';
  end if;
  -- Every table the function is attached to must carry the column it writes.
  select string_agg(c.relname, ', ') into v_bad
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
   where p.proname = 'guard_explicit_address_country'
     and not t.tgisinternal
     and not exists (select 1 from pg_attribute a
                      where a.attrelid = c.oid and a.attname = 'safety_gated' and not a.attisdropped);
  if v_bad is not null then
    raise exception 'P3 failed: address guard attached to table(s) without safety_gated: %', v_bad;
  end if;
end $verify$;
