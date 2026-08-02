create or replace function public.tag_deaccent(p_input text)
returns text
language sql immutable strict parallel safe
set search_path = public
as $fn$
  select translate(
    replace(replace(replace(replace(replace(
      lower(p_input),
      'ß', 'ss'), 'æ', 'ae'), 'œ', 'oe'), 'þ', 'th'), 'ð', 'd'),
    'àáâãäåāăąçćĉċčèéêëēĕėęěìíîïĩīĭįıñńņňòóôõöøōŏőùúûüũūŭůűųýÿŷšśŝşșžźżĝğġģĥħĵķĺļľłŕŗřţťŧțŵďđ',
    'aaaaaaaaaccccceeeeeeeeeiiiiiiiiinnnnooooooooouuuuuuuuuuyyyssssszzzgggghhjkllllrrrttttwdd'
  );
$fn$;

comment on function public.tag_deaccent(text) is
  'Lowercase + fold Latin diacritics to ASCII. Pure/IMMUTABLE (translate, not unaccent) so callers can stay IMMUTABLE.';

create or replace function public.normalize_tag_slug(p_input text)
returns text
language sql immutable
set search_path = public
as $fn$
  select trim(both '-' from
    regexp_replace(public.tag_deaccent(coalesce(p_input, '')), '[^a-z0-9]+', '-', 'g'));
$fn$;

create or replace function public.normalize_tag_input()
returns trigger
language plpgsql
set search_path = public
as $fn$
BEGIN
  IF NEW.name IS NOT NULL THEN
    NEW.name := btrim(regexp_replace(NEW.name, '[[:cntrl:]<>]', '', 'g'));
  END IF;

  IF NEW.slug IS NULL OR NEW.slug = ''
     OR (TG_OP = 'UPDATE' AND OLD.name IS DISTINCT FROM NEW.name) THEN
    NEW.slug := public.normalize_tag_slug(NEW.name);
  ELSE
    NEW.slug := lower(NEW.slug);
  END IF;
  RETURN NEW;
END;
$fn$;

create or replace function public.tag_language_guard()
returns trigger
language plpgsql
set search_path = public
as $fn$
BEGIN
  IF NEW.name ~ '[Ͱ-ϿЀ-ӿ԰-֏֐-׿؀-ۿऀ-ॿ฀-๿぀-ヿ一-鿿가-힯]' THEN
    RAISE EXCEPTION 'unified_tags.name must be English (Latin script); got %', NEW.name
      USING HINT = 'Store translations in name_i18n; the base name column is the English label.';
  END IF;
  RETURN NEW;
END;
$fn$;

drop trigger if exists trg_tag_language_guard on public.unified_tags;
create trigger trg_tag_language_guard
  before insert or update of name on public.unified_tags
  for each row execute function public.tag_language_guard();

do $do$
begin
  if public.tag_deaccent('Café Jalapeños Müllerian Beyoncé Jägermeister Crème-Brûlée Cachaça Straße')
     <> 'cafe jalapenos mullerian beyonce jagermeister creme-brulee cachaca strasse' then
    raise exception 'tag_deaccent: transliteration table is out of step (got %)',
      public.tag_deaccent('Café Jalapeños Müllerian Beyoncé Jägermeister Crème-Brûlée Cachaça Straße');
  end if;
  if public.normalize_tag_slug('Café') <> 'cafe' then
    raise exception 'normalize_tag_slug(Café) = % (expected cafe)', public.normalize_tag_slug('Café');
  end if;
  if public.normalize_tag_slug('Jalapeño-Poppers') <> 'jalapeno-poppers' then
    raise exception 'normalize_tag_slug(Jalapeño-Poppers) = %', public.normalize_tag_slug('Jalapeño-Poppers');
  end if;
  if public.normalize_tag_slug('mat-vegan-leather') <> 'mat-vegan-leather' then
    raise exception 'normalize_tag_slug mangled a namespaced slug';
  end if;
end $do$;

grant execute on function public.tag_deaccent(text) to anon, authenticated, service_role;;