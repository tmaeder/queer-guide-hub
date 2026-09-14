-- Two revivals, one new term, and one wrong-entity cleanup — the violence half
-- of the Berlin harm-reduction comparison (see 50100101100000 for the sources).
--
-- MANEO has published on gay men's relationship violence, family violence
-- against LGBTQ+ minors, and forced marriage for over thirty years. Compared
-- against that material the glossary had, between it, nothing live at all.
--
-- 1. `intimate-partner-violence` and `domestic-violence` ARE BOTH DEPRECATED,
--    both by the 2026-06-05 orphan audit ("no entity assignments, relations,
--    synonyms, or aliases"). That premise is false for a glossary term — a
--    glossary term has no entity assignments by nature — which is the finding
--    20261211100000 recorded when it revived `femdom` and `voyeur`, and
--    20360101101600 when it revived fifteen more including
--    `men-who-have-sex-with-men`. Neither row is merged, so neither is a
--    redirect to a surviving concept; both are simply gone. Both carry a real
--    body (456 and 459 characters) and, unusually for this class, a CORRECT
--    Wikidata identifier — Q5153528 and Q156537, verified live, labels
--    "intimate partner violence" and "domestic violence". So nothing here is
--    invented and nothing needs repointing.
--
--    They are kept as two rows rather than collapsed into one because they are
--    two standard terms and the two MANEO documents map onto them separately:
--    "Gewalt in Beziehungsformen schwuler Maenner" is partner violence, and
--    "Gewalt gegen Schutzbefohlene" is violence inside a household against a
--    child in someone's care. The WHO keeps the same distinction.
--
--    Both revive UNPUBLISHED, per 20360101101600: the bodies were written by an
--    earlier Wikidata pass and no human has reviewed them. The cost, stated
--    once — unpublished plus zero usage means `deprecate_unused_tags` can sweep
--    them again — is accepted for the same reason as there: a swept term can be
--    revived again, a false human_reviewed=true cannot be undone by inspection.
--
--    ONE PROSE WRITE RIDES ALONG, and it is a NULL fill, not a rewrite:
--    `intimate-partner-violence`.`description` is NULL, and what both bodies
--    have in common is that neither says anything about queer relationships at
--    all. The filled text is the specific repertoire MANEO's folder documents:
--    threatening to out a partner, lying about HIV status, pressure into
--    unwanted or unprotected sex, isolation, and surveillance of a phone, inbox
--    or finances. That is the entire reason the term is worth having here
--    rather than pointing at a general-audience definition.
--
-- 2. `forced-marriage` IS ABSENT — no row, no alias, under any spelling. It is
--    the subject of one MANEO flyer outright and a section of another, and the
--    queer dimension is not incidental to it: gay and bisexual men and youths
--    are pushed into a HETEROSEXUAL marriage so that a family's heteronormative
--    expectations are met, which is coercion into performing an orientation,
--    not only denial of one. It belongs beside conversion therapy and being
--    thrown out, which is how MANEO's own material files it.
--
--    Created unpublished, per house convention for new terms
--    (20360101101300, 20360101101700) — the prose is authored here and unread
--    by anyone else.
--
--    IT SETS ALL THREE CATEGORY REPRESENTATIONS BY HAND, and that is not
--    belt-and-braces. Both category triggers are UPDATE-only —
--    `trg_sync_tag_category` is BEFORE UPDATE and `trg_sync_tag_category_after`
--    is AFTER UPDATE OF category_id — so an INSERT that sets `category_id`
--    derives no `category` text and mints no `tag_category_assignments` row.
--    The first dry run of this file produced exactly that: category_id set,
--    `category` NULL. Since `/tags/:slug` renders the JUNCTION and the search
--    facet renders the TEXT, a row created the obvious way is uncategorised on
--    its own page and categorised in search.
--
--    This is corpus-wide, not a quirk of this migration: 194 active tags carry
--    a category_id with no junction row, including all three terms
--    20360101101300 created. They are NOT repaired here — 194 rows is its own
--    change with its own measurement of which category each should land in —
--    but the number is recorded so the next person does not rediscover it one
--    tag at a time.
--
-- 3. `watersports` POINTS AT AQUATIC SPORTS. wikidata_id Q61065, verified live,
--    label "water sport", description "sports that take place in or on water",
--    wikipedia_url en/List_of_water_sports — with a long_description about
--    swimming, surfing and kayaking and a short_description reading "Sports on
--    or in water", on a row filed under Fetishes whose own `description`
--    correctly describes urine play. The row is deprecated, so this is latent
--    rather than live; it is fixed anyway because the next person to revive it
--    would publish kayaking prose on a kink page, and because the wrong halves
--    are exactly the halves a revival keeps. Only the wrong FIELDS are cleared
--    — the correct `description` stays, which is the rule 20360401100300 set on
--    `queerness` and 20360101101600 on `casting`. It is NOT revived: the
--    glossary holds a second row for the same concept (`piss-play`, also
--    deprecated, prose correct), and choosing between them is a merge decision,
--    not a cleanup.
--
--    `piss-play` is worth one warning for whoever takes that on: it is
--    deprecated AND seo_indexable=true, the trap 20360101101300 hit on
--    `impaired-driving` — reviving it without clearing that flag publishes an
--    unreviewed machine body straight to crawlers.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:maneo-violence-vocabulary', true);

do $mig$
declare
  rec       record;
  v_cat     uuid;
  v_bad     int;
  v_n       int := 0;
  v_ipv     uuid;
  v_fm      uuid;
begin
  select id into v_cat from public.tag_categories where slug = 'violence-hate';
  if v_cat is null then
    raise exception 'violence-hate category does not exist — re-check before filing anything into it';
  end if;

  ------------------------------------------------------------------ 1. revivals
  create temp table _revive (slug text primary key) on commit drop;
  insert into _revive (slug) values ('intimate-partner-violence'), ('domestic-violence');

  select count(*) into v_bad from _revive r
   where not exists (select 1 from public.unified_tags t
                      where t.slug = r.slug and t.status = 'deprecated');
  if v_bad > 0 then
    raise exception 'maneo revivals: % row(s) are not deprecated — re-check before reviving', v_bad;
  end if;

  -- A merged row is a redirect and must never be revived: that produces two
  -- live rows for one concept, pointing at each other.
  select count(*) into v_bad from _revive r
    join public.unified_tags t on t.slug = r.slug
   where t.merged_into_id is not null;
  if v_bad > 0 then
    raise exception 'maneo revivals: % row(s) are merged, not merely deprecated', v_bad;
  end if;

  -- Nothing here invents a body. If one has gone missing since this was
  -- authored, stop rather than revive an empty term.
  select count(*) into v_bad from _revive r
    join public.unified_tags t on t.slug = r.slug
   where coalesce(t.long_description, '') = '';
  if v_bad > 0 then
    raise exception 'maneo revivals: % row(s) have no body', v_bad;
  end if;

  -- A slug held as an alias of another tag cannot be revived: two rows would
  -- answer to one name. tag_reject_alias_shadow() enforces it on the UPDATE,
  -- but it fires mid-loop about one tag; this names the whole set.
  select count(*) into v_bad from _revive r
   where exists (select 1 from public.tag_aliases a where a.alias_slug = r.slug);
  if v_bad > 0 then
    raise exception 'maneo revivals: % slug(s) are held as an alias of another tag', v_bad;
  end if;

  for rec in select * from _revive order by slug loop
    update public.unified_tags set
      status              = 'active',
      deprecated_at       = null,
      deprecation_reason  = null,
      seo_indexable       = false,
      human_reviewed      = false,
      verification_status = 'unverified',
      category_id         = v_cat
    where slug = rec.slug;
    v_n := v_n + 1;

    insert into public.tag_sources (tag_id, source_type, source_url, claim_summary, is_public)
    select t.id, 'editorial:general-knowledge',
           'https://maneo.de/wp-content/uploads/2023/06/MANEO-Folder-Gewalt_in_Beziehungsformen_schwuler_Maenner_04-1.pdf',
           'Revived unpublished. Culled by the 2026-06-05 orphan audit, whose premise — no entity assignments — is not evidence about a glossary term. Body kept unchanged and unreviewed; Wikidata identifier verified correct and left in place. Filed under Violence & Hate, which the row had no category for at all.',
           false
      from public.unified_tags t where t.slug = rec.slug;
  end loop;

  if v_n <> 2 then
    raise exception 'maneo revivals: expected 2, revived %', v_n;
  end if;

  ------------------------------------------- 1b. the one NULL fill on IPV
  select id into v_ipv from public.unified_tags where slug = 'intimate-partner-violence';

  update public.unified_tags set
    description =
      'Abuse used by one partner to control the other, in any relationship form. Queer relationships carry a repertoire that general-audience definitions miss: threatening to out a partner to their family, employer or immigration authorities; lying about or weaponising HIV status; pushing a partner into sex that is unwanted or unprotected; and isolation, which is easier where a couple shares one small scene and the same friends. Berlin anti-violence casework counts monitoring a partner''s phone, inbox or finances as part of the same pattern rather than as jealousy.'
  where id = v_ipv
    and coalesce(description, '') = '';

  if not found then
    raise exception 'ipv: description was not empty — this fills, it never overwrites';
  end if;

  ------------------------------------------------------------ 2. forced-marriage
  if exists (select 1 from public.unified_tags where slug = 'forced-marriage') then
    raise exception 'forced-marriage: a row already exists in some status — resolve by hand';
  end if;
  if exists (select 1 from public.tag_aliases
              where alias_slug in ('forced-marriage', 'zwangsverheiratung', 'zwangsheirat')) then
    raise exception 'forced-marriage: the slug or a German spelling is held as an alias of another tag';
  end if;

  insert into public.unified_tags
    (name, slug, category_id, category, entity_kind,
     status, seo_indexable, human_reviewed, verification_status,
     is_sensitive, short_description, description, long_description)
  values (
    'Forced Marriage', 'forced-marriage', v_cat,
    (select name from public.tag_categories where id = v_cat), 'concept',
    'active', false, false, 'unverified', true,
    'Being made to marry under violence or threat — and for queer people, usually made to marry heterosexually.',
    'A marriage entered because of violence or the threat of it, whether concluded formally at a registry office or informally through a religious ceremony. Being prevented from leaving one counts too. Gay, bisexual and trans people are typically forced into a HETEROSEXUAL marriage, so the coercion is not only to marry a particular person but to perform an orientation the family finds acceptable.',
    'Forced marriage means being made to marry through violence or the threat of it. The marriage may be formal, concluded at a registry office, or informal, concluded through a religious ceremony; both count. So does the other end of it — being stopped from dissolving a marriage by threats of violence or by having the means to live withdrawn.

Several things that do not look like force are force. A refusal that is simply ignored. Not daring to refuse in the first place, because of what refusing would cost. Being threatened with financial consequences, or with consequences under immigration law such as deportation. The line between a forced marriage and an arranged marriage is not clean, and cannot be drawn from the outside: an arranged marriage is usually described as one that relatives initiate but that both spouses then actually agree to, and the question is always whether agreement was real.

The queer dimension is specific. Gay, bisexual and trans people are pushed into a heterosexual marriage precisely so that a family''s expectations and the appearance of tradition are satisfied. Denying one''s own identity is not the end of it — the demand is to live as heterosexual. It sits alongside the other things families do to queer children and is often found with them: conversion therapy, withdrawal of affection, blackmail, being thrown out of the house, or being taken abroad.

In Germany forced marriage is its own offence under section 237 of the criminal code, carrying six months to five years. The attempt is punishable, and so is taking someone abroad to be married. A forced marriage successfully carried out abroad can still be prosecuted in Germany where the person lives or is ordinarily resident, regardless of the law in the country where it happened.

Anyone can go to the police. In Germany a person under eighteen can also go to the Jugendamt, the youth welfare office, which is obliged to take a child or young person asking for help into its care. Specialist LGBTQ+ anti-violence projects work confidentially and, as a rule, do nothing without the person''s agreement — which matters here, because for most people in this situation the danger and the family are the same address.')
  returning id into v_fm;

  insert into public.tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
  values (v_fm, 'Zwangsverheiratung', 'zwangsverheiratung', 'multilingual', 'approved'),
         (v_fm, 'Zwangsheirat',       'zwangsheirat',       'multilingual', 'approved')
  on conflict (alias_slug) do nothing;

  -- No trigger does this on INSERT (see header). Without it the page renders no
  -- category while the search facet renders one.
  insert into public.tag_category_assignments (tag_id, category_id, is_primary)
  values (v_fm, v_cat, true);

  insert into public.tag_sources (tag_id, source_type, source_url, claim_summary, is_public)
  values (v_fm, 'editorial:general-knowledge',
          'https://maneo.de/wp-content/uploads/2022/12/Faltflyer_Zwangsverheiratung_03.pdf',
          'Created unpublished. Absent from the glossary under any spelling while being the subject of a MANEO flyer and a section of the Schutzbefohlene folder. Definition, the section 237 StGB penalty, the extraterritorial reach and the Jugendamt duty under section 42 SGB VIII are from those two documents.',
          false);

  ------------------------------------------------------------- 3. watersports
  update public.unified_tags set
    wikidata_id       = null,
    wikipedia_url     = null,
    short_description = null,
    long_description  = null
  where slug = 'watersports'
    and wikidata_id = 'Q61065';

  if not found then
    raise notice 'watersports: not carrying Q61065 — already cleaned or moved, left alone';
  else
    insert into public.tag_sources (tag_id, source_type, claim_summary, is_public)
    select t.id, 'editorial:general-knowledge',
           'Wrong-entity fields cleared. The row carried Q61065 (aquatic sports), wikipedia_url en/List_of_water_sports, short_description "Sports on or in water" and a long_description about swimming, surfing and kayaking — on a Fetishes row whose own description correctly describes urine play. Only the wrong fields were cleared; the correct description stays. Not revived: `piss-play` holds the same concept and choosing between them is a merge decision.',
           false
      from public.unified_tags t where t.slug = 'watersports';
  end if;
end $mig$;

-- Postconditions.
do $verify$
declare
  v_bad int;
begin
  select count(*) into v_bad from public.unified_tags
   where slug in ('intimate-partner-violence', 'domestic-violence', 'forced-marriage')
     and (status <> 'active'
          or deprecated_at is not null
          or deprecation_reason is not null
          or category_id is null
          or seo_indexable
          or human_reviewed);
  if v_bad > 0 then
    raise exception 'verify: % row(s) landed inconsistent or published', v_bad;
  end if;

  select count(*) into v_bad from public.unified_tags
   where slug in ('intimate-partner-violence', 'domestic-violence', 'forced-marriage')
     and (coalesce(description, '') = '' or coalesce(long_description, '') = '');
  if v_bad > 0 then
    raise exception 'verify: % row(s) are live with no prose', v_bad;
  end if;

  -- All THREE category representations, not just category_id: the text is what
  -- the search facet renders and the junction is what /tags/:slug renders, and
  -- an INSERT sets neither by itself.
  select count(*) into v_bad from public.unified_tags t
   where t.slug in ('intimate-partner-violence', 'domestic-violence', 'forced-marriage')
     and (t.category is distinct from 'Violence & Hate'
          or not exists (select 1 from public.tag_category_assignments a
                          where a.tag_id = t.id and a.is_primary
                            and a.category_id = t.category_id));
  if v_bad > 0 then
    raise exception 'verify: % row(s) disagree across category_id, category text and the primary junction', v_bad;
  end if;

  select count(*) into v_bad from public.unified_tags
   where slug = 'intimate-partner-violence'
     and description not like '%out a partner%';
  if v_bad > 0 then
    raise exception 'verify: the IPV description does not carry the queer-specific content it exists for';
  end if;

  select count(*) into v_bad from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where a.alias_slug in ('zwangsverheiratung', 'zwangsheirat')
     and t.slug <> 'forced-marriage';
  if v_bad > 0 then
    raise exception 'verify: a German forced-marriage alias points at the wrong tag';
  end if;

  select count(*) into v_bad from public.unified_tags
   where slug = 'watersports'
     and (wikidata_id is not null
          or coalesce(long_description, '') like '%kayaking%'
          or coalesce(short_description, '') = 'Sports on or in water');
  if v_bad > 0 then
    raise exception 'verify: watersports still carries the aquatic-sports entity';
  end if;

  -- The correct half must survive the cleanup above.
  select count(*) into v_bad from public.unified_tags
   where slug = 'watersports' and coalesce(description, '') = '';
  if v_bad > 0 then
    raise exception 'verify: watersports lost its correct description — only the wrong fields were meant to go';
  end if;
end $verify$;
