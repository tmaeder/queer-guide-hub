-- One format per competition. Nothing shares a label with anything else.
--
-- 20360101100500 removed the "pageant" bucket but left two smaller ones behind:
-- all 22 Drag Race editions shared "Drag competition series", and Miss
-- International Queen, Miss T World and Miss Star International shared
-- "International transgender beauty pageant". Those are still buckets — three
-- separate pageants run by three separate organisations reading as one chip,
-- and 22 licensed editions from Chile to Thailand collapsed into a single row.
--
-- Every competition here is independent, so every competition gets its own
-- label, and a UNIQUENESS ASSERTION at the bottom makes that a property of the
-- table rather than a convention someone has to remember. If a future import
-- adds a competition without a distinct format, the migration that adds it
-- fails — which is the only way this stays true.
--
-- Every Drag Race row says it IS a Drag Race edition. That is both more honest
-- (they are licensed local editions of ONE format, not 22 unrelated shows) and
-- collision-proof against the independent national series added later: the
-- uniqueness assertion caught exactly that, four times over — Drag Race Germany
-- vs Queen of Drags, Brasil vs Academia de Drags, Philippines vs Drag Den,
-- Mexico vs La Mas Draga.
--
-- The labels stay descriptive rather than becoming restatements of the name
-- wherever the source gives something to work with: the Drag Race editions are
-- distinguished by the country whose show they are, and the three transgender
-- pageants by their own lead sentences ("the world's biggest beauty pageant for
-- transgender women" / "one of world's biggest" / "a beauty pageant for
-- transgender women").
--
-- Dragula is added here rather than inheriting the old generic series label: it
-- is an independent horror-themed show on Shudder with its own vocabulary
-- (EXT = Exterminated), not a Drag Race edition.

update public.competitions c set format = v.format
  from (values
    -- Drag Race, by the country whose edition it is.
    ('rupauls-drag-race',                        'US Drag Race edition'),
    ('rupauls-drag-race-all-stars',              'US Drag Race all-stars edition'),
    ('rupauls-secret-celebrity-drag-race',       'US Drag Race celebrity edition'),
    ('slaycation',                               'US Drag Race travel spin-off'),
    ('rupauls-drag-race-uk',                     'British Drag Race edition'),
    ('rupauls-drag-race-uk-vs-the-world',        'British Drag Race international invitational'),
    ('canadas-drag-race',                        'Canadian Drag Race edition'),
    ('canadas-drag-race-canada-vs-the-world',    'Canadian Drag Race international invitational'),
    ('drag-race-belgique',                       'Belgian Drag Race edition'),
    ('drag-race-brasil',                         'Brazilian Drag Race edition'),
    ('drag-race-down-under',                     'Australian and New Zealand Drag Race edition'),
    ('drag-race-espana',                         'Spanish Drag Race edition'),
    ('drag-race-france',                         'French Drag Race edition'),
    ('drag-race-germany',                        'German Drag Race edition'),
    ('drag-race-global-all-stars',               'Global Drag Race all-stars edition'),
    ('drag-race-holland',                        'Dutch Drag Race edition'),
    ('drag-race-italia',                         'Italian Drag Race edition'),
    ('drag-race-mexico',                         'Mexican Drag Race edition'),
    ('drag-race-philippines',                    'Filipino Drag Race edition'),
    ('drag-race-sverige',                        'Swedish Drag Race edition'),
    ('drag-race-thailand',                       'Thai Drag Race edition'),
    ('the-switch-drag-race',                     'Chilean Drag Race edition'),
    -- Independent series.
    ('the-boulet-brothers-dragula',              'Horror drag competition series'),
    -- Title contests, each in its own words.
    ('mr-gay-europe',                            'European gay men''s competition'),
    ('mr-gay-india',                             'Indian gay beauty pageant'),
    ('miss-international-queen',                 'World''s largest transgender beauty pageant'),
    ('miss-star-international',                  'International transgender beauty pageant'),
    ('miss-t-world',                             'Transgender beauty pageant'),
    ('miss-fabulous-thailand',                   'Televised pageant for women and LGBTQIA+ people')
  ) as v(slug, format)
 where c.slug = v.slug;

do $verify$
declare v_dupes text; v_null int; v_n int;
begin
  -- THE POINT OF THIS MIGRATION. No two competitions may share a format.
  select string_agg(format || ' (x' || n || ')', '; ') into v_dupes
    from (select format, count(*) as n from public.competitions
           where format is not null group by format having count(*) > 1) d;
  if v_dupes is not null then
    raise exception 'formats shared by more than one competition: %', v_dupes;
  end if;

  select count(*) into v_null from public.competitions where format is null or btrim(format) = '';
  if v_null <> 0 then
    raise exception '% competition(s) have no format', v_null;
  end if;

  -- The earlier corrections must still hold: the leather and rubber contests
  -- are conventions, not pageants, and Miss Gay America still is one.
  if exists (select 1 from public.competitions
              where slug in ('international-mr-leather','mister-international-rubber','mr-gay-europe')
                and format ilike '%pageant%') then
    raise exception 'a non-pageant contest is labelled a pageant again';
  end if;
  if not exists (select 1 from public.competitions
                  where slug = 'miss-gay-america' and format ilike '%pageant%') then
    raise exception 'Miss Gay America should still be described as a pageant';
  end if;

  -- Positive control: this only proves anything if there is a corpus to check.
  select count(*) into v_n from public.competitions;
  if v_n < 30 then raise exception 'only % competitions present; too few to verify', v_n; end if;

  raise notice 'every one of % competitions carries a distinct format', v_n;
end
$verify$;
