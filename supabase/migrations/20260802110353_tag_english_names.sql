-- English-only tag names, part 2: typography + the remaining non-English names.
--
-- After the slug repair (20260802104650) the surviving non-ASCII active names
-- were enumerated in full -- 18 rows -- and they are NOT all "untranslated":
--   * proper nouns of people (Ulrike Roseberg, Attila Horbiger, Jannik
--     Schumann, Melitta Sundstrom, Beyonce): the English rendering of a
--     personal name IS the name. Nothing to translate.
--   * English loanwords and brands (Jagermeister, Creme brulee, Cachaca,
--     Chevre, Jalapenos, Frappes, Mullerian, Charite): normal English usage.
--   * exactly TWO genuinely non-English names, plus one garbled German string.
-- Reporting "92 non-English tags" without that breakdown would have justified
-- a bulk rename that mangled ten people's names.

-- 1. Typography. Curly apostrophes are not a language problem, but they are a
-- data problem: 21 names carry U+2019, which the slugifier turns into a '-'
-- ("Don't Ask Don't Tell" -> don-t-ask-don-t-tell). Fold them at the same place
-- everything else about the name is normalised, so new writes cannot reintroduce
-- them. normalize_tag_name()'s in-word apostrophe handling accepts ASCII '
-- already, so this runs ahead of it safely.
create or replace function public.normalize_tag_input()
returns trigger
language plpgsql
set search_path = public
as $fn$
BEGIN
  IF NEW.name IS NOT NULL THEN
    NEW.name := btrim(regexp_replace(NEW.name, '[[:cntrl:]<>]', '', 'g'));
    NEW.name := translate(NEW.name, U&'\2018\2019\201C\201D\2013\2014', '''''"" - -');
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

do $do$
declare v_queere uuid; v_queer uuid;
begin
  perform set_config('app.actor', 'admin:tag-englishify', true);

  -- 2. Fold existing curly apostrophes. Slug is deliberately NOT recomputed:
  -- don-t-ask-don-t-tell is a live, indexed URL with 255 uses behind it, and
  -- the apostrophe collapses to the same '-' either way.
  update public.unified_tags
     set name = translate(name, U&'\2018\2019\201C\201D', '''''""')
   where name ~ '[‘’“”]';

  -- 3. The two real translations.
  -- Munchen -> Munich: English exonym, no colliding tag.
  update public.unified_tags set name = 'Munich' where slug = 'munchen';

  -- Queere Community (0 uses) is the German spelling of an existing English
  -- tag (29 uses), so it is a merge, not a rename.
  select id into v_queere from public.unified_tags where slug = 'queere-community';
  select id into v_queer  from public.unified_tags where slug = 'queer-community';
  if v_queere is not null and v_queer is not null then
    perform public.merge_tag_concept(v_queer, v_queere, 'admin', 'englishify:german-spelling');
  end if;

  -- 4. "Burgermeister Von Houston" is a garbled German fragment
  -- (Buergermeister von Houston = Mayor of Houston), 0 uses, not a concept in
  -- this taxonomy. Deprecated, not deleted -- restore_deprecated_tag() reverses it.
  update public.unified_tags
     set status = 'deprecated', deprecated_at = now(),
         deprecation_reason = 'englishify: garbled German import fragment, not an English concept'
   where slug = 'burgermeister-von-houston' and status = 'active';
end $do$;

do $do$
declare v_bad int;
begin
  select count(*) into v_bad from public.unified_tags where name ~ '[‘’“”]';
  if v_bad > 0 then raise exception '% tag names still carry curly quotes', v_bad; end if;

  if not exists (select 1 from public.unified_tags where slug = 'munich' and name = 'Munich') then
    raise exception 'Munchen was not renamed to Munich';
  end if;
end $do$;
