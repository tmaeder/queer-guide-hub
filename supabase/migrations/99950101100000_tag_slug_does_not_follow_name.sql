-- A display-name edit must not move a tag's canonical URL.
--
-- `normalize_tag_input()` re-derived the slug from the name on EVERY update that
-- changed the name:
--
--     IF NEW.slug IS NULL OR NEW.slug = ''
--        OR (TG_OP = 'UPDATE' AND OLD.name IS DISTINCT FROM NEW.name) THEN
--       NEW.slug := public.normalize_tag_slug(NEW.name);
--
-- so renaming a tag silently moved its page. Measured on prod: setting
-- `hiv-aids` to the UNAIDS form "HIV and AIDS" moved the slug to
-- `hiv-and-aids` and minted a redirect -- on an indexable row carrying 289
-- assignments, 288 of them news. The admin tag form (`AdminTags.tsx`) submits
-- only {name, category, description}, so an editor fixing a display name had no
-- way to see, or decline, the URL move.
--
-- CLAUDE.md recorded this as one of two blockers on that rename. The other, the
-- title-caser turning "HIV and AIDS" into "HIV And AIDS", was fixed in
-- 83000101143000. This is the remaining half. It does NOT perform the rename --
-- whether `hiv-aids` should be renamed is an editorial decision about a news
-- facet, and CLAUDE.md records it as deliberately declined on separate grounds.
--
-- THE RULE: a statement that does not write the slug never changes the slug.
--
-- TWO writers had to change, which is why fixing one function was not enough.
-- `trg_normalize_tag_input` fires first and is the one with the name-triggered
-- branch; `trg_unified_tags_normalize_slug` fires later and its non-ASCII arm
-- ALSO re-derives from the name unconditionally:
--
--     IF NEW.name IS NOT NULL AND NEW.name ~ '[^\x00-\x7F]' THEN
--       NEW.slug := normalize_tag_slug(NEW.name);
--
-- so with only the first fixed, the 88 tags carrying a non-ASCII name (11
-- active) would still have moved on a rename, and a test written against an
-- ASCII name would have passed while they did.
--
-- WHY NOT A HEURISTIC. The obvious softener -- "follow the name only while the
-- slug still matches what the old name derives to", i.e. only while nobody has
-- pinned it -- was measured and REJECTED, because it does not fix the case that
-- motivated the change: normalize_tag_slug('HIV/AIDS') is exactly 'hiv-aids',
-- so `hiv-aids` reads as auto-tracking and would still have moved. Anything
-- conditioned on reachability (indexable, has assignments) fails worse: the
-- same edit then behaves differently on two rows for reasons invisible at the
-- call site.
--
-- COST, STATED. A tag created with a typo keeps the typo in its URL after the
-- name is corrected. The remedy is to write the slug explicitly, which is what
-- 20261013110100 already does (`set name=r.nm, slug=r.slug, ...`) and which
-- mints the redirect through the existing `unified_tags_slug_redirect` trigger.
-- Three applied migrations rename without setting a slug and relied on the old
-- behaviour (20360401100100, 20260802110353, 20261013110000); they are one-shots
-- that will not re-run, and a future one that wants the move can say so.
-- Setting slug = '' remains the explicit re-derive escape hatch.
--
-- Safe on this corpus, measured rather than assumed: all 10,305 slugs are
-- already lowercase and non-null, so the surviving `lower(NEW.slug)` branch is
-- a corpus-wide no-op; and 176 rows (104 active, 13 active+indexable) ALREADY
-- have a slug that differs from normalize_tag_slug(name), so slug-follows-name
-- was never an invariant anything relied on.
--
-- No data is written by this migration.

-- `CREATE OR REPLACE` forces the whole body to be restated, so the name branch
-- below is copied verbatim rather than re-typed from memory. Its `translate()`
-- literal maps en-dash to a SPACE and em-dash to a HYPHEN, which is easy to get
-- wrong by a character; the verify block asserts that behaviour instead of
-- trusting this transcription.
CREATE OR REPLACE FUNCTION public.normalize_tag_input()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.name IS NOT NULL THEN
    NEW.name := btrim(regexp_replace(NEW.name, '[[:cntrl:]<>]', '', 'g'));
    NEW.name := translate(NEW.name, U&'\2018\2019\201C\201D\2013\2014', '''''"" - -');
  END IF;

  -- The name-triggered disjunct is deliberately gone. A slug is derived only
  -- when the statement leaves it absent or empty.
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.normalize_tag_slug(NEW.name);
  ELSE
    NEW.slug := lower(NEW.slug);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.unified_tags_normalize_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $function$
BEGIN
  -- An UPDATE that leaves the slug exactly as it was is not a slug write, so
  -- nothing below may touch it. Without this, the non-ASCII arm re-derives from
  -- the name and a rename moves the page anyway.
  IF TG_OP = 'UPDATE'
     AND NEW.slug IS NOT DISTINCT FROM OLD.slug
     AND NEW.slug IS NOT NULL AND NEW.slug <> '' THEN
    RETURN NEW;
  END IF;

  IF NEW.name IS NOT NULL AND NEW.name ~ '[^\x00-\x7F]' THEN
    -- A caller has no business hand-slugging a diacritic name.
    NEW.slug := normalize_tag_slug(NEW.name);
  ELSE
    NEW.slug := normalize_tag_slug(coalesce(NEW.slug, NEW.name));
  END IF;

  IF NEW.slug = '' OR NEW.slug IS NULL THEN
    NEW.slug := encode(digest(coalesce(NEW.name, NEW.id::text), 'sha1'), 'hex');
  END IF;
  RETURN NEW;
END;
$function$;

do $verify$
declare
  v_probe text := '';
  v_id uuid;
  v_name text;
  v_slug text;
  v_src text;
begin
  -- Behavioural probes run inside a subtransaction and are rolled back by the
  -- RAISE; the message carries the observations back out. Asserting on live
  -- rows would leave writes behind.
  begin
    perform set_config('app.actor', 'human:migration-verify', true);

    -- P1 INSERT still derives the slug from the name.
    insert into public.unified_tags (name) values ('Zzz Slug Probe Alpha')
      returning id, slug into v_id, v_slug;
    v_probe := v_probe || format('P1=%s|', v_slug);

    -- P2 a name-only edit must NOT move the slug.
    update public.unified_tags set name = 'Zzz Slug Probe Beta' where id = v_id;
    select name, slug into v_name, v_slug from public.unified_tags where id = v_id;
    v_probe := v_probe || format('P2=%s/%s|', v_name, v_slug);

    -- P3 an explicit slug write still moves it, and still mints a redirect.
    update public.unified_tags set slug = 'zzz-slug-probe-beta' where id = v_id;
    select slug into v_slug from public.unified_tags where id = v_id;
    v_probe := v_probe || format('P3=%s/%s|', v_slug,
      (select count(*) from public.tag_slug_redirects where old_slug = 'zzz-slug-probe-alpha'));

    -- P4 a name-only edit on a NON-ASCII name must NOT move the slug either.
    insert into public.unified_tags (name) values (U&'Zzz Prob\00E9 Gamma')
      returning id, slug into v_id, v_slug;
    v_probe := v_probe || format('P4a=%s|', v_slug);
    update public.unified_tags set name = U&'Zzz Prob\00E9 Delta' where id = v_id;
    select slug into v_slug from public.unified_tags where id = v_id;
    v_probe := v_probe || format('P4b=%s|', v_slug);

    -- P5 slug = '' remains the explicit re-derive escape hatch.
    update public.unified_tags set name = 'Zzz Slug Probe Epsilon', slug = '' where id = v_id;
    select slug into v_slug from public.unified_tags where id = v_id;
    v_probe := v_probe || format('P5=%s|', v_slug);

    -- P6 the name branch must behave exactly as before this migration:
    -- curly quotes fold to straight, en-dash to a SPACE, em-dash to a HYPHEN.
    -- The expected value is the END of the pipeline, not translate()'s output:
    -- `unified_tags_normalize_name` fires last and title-cases what translate
    -- produced, so the stored name reads `Zzz A'b'c"D"E F-G`. A first draft
    -- asserted the lowercase pre-title-case form and failed on correct code.
    insert into public.unified_tags (name)
      values (U&'Zzz a\2018b\2019c\201Cd\201De\2013f\2014g')
      returning name into v_name;
    v_probe := v_probe || format('P6=%s', v_name);

    raise exception 'TAGSLUGPROBE %', v_probe;
  exception
    when others then
      if sqlerrm not like 'TAGSLUGPROBE %' then
        raise;
      end if;
      v_probe := substring(sqlerrm from 'TAGSLUGPROBE (.*)$');
  end;

  if v_probe is null or v_probe = '' then
    raise exception 'tag slug guard: probes produced no observations';
  end if;

  if v_probe not like '%P1=zzz-slug-probe-alpha|%' then
    raise exception 'tag slug guard: INSERT no longer derives the slug from the name (%)', v_probe;
  end if;
  if v_probe not like '%P2=Zzz Slug Probe Beta/zzz-slug-probe-alpha|%' then
    raise exception 'tag slug guard: a name-only edit still moves the slug (%)', v_probe;
  end if;
  if v_probe not like '%P3=zzz-slug-probe-beta/1|%' then
    raise exception 'tag slug guard: an explicit slug write no longer moves the slug or no longer mints a redirect (%)', v_probe;
  end if;
  if v_probe not like '%P4a=zzz-probe-gamma|%' then
    raise exception 'tag slug guard: a non-ASCII INSERT no longer derives the slug (%)', v_probe;
  end if;
  if v_probe not like '%P4b=zzz-probe-gamma|%' then
    raise exception 'tag slug guard: a name-only edit on a non-ASCII name still moves the slug (%)', v_probe;
  end if;
  if v_probe not like '%P5=zzz-slug-probe-epsilon|%' then
    raise exception 'tag slug guard: slug = '''' no longer re-derives from the name (%)', v_probe;
  end if;
  if v_probe not like '%P6=Zzz A''b''c"D"E F-G%' then
    raise exception 'tag slug guard: name normalization drifted while the body was restated (%)', v_probe;
  end if;

  -- The disjunct this migration exists to remove must be gone from the source,
  -- not merely inert. Behaviour alone would pass if it were restored behind a
  -- condition the probes happen not to exercise.
  select pg_get_functiondef('public.normalize_tag_input'::regproc) into v_src;
  if position('OLD.name IS DISTINCT FROM NEW.name' in v_src) > 0 then
    raise exception 'tag slug guard: normalize_tag_input still re-derives on a name change';
  end if;

  select pg_get_functiondef('public.unified_tags_normalize_slug'::regproc) into v_src;
  if position('NEW.slug IS NOT DISTINCT FROM OLD.slug' in v_src) = 0 then
    raise exception 'tag slug guard: unified_tags_normalize_slug lost its unchanged-slug early return';
  end if;
end
$verify$;
