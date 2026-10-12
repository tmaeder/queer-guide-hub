-- 99991791835084_explicit_address_country_guard
--
-- TODO: why this migration exists.
-- A final country token in a structured address is strong evidence. It catches
-- homonymous city matches (Sydney AU vs Sydney CA, Victoria SC vs Victoria AU)
-- even when the venue has no coordinates for the boundary guard to inspect.
create or replace function public.explicit_address_country_code(p_address text)
returns text language sql immutable parallel safe set search_path=public,pg_temp as $$
 select case
  when p_address ~* ',[[:space:]]*(United Kingdom|UK)[[:space:]]*$' then 'GB'
  when p_address ~* ',[[:space:]]*Canada[[:space:]]*$' then 'CA'
  when p_address ~* ',[[:space:]]*Australia[[:space:]]*$' then 'AU'
  when p_address ~* ',[[:space:]]*Germany[[:space:]]*$' then 'DE'
  when p_address ~* ',[[:space:]]*Italy[[:space:]]*$' then 'IT'
  when p_address ~* ',[[:space:]]*(United States|USA)[[:space:]]*$' then 'US'
  when p_address ~* ',[[:space:]]*Ireland[[:space:]]*$' then 'IE'
  when p_address ~* ',[[:space:]]*Spain[[:space:]]*$' then 'ES'
  else null end
$$;

do $$ begin
 if public.explicit_address_country_code('424 Charlotte St, Sydney, Nova Scotia, Canada') <> 'CA'
   or public.explicit_address_country_code('Studland Bay, Dorset, United Kingdom') <> 'GB'
   or public.explicit_address_country_code('1 Victoria St, Victoria, Australia') <> 'AU'
   or public.explicit_address_country_code('Avenue de France, Monaco') is not null
   or public.explicit_address_country_code('Canada Street, London') is not null then
   raise exception 'Explicit address country safety checks failed';
 end if;
end $$;

create or replace function public.guard_explicit_address_country()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare address_code text; linked_code text; resolved_id uuid;
begin
 address_code:=public.explicit_address_country_code(new.address);
 if address_code is null then return new; end if;
 if new.country_id is null then
   select id into resolved_id from public.countries where code=address_code and duplicate_of_id is null limit 1;
   new.country_id:=resolved_id;
   return new;
 end if;
 select code into linked_code from public.countries where id=new.country_id;
 if linked_code is not null and not public.geo_countries_equivalent(linked_code,address_code) then
   raise exception 'Country % conflicts with address country %: correct the country or address before saving',
     linked_code,address_code using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function public.guard_explicit_address_country() from public,anon,authenticated;

do $$ declare t text; begin
 foreach t in array array['organizations','venues','hotels','events'] loop
   -- Alphabetical trigger order makes country inference precede embedded-postal
   -- extraction, and both precede the existing city/coordinate consistency guard.
   execute format('create trigger zzzx_address_country before insert or update of address,country_id on public.%I for each row execute function public.guard_explicit_address_country()',t);
 end loop;
end $$;
