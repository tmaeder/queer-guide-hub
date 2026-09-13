-- Competitions are grouped into COMPARABLE TYPES, and each type gets its own page.
--
-- THE PROBLEM THIS FIXES IS THE VIEW, NOT THE LABEL.
--
-- `/competitions` listed all 45 in one sortable table. Miss Gay America,
-- International Mr. Leather and Drag Race UK are not comparable to each other:
-- one is a female-impersonation pageant, one is a leather title attached to a
-- multi-day convention, one is a licensed television format with an episode
-- grid. Sorting them together by "entrants" or "first aired" produces a ranking
-- that means nothing, and putting them in one filter list implies a peer
-- relationship that does not exist.
--
-- Three previous migrations (100500, 100700, 101000) tried to fix this by
-- renaming the labels — first dropping the "pageant" bucket, then giving every
-- competition a distinct `format`. That was the wrong layer: the labels got
-- more precise while the page kept comparing things that are not alike.
-- `category` is the axis the UI splits on; `format` stays as the per-competition
-- description shown INSIDE its own page.
--
-- THE SIX TYPES
--
--   drag_series    episodic television with a placement grid — the 22 Drag Race
--                  editions plus the independent shows (Dragula, La Mas Draga,
--                  Drag Den, House of Drag, Queen of the Universe, ...)
--   drag_pageant   drag pageantry systems (Miss Gay America, Miss Continental)
--   trans_pageant  beauty pageants for transgender women
--   gay_title      titleholder contests for gay men (Mr Gay World / Europe / India)
--   leather_title  leather and fetish title contests, both attached to
--                  multi-day conventions (International Mr. Leather, MIR)
--   drag_king      drag KING competitions
--
-- KING OF DRAG SITS UNDER drag_king, NOT drag_series, AND THAT IS DELIBERATE.
-- Structurally it belongs with the series — it is episodic and has a grid. But
-- it is the only drag king series in the corpus, and filed with 22 queen
-- franchises it is one row in thirty-three. The corpus is already heavily
-- queen-weighted (measured: 7 drag-king personalities against 776 drag-queen
-- ones, none of the kings public), and the grouping should not deepen that.
-- Category is an editorial axis; `kind` still records that it is a `series`, so
-- nothing structural is lost and the grid still renders.

alter table public.competitions add column if not exists category text;

update public.competitions set category = 'drag_series' where kind = 'series';

update public.competitions c set category = v.category
  from (values
    ('miss-gay-america',            'drag_pageant'),
    ('miss-continental',            'drag_pageant'),
    ('miss-international-queen',    'trans_pageant'),
    ('miss-t-world',                'trans_pageant'),
    ('miss-star-international',     'trans_pageant'),
    ('miss-fabulous-thailand',      'trans_pageant'),
    ('mr-gay-world',                'gay_title'),
    ('mr-gay-europe',               'gay_title'),
    ('mr-gay-india',                'gay_title'),
    ('international-mr-leather',    'leather_title'),
    ('mister-international-rubber', 'leather_title'),
    ('king-of-drag',                'drag_king')
  ) as v(slug, category)
 where c.slug = v.slug;

alter table public.competitions
  add constraint competitions_category_check
  check (category = any (array[
    'drag_series', 'drag_pageant', 'trans_pageant',
    'gay_title', 'leather_title', 'drag_king']));

comment on column public.competitions.category is
  'The COMPARABLE TYPE this competition belongs to, and the axis /competitions splits into separate pages on. Comparison is only meaningful within a category: a leather title contest and a television franchise share a schema, not a peer group. `format` remains the per-competition description shown inside its own page.';

create index if not exists idx_competitions_category on public.competitions (category);

do $verify$
declare v_null int; v_cats text; v_king text; v_n int;
begin
  select count(*) into v_null from public.competitions where category is null;
  if v_null <> 0 then raise exception '% competition(s) have no category', v_null; end if;

  -- Every one of the six must be populated. A category with no members means
  -- its page would ship empty, which is worse than not having the page.
  select string_agg(distinct category, ',' order by category) into v_cats
    from public.competitions;
  if v_cats is distinct from
     'drag_king,drag_pageant,drag_series,gay_title,leather_title,trans_pageant' then
    raise exception 'category vocabulary is %, expected all six populated', v_cats;
  end if;

  -- The specific mis-grouping this migration exists to prevent: the leather
  -- contests must not sit with the pageants, and Drag Race must not sit with
  -- either.
  if (select category from public.competitions where slug = 'international-mr-leather')
     <> 'leather_title' then
    raise exception 'International Mr. Leather is not filed as a leather title';
  end if;
  if (select category from public.competitions where slug = 'rupauls-drag-race')
     <> 'drag_series' then
    raise exception 'RuPauls Drag Race is not filed as a series';
  end if;

  -- King of Drag is the editorial exception and must stay one.
  select category into v_king from public.competitions where slug = 'king-of-drag';
  if v_king <> 'drag_king' then
    raise exception 'King of Drag is filed as %, expected drag_king', v_king;
  end if;
  if (select kind from public.competitions where slug = 'king-of-drag') <> 'series' then
    raise exception 'King of Drag must still be structurally a series so its grid renders';
  end if;

  select count(*) into v_n from public.competitions;
  raise notice '% competitions grouped into six comparable types', v_n;
end
$verify$;
