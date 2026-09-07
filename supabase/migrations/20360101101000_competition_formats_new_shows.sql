-- Formats for the twelve independent drag competition series added alongside
-- the Drag Race franchises. Each is its own show and carries its own label; the
-- uniqueness assertion from 20360101100700 is re-run here so a new import
-- cannot quietly reintroduce a shared bucket.
--
-- What these are, from each article's own framing:
--   Dragula          horror-themed, "searching for the world's next drag
--                    supermonster"; its own vocabulary (EXT = Exterminated)
--   Titans           the returning-competitor spin-off of the same show, so it
--                    is a SEPARATE competition rather than a Dragula season —
--                    it numbers its own seasons from 1 and would collide
--   La Mas Draga     Mexican, YouTube-native
--   Call Me Mother   Canadian, and house-based: contestants are drafted into
--                    Houses of Dulcet / Glass / Harmonie
--   Queen of the
--   Universe         a SINGING competition, World of Wonder but outside Drag
--                    Race branding
--   King of Drag     "the first drag competition series to feature solely drag
--                    kings" — the only kings show in the corpus, and the reason
--                    `professions` keeps drag-king separate from drag-queen
--   Drag Den         Filipino, with its own Dragdagulan lip-sync mechanic
--   House of Drag    New Zealand
--   Drag Latina      US Latina-focused, Revry
--   Queen of Drags   German, ProSieben
--   Love for the
--   Arts             Twitch-native
--   Academia de
--   Drags            Brazilian, YouTube, and the earliest of these (2014)

update public.competitions c set format = v.format
  from (values
    ('the-boulet-brothers-dragula',          'Horror drag competition series'),
    ('the-boulet-brothers-dragula-titans',   'Horror drag returning-competitor series'),
    ('la-mas-draga',                         'Mexican drag competition series'),
    ('call-me-mother',                       'Canadian house-based drag competition series'),
    ('queen-of-the-universe',                'Drag singing competition series'),
    ('king-of-drag',                         'Drag king competition series'),
    ('drag-den',                             'Filipino drag competition series'),
    ('house-of-drag',                        'New Zealand drag competition series'),
    ('drag-latina',                          'Latina drag competition series'),
    ('queen-of-drags',                       'German drag competition series'),
    ('love-for-the-arts',                    'Twitch drag competition series'),
    ('academia-de-drags',                    'Brazilian drag competition series')
  ) as v(slug, format)
 where c.slug = v.slug;

do $verify$
declare v_dupes text; v_null int; v_n int; v_kings int;
begin
  -- The invariant this whole line of work exists to hold.
  select string_agg(format || ' (x' || n || ')', '; ') into v_dupes
    from (select format, count(*) as n from public.competitions
           where format is not null group by format having count(*) > 1) d;
  if v_dupes is not null then
    raise exception 'formats shared by more than one competition: %', v_dupes;
  end if;

  select count(*) into v_null from public.competitions where format is null or btrim(format) = '';
  if v_null <> 0 then raise exception '% competition(s) have no format', v_null; end if;

  -- Dragula and Titans must be SEPARATE competitions. Titans numbers its own
  -- seasons from 1, so folding it into Dragula would collide on
  -- (competition_id, edition_number) and silently drop one of them.
  if (select count(*) from public.competitions
       where slug in ('the-boulet-brothers-dragula', 'the-boulet-brothers-dragula-titans')) <> 2 then
    raise exception 'Dragula and Titans must both exist as separate competitions';
  end if;

  -- King of Drag is the only drag-KING show here. If it ever disappears, the
  -- corpus has quietly become queens-only.
  select count(*) into v_kings from public.competitions where slug = 'king-of-drag';
  if v_kings <> 1 then raise exception 'King of Drag is missing from the corpus'; end if;

  select count(*) into v_n from public.competitions;
  if v_n < 40 then raise exception 'only % competitions present; expected 40+', v_n; end if;

  raise notice 'all % competitions carry a distinct format', v_n;
end
$verify$;
