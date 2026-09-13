-- Create three glossary terms that appear in the raveitsafe.ch harm-reduction
-- index and in no row of `unified_tags` under any status, and revive a fourth
-- that was culled by the zero-usage sweep.
--
-- WHY THIS SOURCE. raveitsafe.ch is the Bern nightlife service run by CONTACT;
-- saferparty.ch, its Zurich sibling, was already imported here once (the
-- `admin:saferparty-substance-import` actor still shows in
-- `deprecation_reason` on `crystal-meth` and `nicotine`). That import is why
-- coverage is already good: of the 33 substances in raveitsafe's A-Z, 30 are
-- present, and the two conceptual pages (Drug/Set/Setting, Mischkonsum) map
-- onto `set-and-setting` and `polydrug-use`, both of which already carry
-- accurate bodies. This migration is the residue, not a bulk import.
--
-- NOT ONE WORD IS COPIED. raveitsafe's pages are ordinary copyrighted content
-- and queer.guide is commercial. Only their TERM LIST was used, as a signal for
-- which entries are absent. Every definition below is original text written
-- from independently documented pharmacology and harm-reduction practice, which
-- is what `editorial:general-knowledge` records. Nothing here is a translation.
--
-- `Nachtschattendrogen` (nightshades) is deliberately NOT created: `deliriants`
-- already covers that class with a 1,398-character body, and a second row for
-- the same concept is what the guard below exists to prevent.
--
-- THE THREE NEW ROWS ARE UNPUBLISHED — seo_indexable=false, human_reviewed=false,
-- verification_status='unverified' — per the convention established by the
-- Kinktionary passes. Because they are also is_sensitive=true (every row in
-- `Substances & Recovery` is), `unified_tags_public_gated_read` withholds them
-- from signed-out readers entirely until an editor moves
-- verification_status to 'reviewed'. That is the intended cost, and
-- verification_status — not seo_indexable — is the lever that lifts it.
--
-- They are consequently eligible for `deprecate_unused_tags`, which skips
-- human_reviewed rows only. A draft nobody adopts being swept later is the
-- correct outcome, not a leak.
--
-- `impaired-driving` is the fourth, and it is a REVIVE plus a CORRECTION rather
-- than a creation. It was deprecated 'auto: zero usage' with merged_into_id
-- NULL — the same sweep that culled `femdom` and `voyeur`, and the same
-- reasoning applies: a glossary term has no entity assignments by nature, so
-- zero usage is not evidence it is junk. Its surviving body is Wikidata-derived
-- filler that cites its own source in the reader's face ("According to
-- Wikidata, impaired driving involves driving a vehicle while the driver is
-- under the influence of a drug that damages driving skill") and defines the
-- term with the term. It is replaced. Unlike the three new rows it stays
-- is_sensitive=false and is_adult=false, which is what it already carried.
--
-- It is revived UNPUBLISHED for the same reason as the three new rows, and the
-- seo_indexable=false is the load-bearing half: the deprecated row was
-- seo_indexable=true, so reviving it without touching that flag would have put
-- an unreviewed machine-written body straight in front of crawlers. It is
-- therefore exposed to the same zero-usage sweep that culled it the first time.
-- That is accepted rather than worked around: the alternative is stamping
-- human_reviewed=true on prose no human has read, and a term that gets swept
-- again can be revived again, whereas a false review flag is not recoverable
-- by inspection.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:raveitsafe-glossary-pass', true);

do $mig$
declare
  r      record;
  v_bad  int;
  v_made int := 0;
begin
  create temp table _new (
    slug text primary key, name text, cat text, kind text,
    adult boolean, sensitive boolean, descr text, longd text
  ) on commit drop;

  insert into _new (slug, name, cat, kind, adult, sensitive, descr, longd) values
    ('2c-i', '2C-I', 'substances-harm-reduction', 'concept', false, true,
     'A psychedelic phenethylamine of the 2C family, related to 2C-B but longer-acting.',
     '2C-I is one of the 2C series of psychedelic phenethylamines documented by Alexander Shulgin. It combines visual psychedelic effects with noticeable stimulation, comes on slowly, and runs considerably longer than 2C-B — long enough that people who dose by analogy with 2C-B routinely misjudge how much of their night it will take.

The serious risk is not the compound itself but what gets sold as it. 25I-NBOMe and related NBOMe compounds have repeatedly been sold as 2C-I, and they are active in micrograms where 2C-I is active in milligrams. A dose measured as though it were 2C-I is therefore an enormous dose of NBOMe, and that substitution has caused deaths. The two cannot be told apart by appearance, taste or price; reagent kits and laboratory drug checking can distinguish them.

It is active in the low milligram range, so the difference between a moderate and a heavy dose is a matter of a few milligrams and eyeballing it does not work. Insufflation is widely reported as intensely painful. It is a controlled substance in most jurisdictions.'),

    ('hawaiian-baby-woodrose', 'Hawaiian Baby Woodrose', 'substances-harm-reduction', 'concept', false, true,
     'The seeds of the Argyreia nervosa vine, which contain the psychedelic ergoline alkaloid LSA.',
     'Hawaiian Baby Woodrose is a climbing vine whose seeds contain ergine (LSA) and related ergoline alkaloids. LSA is structurally related to LSD but far less potent and much heavier in character: the experience is typically dreamy and sedating rather than bright, and people frequently describe being unable to stay upright through it.

Nausea and vomiting are not an occasional side effect here, they are the norm, and they arrive before the psychedelic effects do. The alkaloids also constrict blood vessels, which matters for anyone with a circulatory or heart condition, high blood pressure, or taking medication that does the same — that combination is the main physical risk the seeds carry.

The seeds are sold openly in many countries as ornamental garden stock, which makes them one of the clearest cases of legal status saying nothing about safety. Seed sold for planting is also routinely treated with fungicide or pesticide coatings that were never intended to be swallowed, and the packet does not have to say so.'),

    ('redosing', 'Redosing', 'substances-harm-reduction', 'concept', false, true,
     'Taking more of a substance while the first dose is still coming up or still active.',
     'Redosing is the single most common route to an accidental overdose, and it is almost always a timing error rather than a decision to take a lot. Onset is slow and variable — an oral dose can take two hours to reach full effect, an edible longer — so the interval in which someone concludes that nothing is happening is exactly the interval before it happens. The standard safer-use rule exists for this reason: wait for the full effect of what you have taken before deciding whether you want more.

A second dose stacks on the first rather than extending it, and the two peaks arrive together. Which substance it is decides how badly that goes. GHB and GBL have an unusually steep dose-response curve, and redosing before the first dose has landed is the main mechanism behind losing consciousness on them. With opioids and other depressants the peak that has not arrived yet is the one that stops breathing. With MDMA a redose reliably makes the comedown worse while adding comparatively little to the part anyone wanted.

If you are going to redose, decide the interval and the amount before you start rather than while affected, and treat a smaller second dose as the default. Judgement about whether more is a good idea is one of the first things most of these substances degrade.');

  ------------------------------------------------------------------ guards
  -- Every category must resolve. A typo would otherwise create an
  -- uncategorized row, which tag_hygiene_stats counts and nothing explains.
  select count(*) into v_bad from _new n
   where not exists (select 1 from public.tag_categories c where c.slug = n.cat);
  if v_bad > 0 then
    raise exception 'raveitsafe terms: % row(s) name a category that does not exist', v_bad;
  end if;

  -- A live or merged slug aborts: a live tag must never be silently overwritten
  -- by an import, and a merged one is a redirect this migration knows nothing
  -- about. None of these three exist in any status as of authoring; this guard
  -- is what makes that a checked fact rather than an assumption that decays.
  select count(*) into v_bad from _new n
    join public.unified_tags t on t.slug = n.slug;
  if v_bad > 0 then
    raise exception 'raveitsafe terms: % slug(s) already exist — resolve by hand', v_bad;
  end if;

  ------------------------------------------------------------------ create
  for r in select * from _new order by slug loop
    insert into public.unified_tags (
      name, slug, description, long_description,
      category_id, category, entity_kind,
      is_adult, is_sensitive,
      status, seo_indexable, human_reviewed, verification_status
    )
    select r.name, r.slug, r.descr, r.longd,
           c.id, c.name, r.kind::tag_entity_kind,
           r.adult, r.sensitive,
           'active', false, false, 'unverified'
      from public.tag_categories c where c.slug = r.cat;
    v_made := v_made + 1;

    insert into public.tag_sources (tag_id, source_type, claim_summary, is_public)
    select t.id, 'editorial:general-knowledge',
           'Definition written from independently documented pharmacology and harm-reduction practice. The term list of raveitsafe.ch was used only to identify that this entry was missing; no wording is copied or translated from it.',
           false
      from public.unified_tags t where t.slug = r.slug;
  end loop;

  ------------------------------------------------- revive + correct: driving
  -- status, deprecated_at and deprecation_reason are cleared TOGETHER. An
  -- update that sets status='active' and leaves deprecated_at populated is what
  -- once stranded 297 tags in a state where the page rendered but search
  -- refused to index them.
  update public.unified_tags set
    status              = 'active',
    deprecated_at       = null,
    deprecation_reason  = null,
    description         = 'Operating a vehicle while affected by alcohol, an illegal drug, or prescribed medication.',
    long_description    = 'Impaired driving is the offence of being in control of a vehicle while a substance is degrading the ability to drive it. Alcohol and controlled drugs are the obvious cases; prescribed medication is the one people do not expect, and sedatives, strong painkillers and some antihistamines will support a charge in most places exactly as an illegal drug would.

Alcohol and other drugs are usually policed on different principles, which catches travellers out. Alcohol is typically judged against a blood-concentration threshold, so there is a legal amount. For controlled drugs many countries instead operate a zero-tolerance rule, where any detectable quantity is the offence and no argument about actual impairment is available. The two regimes can apply on the same road on the same night.

The practical trap is that detection outlasts effect. Cannabis in particular remains detectable long after any subjective effect has gone, and a roadside test does not measure how you feel. Feeling fine the next morning is not evidence of anything, and after a night involving anything at all the safe assumption is that driving is off the table for considerably longer than the high lasted.

Consequences reach past the fine. Licence withdrawal is common and often immediate, insurers routinely refuse cover for a crash that occurred under the influence, and a sanction collected abroad can follow a licence home. Rules and limits differ by country, so check the one you are actually in.',
    verification_status = 'unverified',
    human_reviewed      = false,
    seo_indexable       = false
  where slug = 'impaired-driving' and status = 'deprecated';

  if not found then
    raise exception 'raveitsafe terms: impaired-driving was not deprecated as expected — resolve by hand';
  end if;

  insert into public.tag_sources (tag_id, source_type, claim_summary, is_public)
  select t.id, 'editorial:general-knowledge',
         'Revived from the zero-usage sweep and rewritten. The previous body was Wikidata-derived filler that cited its own source to the reader and defined the term with the term. Replacement written from general knowledge of road-traffic law; deliberately jurisdiction-neutral, because limits and regimes differ by country.',
         false
    from public.unified_tags t where t.slug = 'impaired-driving';

  ------------------------------------------------------------------ assertions
  select count(*) into v_bad from _new n
   where not exists (select 1 from public.unified_tags t where t.slug = n.slug);
  if v_bad > 0 then
    raise exception 'raveitsafe terms: % row(s) were not created', v_bad;
  end if;

  -- Not one of the four may be publishable. This is the safety property, and
  -- it covers the revived row as well as the three new ones: it arrives
  -- carrying a machine-written body, and it was seo_indexable=true while
  -- deprecated, so leaving that flag alone would have published unreviewed
  -- prose to crawlers the moment the row went active again.
  select count(*) into v_bad
    from (select slug from _new union all select 'impaired-driving') n
    join public.unified_tags t on t.slug = n.slug
   where t.seo_indexable or coalesce(t.human_reviewed, false)
      or t.verification_status <> 'unverified';
  if v_bad > 0 then
    raise exception 'raveitsafe terms: % row(s) are publishable — they must land unreviewed and unindexed', v_bad;
  end if;

  -- A revived row that kept its tombstone is the failure mode named above.
  select count(*) into v_bad from public.unified_tags
   where slug = 'impaired-driving'
     and (status <> 'active' or deprecated_at is not null or deprecation_reason is not null);
  if v_bad > 0 then
    raise exception 'raveitsafe terms: impaired-driving revived into an inconsistent state';
  end if;

  -- The old body must be gone, not merely appended to.
  select count(*) into v_bad from public.unified_tags
   where slug = 'impaired-driving' and long_description ilike '%according to wikidata%';
  if v_bad > 0 then
    raise exception 'raveitsafe terms: impaired-driving still carries the Wikidata-derived body';
  end if;

  -- Every row this migration authored carries a provenance record.
  select count(*) into v_bad
    from (select slug from _new union all select 'impaired-driving') n
    join public.unified_tags t on t.slug = n.slug
   where not exists (select 1 from public.tag_sources s
                      where s.tag_id = t.id and s.source_type like 'editorial:%');
  if v_bad > 0 then
    raise exception 'raveitsafe terms: % row(s) have no provenance record', v_bad;
  end if;

  -- The CI zero-invariant, corpus-wide.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and seo_indexable
     and coalesce(nullif(btrim(description), ''), short_description) is null;
  if v_bad > 0 then
    raise exception 'raveitsafe terms: % indexable row(s) corpus-wide have no description', v_bad;
  end if;

  raise notice 'raveitsafe terms: % created, 1 revived', v_made;
end
$mig$;
