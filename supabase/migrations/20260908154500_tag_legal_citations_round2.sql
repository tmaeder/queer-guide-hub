-- Seven more law tags get their instrument.
--
-- The first pass (20260906100200) covered 10 tags. This closes the reachable
-- remainder, measured rather than guessed: of the law-ish tags with no source at
-- all, these are the ones where a single named instrument genuinely governs.
--
-- SIX OF THE SEVEN REUSE A URL THIS REPO HAS ALREADY FETCHED AND READ.
-- `women-s-rights` and `gender-equality` are what CEDAW is; `disability-rights`
-- is what the CRPD is; `children-s-rights` is the CRC. Pointing a second tag at
-- an already-verified instrument carries no new risk of a dead or wrong link —
-- and `tag_sources_public_citation_uniq` is per (tag_id, source_url), so the
-- duplication is intentional and legal.
--
-- `indigenous-rights` is the only new source. UNDRIP's page on un.org and the
-- ILO's normlex both return 403 to non-browser clients (a bot challenge, same as
-- ohchr.org), so it is cited to the UN Digital Library record, which returns 200
-- and whose title was read: "United Nations Declaration on the Rights of
-- Indigenous Peoples".
--
-- `asylum-refugees` IS seeded even though `right-to-asylum` was deliberately
-- refused in the first pass, and the distinction is the whole point: the 1951
-- Convention defines refugee status and prohibits refoulement, so it governs
-- "asylum & refugees" as a subject. It does NOT confer a right to asylum, which
-- is what the other tag names, so citing it there would have put a source next
-- to a claim the source does not make.
--
-- NOT SEEDED, and each for a stated reason:
--   * `civil-rights` (71 uses). Reads as the ICCPR internationally and as the
--     Civil Rights Act of 1964 in US usage. Two plausible instruments means
--     picking one is a coin toss presented as a fact.
--   * `sexual-harassment` (14). ILO Convention 190 is the right instrument and
--     normlex 403s, so it could not be verified. Left blank rather than guessed.
--   * `bathroom-bills`, `transphobia`, `equality`, `human-rights-monitoring`,
--     `international-law`. A class of US state bills, a phenomenon, an abstract
--     noun, a practice and a whole field of law — none has one instrument.
--   * The whole-field rights tags (`lgbtqia-rights` and friends) go to the
--     umbrella branch in src/lib/rights/tagRightTopics.ts instead, because no
--     single instrument or single right covers them.

create temp table _law2(
  slug text primary key, kind text, juris text, title text,
  adopted smallint, st text, url text, summary text
) on commit drop;

insert into _law2 values
 ('women-s-rights', 'treaty', 'INT',
  'Convention on the Elimination of All Forms of Discrimination against Women', 1979, 'in_force',
  'https://treaties.un.org/pages/ViewDetails.aspx?src=TREATY&mtdsg_no=IV-8&chapter=4&clang=_en',
  'Adopted New York, 18 December 1979; entered into force 3 September 1981. The principal international instrument on women''s rights.'),

 ('gender-equality', 'treaty', 'INT',
  'Convention on the Elimination of All Forms of Discrimination against Women', 1979, 'in_force',
  'https://treaties.un.org/pages/ViewDetails.aspx?src=TREATY&mtdsg_no=IV-8&chapter=4&clang=_en',
  'Adopted New York, 18 December 1979; in force 3 September 1981. Sets the treaty standard for equality between women and men. Not the sole source.'),

 ('disability-rights', 'treaty', 'INT',
  'Convention on the Rights of Persons with Disabilities', 2006, 'in_force',
  'https://treaties.un.org/pages/ViewDetails.aspx?src=TREATY&mtdsg_no=IV-15&chapter=4&clang=_en',
  'Adopted New York, 13 December 2006; entered into force 3 May 2008 under article 45(1).'),

 ('children-s-rights', 'treaty', 'INT',
  'Convention on the Rights of the Child', 1989, 'in_force',
  'https://treaties.un.org/pages/ViewDetails.aspx?src=TREATY&mtdsg_no=IV-11&chapter=4&clang=_en',
  'Adopted New York, 20 November 1989; entered into force 2 September 1990 under article 49(1).'),

 ('right-to-vote', 'treaty', 'INT',
  'International Covenant on Civil and Political Rights, article 25', 1966, 'in_force',
  'https://treaties.un.org/pages/ViewDetails.aspx?src=TREATY&mtdsg_no=IV-4&chapter=4&clang=_en',
  'Adopted 16 December 1966; in force 23 March 1976. Article 25 guarantees the right to vote and to be elected. Not the sole source.'),

 ('asylum-refugees', 'treaty', 'INT',
  'Convention relating to the Status of Refugees', 1951, 'in_force',
  'https://treaties.un.org/pages/ViewDetails.aspx?src=TREATY&mtdsg_no=V-2&chapter=5&clang=_en',
  'Adopted Geneva, 28 July 1951; in force 22 April 1954. Defines refugee status; article 33 prohibits refoulement.'),

 ('indigenous-rights', 'resolution', 'INT',
  'United Nations Declaration on the Rights of Indigenous Peoples (A/RES/61/295)', 2007, null,
  'https://digitallibrary.un.org/record/606782?ln=en',
  'Adopted by the General Assembly on 13 September 2007. A declaration, not a binding treaty.');

-- A mistyped slug fails the migration instead of silently seeding nothing.
do $do$
declare v_missing int; v_names text;
begin
  select count(*), string_agg(l.slug, ', ') into v_missing, v_names
    from _law2 l left join public.unified_tags t on t.slug = l.slug
   where t.id is null;
  if v_missing > 0 then
    raise exception '% seed slug(s) match no unified_tags row: %', v_missing, v_names;
  end if;
end $do$;

insert into public.tag_sources
  (tag_id, source_type, source_url, official_title, jurisdiction,
   adopted_year, instrument_status, claim_summary, is_public, verified_at, fetched_at)
select t.id, l.kind, l.url, l.title, l.juris, l.adopted, l.st, l.summary,
       true, now(), now()
  from _law2 l join public.unified_tags t on t.slug = l.slug
on conflict (tag_id, source_url) where is_public do update set
  official_title    = excluded.official_title,
  jurisdiction      = excluded.jurisdiction,
  adopted_year      = excluded.adopted_year,
  instrument_status = excluded.instrument_status,
  claim_summary     = excluded.claim_summary,
  source_type       = excluded.source_type,
  verified_at       = now();

do $do$
declare v_public int;
begin
  select count(*) into v_public from public.tag_sources where is_public;
  if v_public <> 17 then
    raise exception 'expected 17 public citations after round 2, found %', v_public;
  end if;
  if exists (select 1 from public.tag_sources
              where is_public and (official_title is null or source_url is null
                                   or jurisdiction is null)) then
    raise exception 'a public citation is missing part of its citation';
  end if;
  raise notice 'round 2 complete: % public legal citations', v_public;
end $do$;
