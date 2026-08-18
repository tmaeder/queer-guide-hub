-- The curated Track A citations: ten tags that ARE a named legal instrument.
--
-- EVERY URL BELOW WAS FETCHED AND ITS CONTENT READ before it entered this file.
-- That is not ceremony — it caught two things a plausible-looking table would
-- have shipped:
--
--   * The OAS's own page for the American Convention
--     (oas.org/dil/treaties_B-32_...htm) 302s to /wearesorry.htm. It is dead, and
--     so is the /en/sla/dil/ path. The UN depositary record is used instead.
--   * DADT is 107 Stat. 1670, not 1547, and the repeal note cites 124 Stat. 3516
--     — confirmed by grepping the govinfo page for the Stat. references rather
--     than trusting a remembered citation.
--
-- Deliberately NOT seeded:
--   * right-to-asylum. The 1951 Refugee Convention defines refugee status and
--     prohibits refoulement (art. 33); it does NOT confer a right to asylum —
--     that is UDHR art. 14. Citing it under this tag would put a source next to a
--     claim the source does not make, which is worse than the blank we have now.
--   * bathroom-bills, marriage-equality, decriminalization and the rest of the
--     class-of-law tags. There is no single instrument; they route to the
--     per-country ILGA ledger via src/lib/rights/tagRightTopics.ts.
--
-- On `instrument_status`: NULL for the UDHR and for GA res 48/141. Neither is
-- "in force" in the sense a statute is — a declaration and a resolution do not
-- commence or lapse — and claiming they are would be the same overstatement the
-- column exists to prevent. The nature of each is stated in claim_summary.

create temp table _law(
  slug text primary key, kind text, juris text, title text,
  adopted smallint, st text, url text, summary text
) on commit drop;

insert into _law values
 ('uganda-anti-homosexuality-act', 'statute', 'UG',
  'The Anti-Homosexuality Act, 2023 (Act 6 of 2023)', 2023, 'partially_invalidated',
  'https://www.parliament.go.ug/sites/default/files/The%20Anti-Homosexuality%20Act,%202023.pdf',
  'Assented to 26 May 2023. On 3 April 2024 the Constitutional Court upheld the Act but nullified sections 3(2)(c), 9, 11(2)(d) and 14.'),

 ('convention-on-the-rights-of-the-child', 'treaty', 'INT',
  'Convention on the Rights of the Child', 1989, 'in_force',
  'https://treaties.un.org/pages/ViewDetails.aspx?src=TREATY&mtdsg_no=IV-11&chapter=4&clang=_en',
  'Adopted New York, 20 November 1989; entered into force 2 September 1990 under article 49(1).'),

 ('convention-on-the-elimination-of-all-forms-of-discrimination-against-women', 'treaty', 'INT',
  'Convention on the Elimination of All Forms of Discrimination against Women', 1979, 'in_force',
  'https://treaties.un.org/pages/ViewDetails.aspx?src=TREATY&mtdsg_no=IV-8&chapter=4&clang=_en',
  'Adopted New York, 18 December 1979; entered into force 3 September 1981 under article 27(1).'),

 ('convention-on-the-rights-of-persons-with-disabilities', 'treaty', 'INT',
  'Convention on the Rights of Persons with Disabilities', 2006, 'in_force',
  'https://treaties.un.org/pages/ViewDetails.aspx?src=TREATY&mtdsg_no=IV-15&chapter=4&clang=_en',
  'Adopted New York, 13 December 2006; entered into force 3 May 2008 under article 45(1).'),

 ('don-t-ask-don-t-tell', 'statute', 'US',
  '10 U.S.C. § 654 — Policy concerning homosexuality in the armed forces', 1993, 'repealed',
  'https://www.govinfo.gov/content/pkg/USCODE-2010-title10/html/USCODE-2010-title10-subtitleA-partII-chap37-sec654.htm',
  'Added by Pub. L. 103-160 (30 November 1993, 107 Stat. 1670); repealed by Pub. L. 111-321 (22 December 2010, 124 Stat. 3516).'),

 ('un-high-commissioner-for-human-rights', 'resolution', 'INT',
  'General Assembly resolution 48/141, "High Commissioner for the promotion and protection of all human rights"',
  1993, null,
  'https://digitallibrary.un.org/record/180226?ln=en',
  'Adopted without vote at the 85th plenary meeting, 20 December 1993. A General Assembly resolution, not a treaty; it created the post of High Commissioner.'),

 ('inter-american-court-of-human-rights', 'treaty', 'INT',
  'American Convention on Human Rights "Pact of San José, Costa Rica"', 1969, 'in_force',
  'https://treaties.un.org/pages/showDetails.aspx?objid=08000002800f10e1',
  'Adopted San José, 22 November 1969; in force 18 July 1978. Chapter VIII (articles 52 ff.) establishes the Court.'),

 ('human-rights', 'resolution', 'INT',
  'Universal Declaration of Human Rights', 1948, null,
  'https://www.un.org/en/about-us/universal-declaration-of-human-rights',
  'Proclaimed by General Assembly resolution 217 A on 10 December 1948. A declaration, not a binding treaty, and one of many instruments in this field.'),

 ('right-to-education', 'treaty', 'INT',
  'International Covenant on Economic, Social and Cultural Rights, article 13', 1966, 'in_force',
  'https://treaties.un.org/pages/ViewDetails.aspx?src=TREATY&mtdsg_no=IV-3&chapter=4&clang=_en',
  'Adopted 16 December 1966 by GA resolution 2200A (XXI); in force 3 January 1976. Article 13 recognises the right to education. Not the sole source.'),

 ('right-to-privacy', 'treaty', 'INT',
  'International Covenant on Civil and Political Rights, article 17', 1966, 'in_force',
  'https://treaties.un.org/pages/ViewDetails.aspx?src=TREATY&mtdsg_no=IV-4&chapter=4&clang=_en',
  'Adopted 16 December 1966 by GA resolution 2200A (XXI); in force 23 March 1976. Article 17 protects against arbitrary interference with privacy. Not the sole source.');

-- The single most valuable statement in this file: a mistyped slug fails the
-- migration instead of silently seeding nothing and leaving the page blank.
do $do$
declare v_missing int; v_names text;
begin
  select count(*), string_agg(l.slug, ', ') into v_missing, v_names
    from _law l left join public.unified_tags t on t.slug = l.slug
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
  from _law l join public.unified_tags t on t.slug = l.slug
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
  if v_public <> 10 then
    raise exception 'expected 10 public citations after seed, found %', v_public;
  end if;
  -- Guards the CHECK actually holding rather than merely existing.
  if exists (select 1 from public.tag_sources
              where is_public and (official_title is null or source_url is null
                                   or jurisdiction is null)) then
    raise exception 'a public citation is missing part of its citation';
  end if;
  raise notice 'seeded % public legal citations', v_public;
end $do$;
