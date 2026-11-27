-- Contact emails: strip the two mechanical scrape artifacts at the write boundary.
--
-- Measured 2026-11-27: 924 venues and 743 organizations store an address with
-- `mailto` glued onto its end (`info@queerbooks.chmailto`), 919 of the venue
-- rows from the 2026-04-26 `unknown` batch. The public page rendered
-- `mailto:info@queerbooks.chmailto`, an invalid recipient.
--
-- This migration only guards FUTURE writes. Existing rows are repaired by
-- scripts/data-quality/repair-contact-email-artifacts.mjs (dry-run default),
-- so the backfill stays an explicit operator step.
--
-- Rule (mirrors contactEmail() in src/lib/entityContact.ts): trim, drop a
-- leading `mailto:`, and drop a trailing `mailto` ONLY when what remains is a
-- valid address. Anything else is left exactly as written: the UI already
-- refuses to link an invalid address, and guessing a recipient is worse than
-- showing none.

create or replace function public.canonicalize_contact_email(p_raw text)
returns text
language sql
immutable
set search_path = ''
as $fn$
  with s as (select regexp_replace(btrim(p_raw), '^mailto:', '', 'i') as v)
  select case
    when p_raw is null then null
    -- Trailing artifact first: `…chmailto` also matches the address pattern
    -- with "chmailto" as its TLD. No real TLD ends in mailto.
    when s.v ~* 'mailto$' and regexp_replace(s.v, 'mailto$', '', 'i') ~* '^[^@[:space:]<>()",;:]+@[^@[:space:]<>()",;:]+\.[a-z]{2,}$'
      then regexp_replace(s.v, 'mailto$', '', 'i')
    when s.v ~* '^[^@[:space:]<>()",;:]+@[^@[:space:]<>()",;:]+\.[a-z]{2,}$' then s.v
    else p_raw
  end
  from s
$fn$;

create or replace function public.contact_email_guard()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if tg_table_name = 'marketplace_listings' then
    new.contact_email := public.canonicalize_contact_email(new.contact_email);
  else
    new.email := public.canonicalize_contact_email(new.email);
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_venues_zz_contact_email_guard on public.venues;
create trigger trg_venues_zz_contact_email_guard
  before insert or update of email on public.venues
  for each row execute function public.contact_email_guard();

drop trigger if exists trg_organizations_zz_contact_email_guard on public.organizations;
create trigger trg_organizations_zz_contact_email_guard
  before insert or update of email on public.organizations
  for each row execute function public.contact_email_guard();

drop trigger if exists trg_hotels_zz_contact_email_guard on public.hotels;
create trigger trg_hotels_zz_contact_email_guard
  before insert or update of email on public.hotels
  for each row execute function public.contact_email_guard();

drop trigger if exists trg_marketplace_listings_zz_contact_email_guard on public.marketplace_listings;
create trigger trg_marketplace_listings_zz_contact_email_guard
  before insert or update of contact_email on public.marketplace_listings
  for each row execute function public.contact_email_guard();

revoke all on function public.canonicalize_contact_email(text) from public, anon, authenticated;
revoke all on function public.contact_email_guard() from public, anon, authenticated;

do $verify$
begin
  if public.canonicalize_contact_email('info@queerbooks.chmailto') <> 'info@queerbooks.ch' then
    raise exception 'contact email guard: trailing mailto not stripped';
  end if;
  if public.canonicalize_contact_email('mailto:hi@example.org') <> 'hi@example.org' then
    raise exception 'contact email guard: leading mailto: not stripped';
  end if;
  if public.canonicalize_contact_email('not an email') <> 'not an email' then
    raise exception 'contact email guard: rewrote a value it cannot repair';
  end if;
  if public.canonicalize_contact_email(null) is not null then
    raise exception 'contact email guard: null not preserved';
  end if;
end
$verify$;
