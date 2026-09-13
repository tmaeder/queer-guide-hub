-- `george-chauncey` is two different men fused into one row, 410 years apart.
--
-- Found while verifying 20360401100200 on prod: 45 of its 46 scholars landed,
-- and the one that did not was George Chauncey, because a row already held that
-- slug. The insert guard (`where not exists (... slug)`) did the right thing by
-- refusing to overwrite it. What it refused to overwrite is this:
--
--   name         George Chauncey        <- the historian
--   profession   Researcher             <- the historian
--   tags         historiker|queer-theory<- the historian (plus a scraped German slug)
--   wikidata_qid Q96375566              <- a man born 1544, died abt 1625/1627
--   birth_date   1544-01-01             <- that man
--   description  "- Abt 1625/1627"      <- that man's genealogy record
--   is_living    true                   <- and yet
--
-- Q1507106 is the historian: "American author and professor", born 1954, enwiki
-- `George Chauncey`, author of Gay New York (1994). Q96375566 has no English
-- article, no occupation, and a 16th-century birth. A genealogy entity was
-- fused onto a queer historian's identity.
--
-- WHY IT MATTERS BEYOND ONE ROW. The row carries `queer-theory` in `tags`, and
-- 20360401100100 just revived that tag — so this record was one publish away
-- from appearing on `/tags/queer-theory` as a scholar born in 1544. It is also
-- exactly the class the sibling migration repaired on the TAG side (`queerness`
-- holding the queer-theory QID): an identifier adopted by name agreement alone.
-- The weekly Wikidata syncs rebuild from `wikidata_qid`, so a wrong id is not
-- inert — it regenerates wrong data indefinitely.
--
-- `birth_date` IS CLEARED, NOT CORRECTED TO 1954-01-01. Wikidata gives Q1507106
-- year precision only, and a padded January 1st is indistinguishable from a
-- measured date once stored — the same rule 20360401100200 applied to its own
-- 12 year-only scholars. `is_living` stays true and is now consistent: he is
-- alive, and the 1544 date was the contradiction.
--
-- SCOPE. One row. A corpus-wide sweep is NOT attempted here: the same query
-- that found this shows **17 personalities with `is_living = true` and a
-- pre-1900 birth_date**. Some of those will be a wrong date on a real living
-- person, others a wrong `is_living` on a historical one, and telling them
-- apart needs the same per-row reading this row got. Recorded so the next
-- person does not have to re-derive it.
--
-- Reversible: prior values are in the migration header above and in
-- `personalities` history; no row is created or deleted.

set local statement_timeout = '120s';

select set_config('app.actor', 'migration:george-chauncey-namesake-repair', true);

do $mig$
declare v_id uuid; v_qid text; v_n int;
begin
  select id, wikidata_qid into v_id, v_qid
    from public.personalities where slug = 'george-chauncey';

  if v_id is null then
    raise notice 'george-chauncey: row absent, nothing to repair';
    return;
  end if;

  -- Refuse if someone has already moved it: this migration is only correct
  -- against the fused state it documents.
  if v_qid is distinct from 'Q96375566' then
    raise exception
      'george-chauncey: expected the fused Q96375566, found % — re-read the row before repairing',
      coalesce(v_qid, 'NULL');
  end if;

  -- `personalities_wikidata_qid_uniq` is a partial unique index; a second
  -- holder would make this a duplicate rather than a repair.
  if exists (select 1 from public.personalities
              where wikidata_qid = 'Q1507106' and id <> v_id) then
    raise exception 'george-chauncey: Q1507106 is already held by another row';
  end if;

  update public.personalities
     set wikidata_qid  = 'Q1507106',
         wikipedia_url = 'https://en.wikipedia.org/wiki/George_Chauncey',
         birth_date    = null,
         description   = 'Historian of gay New York before Stonewall',
         bio =
           'Historian whose Gay New York (1994) documented a large, visible working-class gay '
           'world in the city between 1890 and 1940, overturning the assumption that the closet '
           'had always been the norm. He has since written on the history of marriage and of '
           'anti-gay discrimination, and testified in several US marriage-equality cases.',
         lgbti_connection = coalesce(lgbti_connection, 'unclear'),
         lgbti_details =
           'Named in the English Wikipedia article on Queer; this platform records the '
           || 'scholarly contribution, not a claim about the person.',
         -- `historiker` is a scraped German string, not authored vocabulary.
         tags = (select array_agg(distinct x)
                   from unnest(coalesce(tags, '{}')) as x
                  where x <> 'historiker'),
         visibility     = 'public',
         seo_indexable  = true,
         needs_attention = false,
         updated_at     = now()
   where id = v_id;

  ------------------------------------------------------------------ assertions
  select count(*) into v_n from public.personalities
   where slug = 'george-chauncey'
     and wikidata_qid = 'Q1507106'
     and birth_date is null
     and visibility = 'public'
     and coalesce(btrim(bio), '') <> ''
     and not ('historiker' = any(coalesce(tags, '{}')));
  if v_n <> 1 then
    raise exception 'george-chauncey: repair did not take (the public gate demotes silently)';
  end if;

  -- The row still points at the tag this was found through, so it reaches
  -- /tags/queer-theory as the historian rather than as a 16th-century man.
  select count(*) into v_n from public.personalities
   where slug = 'george-chauncey' and 'queer-theory' = any(coalesce(tags, '{}'));
  if v_n <> 1 then
    raise exception 'george-chauncey: lost its queer-theory tag';
  end if;

  raise notice 'george-chauncey: repaired Q96375566 -> Q1507106';
end
$mig$;
