-- Server-side URL validation for community_submissions.
-- Mirrors client rules in src/utils/urlValidation.ts: must be http(s), hostname
-- must contain a dot, must not be localhost / private IP literal.
-- Raises 'invalid_url:<field>' so the client can surface a field-level error.

create or replace function public.is_plausible_public_url(raw text)
returns boolean
language plpgsql
immutable
as $$
declare
  v text := btrim(raw);
  host text;
  tld text;
begin
  if v is null or v = '' then
    return true; -- empty/optional handled by caller
  end if;

  -- Must start with http(s)://
  if v !~* '^https?://' then
    return false;
  end if;

  -- Extract hostname: strip scheme, then take chars up to : / ? # end.
  host := lower(regexp_replace(v, '^https?://', ''));
  host := split_part(host, '/', 1);
  host := split_part(host, '?', 1);
  host := split_part(host, '#', 1);
  host := split_part(host, ':', 1);

  if host = '' then return false; end if;

  -- Disallow localhost and *.localhost
  if host = 'localhost' or host like '%.localhost' then
    return false;
  end if;

  -- Disallow IPv6 literals (bracketed or ::) and any IPv4 literal
  if host ~ '^\[' or position(':' in host) > 0 then
    return false;
  end if;
  if host ~ '^\d+\.\d+\.\d+\.\d+$' then
    return false; -- disallow all IP literals for public submissions
  end if;

  -- Must contain a dot; labels must be non-empty; last label ≥2 alpha chars
  if position('.' in host) = 0 then
    return false;
  end if;
  if host ~ '\.\.' or host ~ '^\.' or host ~ '\.$' then
    return false;
  end if;
  tld := split_part(host, '.', array_length(string_to_array(host, '.'), 1));
  if tld !~ '^[a-z]{2,}$' then
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.validate_submission_urls()
returns trigger
language plpgsql
as $$
declare
  url_fields text[] := array[
    'website', 'ticket_url', 'url', 'website_url',
    'official_website', 'wikipedia_url', 'booking_url',
    'canonical_url', 'og_image_url'
  ];
  f text;
  v text;
begin
  if new.data is null then
    return new;
  end if;

  foreach f in array url_fields loop
    v := new.data ->> f;
    if v is not null and btrim(v) <> '' then
      if not public.is_plausible_public_url(v) then
        raise exception 'invalid_url:%', f using errcode = '22023';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists validate_submission_urls_trg on public.community_submissions;
create trigger validate_submission_urls_trg
before insert or update on public.community_submissions
for each row execute function public.validate_submission_urls();
