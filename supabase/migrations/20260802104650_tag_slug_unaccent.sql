-- Tag slugs: transliterate diacritics instead of deleting them.
--
-- normalize_tag_slug() collapsed everything outside [a-z0-9] to '-', so every
-- accented character was DESTROYED rather than folded:
--   Café -> 'caf'   Jalapeños -> 'jalape-os'   Müllerian -> 'm-llerian'
--   Beyoncé -> 'beyonc'   München -> 'm-nchen'  Crème-Brûlée -> 'creme-br-l-e'
-- 68 tags carry a slug corrupted this way (16 of them still active), and
-- 'Müllerian' exists three times over ('müllerian' / 'm-llerian' / 'mllerian')
-- because each import spelled the damage differently.
--
-- THE SECOND SLUGIFIER IS THE LOAD-BEARING PART OF THIS FIX. unified_tags has
-- TWO before-triggers that write slug, and same-timing triggers fire in NAME
-- order:
--     trg_normalize_tag_input        -> normalize_tag_input()        (runs 1st)
--     trg_unified_tags_normalize_slug-> unified_tags_normalize_slug()(runs 4th)
-- normalize_tag_input() has its own inline [^a-zA-Z0-9]+ regex and rewrites the
-- slug whenever the name changes. By the time normalize_tag_slug() runs, it is
-- handed an ALREADY-MANGLED slug and cannot recover the original letters.
-- Fixing normalize_tag_slug() alone would have left every new insert broken.
-- normalize_tag_input() now delegates, so there is one implementation.
--
-- We deliberately do NOT use extensions.unaccent(): it is STABLE (dictionary-
-- backed), and normalize_tag_slug is IMMUTABLE. Downgrading its volatility
-- would forbid it in any future index or generated column. translate() is a
-- pure builtin, so the function stays IMMUTABLE.

-- ---------------------------------------------------------------------------
-- 1. Pure, IMMUTABLE transliteration
-- ---------------------------------------------------------------------------
create or replace function public.tag_deaccent(p_input text)
returns text
language sql immutable strict parallel safe
set search_path = public
as $$
  -- Multi-character expansions first (translate is strictly 1:1).
  -- The two argument strings below are both exactly 88 characters; if they ever
  -- drift out of step translate() SILENTLY DELETES the unmatched characters,
  -- which is why the length equality is asserted at the bottom of this file.
  select translate(
    replace(replace(replace(replace(replace(
      lower(p_input),
      'ß', 'ss'), 'æ', 'ae'), 'œ', 'oe'), 'þ', 'th'), 'ð', 'd'),
    'àáâãäåāăąçćĉċčèéêëēĕėęěìíîïĩīĭįıñńņňòóôõöøōŏőùúûüũūŭůűųýÿŷšśŝşșžźżĝğġģĥħĵķĺļľłŕŗřţťŧțŵďđ',
    'aaaaaaaaaccccceeeeeeeeeiiiiiiiiinnnnooooooooouuuuuuuuuuyyyssssszzzgggghhjkllllrrrttttwdd'
  );
$$;

comment on function public.tag_deaccent(text) is
  'Lowercase + fold Latin diacritics to ASCII. Pure/IMMUTABLE (translate, not unaccent) so callers can stay IMMUTABLE.';

-- ---------------------------------------------------------------------------
-- 2. The canonical slugifier
-- ---------------------------------------------------------------------------
create or replace function public.normalize_tag_slug(p_input text)
returns text
language sql immutable
set search_path = public
as $$
  select trim(both '-' from
    regexp_replace(public.tag_deaccent(coalesce(p_input, '')), '[^a-z0-9]+', '-', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- 3. The older second slugifier now delegates instead of re-implementing
-- ---------------------------------------------------------------------------
create or replace function public.normalize_tag_input()
returns trigger
language plpgsql
set search_path = public
as $$
BEGIN
  -- Strip control characters and stray markup that survived the wiki imports
  -- ('<Mavie Hörbiger') before anything derives a slug from the name.
  -- NULL is preserved: the column's own constraints decide whether that is
  -- legal, and coercing it to '' here would mask the error.
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
$$;

-- ---------------------------------------------------------------------------
-- 4. English-only guard
-- ---------------------------------------------------------------------------
-- unified_tags.name IS the English label by design: name_i18n never carries an
-- 'en' key (verified: 0 of 8,364 populated rows), every translation hangs off
-- the base column. So a non-Latin-script name is not a translation, it is a
-- vocabulary defect.
--
-- Only the DETERMINISTIC half is enforced here. Cyrillic/CJK/Arabic/Greek/
-- Hebrew/Thai/Devanagari in a tag name is never correct and is rejected
-- outright (currently zero active tags trip this, so it is a ratchet, not a
-- migration). Latin-script-but-German ('Hörspiel', 'Identität') cannot be
-- detected without a lexicon and must NOT raise here — a false positive would
-- block a legitimate ingest. Those are surfaced for review instead, by
-- scripts/data-quality/englishify-tags.mjs.
create or replace function public.tag_language_guard()
returns trigger
language plpgsql
set search_path = public
as $$
BEGIN
  IF NEW.name ~ '[Ͱ-ϿЀ-ӿ԰-֏֐-׿؀-ۿऀ-ॿ฀-๿぀-ヿ一-鿿가-힯]' THEN
    RAISE EXCEPTION 'unified_tags.name must be English (Latin script); got %', NEW.name
      USING HINT = 'Store translations in name_i18n; the base name column is the English label.';
  END IF;
  RETURN NEW;
END;
$$;

drop trigger if exists trg_tag_language_guard on public.unified_tags;
create trigger trg_tag_language_guard
  before insert or update of name on public.unified_tags
  for each row execute function public.tag_language_guard();

-- ---------------------------------------------------------------------------
-- 5. Assertions — a silent translate() length drift is the failure mode here
-- ---------------------------------------------------------------------------
do $$
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
  -- Plain ASCII must be untouched, and the namespaced marketplace slugs
  -- (mat-/vibe-/occ-/news-) must round-trip unchanged.
  if public.normalize_tag_slug('mat-vegan-leather') <> 'mat-vegan-leather' then
    raise exception 'normalize_tag_slug mangled a namespaced slug';
  end if;
end $$;

grant execute on function public.tag_deaccent(text) to anon, authenticated, service_role;
