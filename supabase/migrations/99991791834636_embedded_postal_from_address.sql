-- A country-specific postal code already present in an address is stronger
-- evidence than a reverse-geocoder miss. Require exactly one unambiguous token.
create or replace function public.embedded_postal_from_address(p_address text, p_country_code text)
returns text language plpgsql immutable parallel safe set search_path=public,pg_temp as $$
declare pattern text; candidates text[]; candidate text;
begin
  if nullif(btrim(p_address),'') is null then return null; end if;
  pattern:=case upper(p_country_code)
    when 'GB' then '\m([A-Z]{1,2}[0-9][A-Z0-9]?[[:space:]]+[0-9][A-Z]{2})\M'
    -- Eircode's restricted alphabet excludes the O in road names like "N25 Cork Road".
    when 'IE' then '\m((D6W|[ACDEFHKNPRTVWXY][0-9]{2})[[:space:]]+[0-9ACDEFHKNPRTVWXY]{4})\M'
    when 'CA' then '\m([ABCEGHJ-NPRSTVXY][0-9][ABCEGHJ-NPRSTV-Z][[:space:]]+[0-9][ABCEGHJ-NPRSTV-Z][0-9])\M'
    else null end;
  if pattern is null then return null; end if;
  select array_agg(distinct upper(regexp_replace(btrim(m[1]),'[[:space:]]+',' ','g')))
    into candidates from regexp_matches(p_address,pattern,'gi') m;
  if coalesce(array_length(candidates,1),0)<>1 then return null; end if;
  candidate:=candidates[1];
  -- Postal codes belong near the end of a written address, optionally before
  -- the region and country. Reject earlier directions or incidental tokens.
  if length(p_address)-strpos(upper(p_address),candidate)-length(candidate)+1>60 then return null; end if;
  return candidate;
end $$;

do $$ begin
  if public.embedded_postal_from_address('N25 Cork Road, Ballytruckle, Waterford, Ireland','IE') is not null
    or public.embedded_postal_from_address('GU3 2JR,WR10 2NR, UK','GB') is not null
    or public.embedded_postal_from_address('Edmonton AB T5K 0N4 Canada','US') is not null
    or public.embedded_postal_from_address('1 Courthouse Square, Galway, H91 VF21, Ireland','IE') <> 'H91 VF21'
    or public.embedded_postal_from_address('52 Thornsgreen Rd, Manchester M22 1GD, UK','GB') <> 'M22 1GD'
    or public.embedded_postal_from_address('Edmonton AB T5K 0N4 Canada','CA') <> 'T5K 0N4' then
    raise exception 'Embedded postal extraction safety checks failed';
  end if;
end $$;

create or replace function public.fill_embedded_postal_from_address()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare country_code text; candidate text;
begin
  if nullif(btrim(new.postal_code),'') is not null or new.country_id is null then return new; end if;
  select code into country_code from public.countries where id=new.country_id;
  candidate:=public.embedded_postal_from_address(new.address,country_code);
  if candidate is not null then new.postal_code:=candidate; end if;
  return new;
end $$;
revoke all on function public.fill_embedded_postal_from_address() from public,anon,authenticated;

do $$ declare t text; begin
  foreach t in array array['organizations','venues','hotels'] loop
    execute format('create trigger zzzy_embedded_postal before insert or update of address,country_id on public.%I for each row execute function public.fill_embedded_postal_from_address()',t);
  end loop;
end $$;
