-- Chemsex / harm-reduction glossary pass, grounded in two authoritative sources.
--
-- SOURCES
--   [AAE]  Poulios, A. (2023) "Harm reduction in the context of chemsex: training manual".
--          AIDS Action Europe / Deutsche Aidshilfe, Berlin. Chapters 2-6.
--   [FA]   Stuart, D. & Labayen De Inza, I. (Sept 2018) "Chemsex First Aid action sheet".
--          Controlling Chemsex / London Friend.
--
-- Every write below is attested by one of those two documents. Nothing here is inferred
-- from an LLM's own knowledge of the topic, and nothing is revived merely because a
-- deprecated row with the right-sounding name exists: the 2026-06-05 orphan sweep left
-- ~30 "Chemsex + X" rows whose prose came from the 2026-04-27 bulk sweep, and prose is
-- not merit. The revival test applied here is "do the sources establish this as a term",
-- and the majority of that cohort fails it (see Part 5 header).
--
-- Actor is declared so log_unified_tag_change() permits edits to human_reviewed rows.
-- It is deliberately not a 'system:%' actor: this is an editorial pass with a citation.

-- No explicit BEGIN/COMMIT: db push wraps each migration in its own transaction, and an
-- explicit commit here would land the data while the history row rolls back with it.
-- SET LOCAL therefore binds to that wrapping transaction, which is what we want.
set local app.actor = 'editorial:chemsex-harm-reduction-source-pass-2026';

-- ---------------------------------------------------------------------------
-- Part 1. Factual corrections to live, human-reviewed pages.
-- ---------------------------------------------------------------------------

-- 1a. /tags/chemsex called GHB a stimulant. GHB is a CNS depressant [AAE 3.2], and the
--     distinction is the whole basis of chemsex first aid: a depressant emergency is a
--     breathing emergency (recovery position, count breaths, ambulance under 8/min [FA
--     p5]), a stimulant emergency is a heart/temperature emergency [FA p14]. Naming the
--     wrong class on the parent page mis-routes both.
update unified_tags set
  short_description = 'Sex on drugs — usually crystal meth or mephedrone as stimulants and GHB/GBL as a depressant — over sessions that can run for days.',
  description       = 'Sex on drugs — usually crystal meth or mephedrone as stimulants and GHB/GBL as a depressant — over sessions that can run for days. The stimulant/depressant split is not a technicality: too much G stops someone breathing, while too much meth or meph is a heart-rate and temperature emergency, and the two need opposite responses. The compounded risks are the substances, their interactions, and the way long sessions erode boundaries, consent and any sense of elapsed time.'
where slug = 'chemsex';

-- 1b. Mephedrone's page named redosing as the harm but not the cardiac risk. [FA p13]:
--     cathinones are "vasculo-toxic, pro-thrombotic, cause vasoconstriction, and are
--     associated with acute myocardial infarction". [AAE 3.3.3] flags meph + other
--     stimulants and meph + alcohol.
update unified_tags set
  description = 'A synthetic cathinone with stimulant and empathogenic effects, common in chemsex settings. Short duration encourages repeated redosing, which drives most of its harm. Cathinones also constrict blood vessels and promote clotting, and heart attacks do happen on them — chest pain or tightness lasting more than a few minutes is an emergency, not a panic attack to wait out.'
where slug = 'mephedrone';

-- 1c. The GHB page mentioned GBL as a precursor but not the potency gap, which is the
--     single most repeated dosing warning in both sources: "An amount of GBL that is
--     equal to a regular dose of liquid GHB may be lethal" [AAE 3.2.4]; "GBL is commonly
--     mistaken for GHB; GHB is a very different concentration" [FA p7].
update unified_tags set
  description = 'A liquid depressant used both in nightlife and in chemsex, along with its precursors GBL and BDO. The margin between the intended effect and unconsciousness is extremely small and is measured in millilitres. GBL is the stronger of the two and is not interchangeable with it: a volume of GBL matching an ordinary GHB dose can be fatal, so a dose is only meaningful once you know which of the two is in the bottle.'
where slug = 'ghb';

-- ---------------------------------------------------------------------------
-- Part 2. Wrong-sense aliases, deleted.
-- ---------------------------------------------------------------------------

-- 2a. /tags/withdrawal is drug withdrawal (Substances & Recovery), but five of its six
--     non-German aliases are the CONTRACT-LAW sense of the English word — revocation of
--     a declaration. Machine-translated from the wrong sense of "withdrawal" and never
--     re-read. 'Entzug' is correct and stays.
delete from tag_aliases a using unified_tags t
where a.canonical_tag_id = t.id and t.slug = 'withdrawal'
  and a.alias_slug in ('rectificacion','rectificacion-1','rectificar','revocation','widerruf')
  and a.alias_name in ('rectificacion','rectificación','rectificar','révocation','Widerruf');

-- 2b. "Goldener Schuss" is German for a deliberately fatal dose — suicide by overdose.
--     It is not a translation of "overdose", and it does not belong on the page that
--     exists to keep people alive through one.
delete from tag_aliases a using unified_tags t
where a.canonical_tag_id = t.id and t.slug = 'overdose'
  and lower(a.alias_name) = 'goldener schuss';

-- ---------------------------------------------------------------------------
-- Part 3. Street names the sources give, which the glossary did not carry.
-- ---------------------------------------------------------------------------
-- review_status is load-bearing: 'approved' is the auto-tagging and synonym-display
-- gate, so an ordinary English word goes in as 'auto' however true a street name it is.
-- Not added, deliberately:
--   * "Speed" for methamphetamine [AAE 3.1] — Amphetamine is its own active tag and in
--     most of Europe "speed" means that, not meth. A wrong auto-tag either way.
--   * "Drone" for mephedrone [AAE 3.3] — collides with the active tag /tags/drone.
--   * "Soap", "Easy Lay", "Georgia Home Boy" for G [AAE 3.2] — ambiguous or archaic.
insert into tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
select t.id, v.alias_name, v.alias_slug, v.alias_type, v.review_status
from (values
  -- GHB [AAE 3.2 street-name list]. "G" is how both documents refer to it throughout,
  -- and is exactly why it can never be an approved auto-tagging rule.
  ('ghb',             'G',             'g',             'synonym', 'auto'),
  ('ghb',             'Gina',          'gina',          'synonym', 'auto'),
  ('ghb',             'Geebs',         'geebs',         'synonym', 'approved'),
  ('ghb',             'Liquid G',      'liquid-g',      'synonym', 'approved'),
  ('ghb',             'Liquid X',      'liquid-x',      'synonym', 'approved'),
  -- Ketamine [AAE 3.4 street-name list].
  ('ketamine',        'K',             'k',             'synonym', 'auto'),
  ('ketamine',        'Kiddy Smack',   'kiddy-smack',   'synonym', 'approved'),
  ('ketamine',        'Techno Smack',  'techno-smack',  'synonym', 'approved'),
  -- Methamphetamine [AAE 3.1 street-name list]. All three are ordinary English words.
  ('methamphetamine', 'Tweak',         'tweak',         'synonym', 'auto'),
  ('methamphetamine', 'Crank',         'crank',         'synonym', 'auto'),
  ('methamphetamine', 'Glass',         'glass',         'synonym', 'auto'),
  -- Mephedrone [AAE 3.3 street-name list].
  ('mephedrone',      'Meph',          'meph',          'synonym', 'approved'),
  ('mephedrone',      'Mew-Mew',       'mew-mew',       'synonym', 'approved'),
  ('mephedrone',      'Bubbles',       'bubbles',       'synonym', 'auto')
) as v(tag_slug, alias_name, alias_slug, alias_type, review_status)
join unified_tags t on t.slug = v.tag_slug and t.status = 'active'
where not exists (select 1 from tag_aliases x where x.alias_slug = v.alias_slug);

-- "Slamming" is the community term for injecting chems and is used as such throughout
-- both sources. It sat at 'auto', and since the 2026-08-29 synonym fix display is
-- approved-only, so the most recognisable word on the page was invisible on it.
update tag_aliases a set review_status = 'approved'
from unified_tags t
where a.canonical_tag_id = t.id and t.slug = 'safer-injecting'
  and a.alias_slug in ('slam','slamming') and a.review_status = 'auto';

-- ---------------------------------------------------------------------------
-- Part 4. Party & Play and Chemsex are one concept, filed as two tags.
-- ---------------------------------------------------------------------------
-- Both sources treat them as the same thing — "Chemsex... commonly known as party and
-- play or PnP" [AAE 2.1] — and /tags/party-and-play's own description already said
-- "Also called chemsex or PnP." The split put 13 usages under Kink Community & Scenes
-- and 20 under Substances & Recovery, and the two rows disagreed on is_sensitive, so
-- the identical concept was content-gated on one page and not the other.
-- Reversible via unmerge_tag_concept(audit_id).
do $$
declare
  v_canonical uuid;
  v_dup       uuid;
begin
  select id into v_canonical from unified_tags where slug = 'chemsex' and status = 'active';
  select id into v_dup       from unified_tags where slug = 'party-and-play' and status = 'active';

  if v_canonical is not null and v_dup is not null then
    perform merge_tag_concept(
      v_canonical, v_dup,
      'editorial:chemsex-harm-reduction-source-pass-2026',
      'AAE chemsex manual 2023 s2.1; Chemsex First Aid 2018'
    );

    -- Known post-merge defects, repaired rather than assumed away:
    -- (a) the merge can leave the loser's category assignment as a second is_primary row;
    update tag_category_assignments set is_primary = false
    where tag_id = v_canonical and is_primary
      and category_id <> (select category_id from unified_tags where id = v_canonical);
    -- (b) the loser's aliases are not re-parented onto the winner.
    update tag_aliases set canonical_tag_id = v_canonical
    where canonical_tag_id = v_dup;
  end if;
end $$;

-- merge_tag_concept() sets app.actor to 'merge:…' for the rest of the transaction.
-- Restore ours so the remaining audit rows read as the editorial pass they are.
set local app.actor = 'editorial:chemsex-harm-reduction-source-pass-2026';

-- "Party & Play" itself is added as an approved synonym by merge_tag_concept(), so only
-- the two it cannot know about are added here. Neither is an ordinary English word, so
-- both are safe as approved auto-tagging rules. "Chems" names the substances rather than
-- the practice, hence 'covers' rather than 'synonym'.
insert into tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
select t.id, v.alias_name, v.alias_slug, v.alias_type, 'approved'
from (values
  ('PnP',   'pnp',   'abbreviation'),
  ('Chems', 'chems', 'covers')
) as v(alias_name, alias_slug, alias_type)
join unified_tags t on t.slug = 'chemsex' and t.status = 'active'
where not exists (select 1 from tag_aliases x where x.alias_slug = v.alias_slug);

-- ---------------------------------------------------------------------------
-- Part 5. Revivals — only where the sources establish the term.
-- ---------------------------------------------------------------------------
-- The 2026-06-05 orphan sweep deprecated ~30 rows in this area on a zero-usage test.
-- Four of them name a real term in the sources and come back with prose written from
-- those sources. The rest are LLM topic-phrases the documents never use as terms
-- ("Chemsex And Community Well-Being", "Safer Use And Overdose Prevention Training",
-- "Cultural Competence In Chemsex Care", "Comedown Care", "Polydrug Dangers", …) and
-- stay deprecated: reviving them would shard /tags/chemsex across a dozen near-synonyms.
--
-- "Serosorting" is NOT revived even though [AAE 4.1.1] names it: the live tag
-- /tags/seroadaptation already carries "Serosorting" as an approved alias and its prose
-- covers it. Reviving the row would put a tag and an alias behind the same word.
with revived as (
  select v.slug, v.new_name, v.new_slug, v.category_name, v.descr, v.short_descr
  from (values
    (
      'cathinones-3-mmc-4-mec-etc', 'Cathinones', 'cathinones', 'Substances & Recovery',
      'The stimulant family that mephedrone, 3-MMC, 4-CMC and their successors belong to — sold as a rolling series of near-identical powders as each one is banned. They constrict blood vessels, promote clotting and are associated with heart attacks, and a short high pushes people to redose repeatedly through a session.',
      'The stimulant family mephedrone, 3-MMC and 4-CMC belong to, sold as a rolling series of near-identical powders.'
    ),
    (
      'k-hole', 'K-Hole', 'k-hole', 'Substances & Recovery',
      'The dissociative collapse at a high ketamine dose: detached from your body, unable to move or speak, sometimes convinced you are dying. It usually passes on its own leaving only disorientation, but someone in one cannot consent to anything and cannot get themselves out of harm''s way. Past about ninety minutes, or with any breathing difficulty, call an ambulance.',
      'The dissociative collapse at a high ketamine dose — immobile, detached, unable to consent.'
    ),
    (
      'drug-induced-psychosis', 'Drug-Induced Psychosis', 'drug-induced-psychosis', 'Substances & Recovery',
      'Paranoia and hallucination brought on by stimulants and missed sleep — commonly meth or cathinones after a night or more awake. It runs to a recognisable script: hidden cameras, listening at the door, insects under the skin, being deliberately infected, voices. It is far more likely where someone already feels judged or unsafe, so the useful response is lowering the stimulation — lights, music, porn off, a quieter room, real choices — not arguing with what they are seeing.',
      'Paranoia and hallucination brought on by stimulants and missed sleep, most often meth or cathinones.'
    ),
    (
      'chillout-room', 'Chillout Room', 'chillout-room', 'Venue Features & Policies',
      'A quiet room kept aside at a party or sauna where nothing is expected of you — no sex, no dosing, lower light and sound. Named in harm-reduction guidance as something a host sets up in advance, along with water and snacks in plain sight, because the moment someone needs one is the moment nobody is in a state to improvise it.',
      'A quiet room kept aside at a party where nothing is expected of you — no sex, no dosing.'
    )
  ) as v(slug, new_name, new_slug, category_name, descr, short_descr)
)
update unified_tags t set
  status             = 'active',
  deprecated_at      = null,
  deprecation_reason = null,
  name               = r.new_name,
  slug               = r.new_slug,
  category           = r.category_name,
  category_id        = c.id,
  short_description  = r.short_descr,
  description        = r.descr,
  is_sensitive       = true,
  sensitive_topics   = array['substance use','harm reduction'],
  human_reviewed     = true,
  seo_indexable      = true,
  verification_status= 'reviewed',
  last_verified_at   = now()
from revived r
join tag_categories c on c.name = r.category_name
where t.slug = r.slug and t.status = 'deprecated';

-- ---------------------------------------------------------------------------
-- Part 6. New tags — attested in the sources, absent from the glossary.
-- ---------------------------------------------------------------------------
-- INSERT must set category, category_id AND the junction row by hand: the category sync
-- triggers on unified_tags are UPDATE-only, so an INSERT propagates nothing. Skipping
-- any one of the three leaves the page filed and the search facet blank, or vice versa.
with fresh as (
  select * from (values
    (
      'GBL', 'gbl', 'Substances & Recovery',
      'The industrial solvent that the body converts into GHB, and the form most G is actually sold in. It is stronger than GHB and not interchangeable with it: a volume of GBL matching an ordinary GHB dose can be fatal, and neither bottle tells you which one you have. It is also caustic, so it is never drunk neat.',
      'The solvent the body converts into GHB, and the form most G is sold in — stronger, and not interchangeable.',
      true
    ),
    (
      'G-Hole', 'g-hole', 'Substances & Recovery',
      'Unconsciousness from too much G, anywhere from minutes to hours, often preceded by confusion, slurring and twitching. Breathing can stop at any point in one and most G deaths happen there, so the rule is to wake them and keep them awake; if they cannot be woken, recovery position and an ambulance. Never use a stimulant to bring someone round — it adds to the toxicity causing the problem. Nobody in a G-hole can consent to anything.',
      'Unconsciousness from too much G. Breathing can stop at any point, and most G deaths happen here.',
      true
    ),
    (
      'Comedown', 'comedown', 'Substances & Recovery',
      'The days after, when the brain has spent what it spent. Meth and cathinones leave anxiety, flat mood, exhaustion and an inability to feel pleasure; ketamine leaves low mood, patchy memory and flashbacks. It is the stretch where people redose to make it stop, and where sleep, food and not being alone do more than anything else available.',
      'The days after a session — flat mood, exhaustion, and an inability to feel pleasure.',
      true
    ),
    (
      'Booty Bumping', 'booty-bumping', 'Substances & Recovery',
      'Taking a drug rectally, dissolved and squirted in with a syringe barrel or a lubed finger. It comes on faster and harder than swallowing because the rectum absorbs quickly, which is exactly why doses that feel modest can overshoot — and it is one of the two routes meth and mephedrone overdoses actually happen by.',
      'Taking a drug rectally — faster and harder than swallowing, and easier to overshoot.',
      true
    ),
    (
      'Priapism', 'priapism', 'Sexual Health',
      'An erection that will not go down, painful and unstimulated, most often from erection drugs stacked with chems across a long session. Past two hours it is a hospital matter, because trapped blood starves the tissue and the damage is permanent. Do not ice it, do not try to come, do not drink — a warm shower, water, a walk, and a clock.',
      'An erection that will not go down. Past two hours it is a hospital matter, not something to wait out.',
      false
    ),
    (
      'Spiking', 'spiking', 'Consent & Negotiation',
      'Putting a drug into someone''s drink, or into shared lube, without them knowing — most often G, because it is colourless and dosed in millilitres. Harm-reduction guidance treats it as an assault in progress rather than a risk to manage, which is why the practical countermeasures are so mundane: your own cup, marked; your own lube; your own bottle.',
      'Putting a drug into someone''s drink or lube without them knowing — most often G.',
      true
    ),
    (
      'Cocaethylene', 'cocaethylene', 'Substances & Recovery',
      'A third drug your liver makes when cocaine and alcohol are in you at once, longer-lasting than either and harder on the heart and liver. It is the reason the pairing is more dangerous than the sum of its parts, and the reason "just a few drinks" is not a neutral addition to a line.',
      'A third drug the liver makes from cocaine plus alcohol, harder on the heart than either alone.',
      true
    ),
    (
      'Crystal Dick', 'crystal-dick', 'Slang & Language',
      'The erection that will not arrive on meth, however much you want sex — the drug drives desire up and blood flow down at the same time. It is the usual reason erection drugs get stacked on top of chems, which is also how long sessions end in priapism.',
      'The erection that will not arrive on meth — desire up, blood flow down.',
      false
    ),
    (
      'Ketamine Bladder', 'ketamine-bladder', 'Substances & Recovery',
      'What heavy, repeated ketamine use does to the urinary tract: urgency, pain on peeing, blood in the urine, and eventually a bladder that has physically shrunk. Sharp unexplained cramps in the gut belong to the same picture. Most of it eases if use stops; some of it has needed surgery.',
      'What heavy ketamine use does to the urinary tract — urgency, pain, blood, a shrinking bladder.',
      true
    )
  ) as v(name, slug, category_name, descr, short_descr, sensitive)
),
inserted as (
  insert into unified_tags (
    name, slug, category, category_id, description, short_description,
    status, is_sensitive, sensitive_topics, is_adult, human_reviewed,
    seo_indexable, verification_status, last_verified_at, usage_count
  )
  select f.name, f.slug, f.category_name, c.id, f.descr, f.short_descr,
         'active', f.sensitive,
         case when f.sensitive then array['substance use','harm reduction'] else null end,
         false, true, true, 'reviewed', now(), 0
  from fresh f
  join tag_categories c on c.name = f.category_name
  where not exists (select 1 from unified_tags t where t.slug = f.slug)
  returning id, category_id
)
insert into tag_category_assignments (tag_id, category_id, is_primary)
select id, category_id, true from inserted
on conflict (tag_id, category_id) do nothing;

-- Revived rows may equally have had no junction row, or one pointing at a stale parent.
insert into tag_category_assignments (tag_id, category_id, is_primary)
select t.id, t.category_id, true
from unified_tags t
where t.slug in ('cathinones','k-hole','drug-induced-psychosis','chillout-room')
  and t.status = 'active' and t.category_id is not null
on conflict (tag_id, category_id) do update set is_primary = true;

update tag_category_assignments a set is_primary = false
from unified_tags t
where a.tag_id = t.id
  and t.slug in ('cathinones','k-hole','drug-induced-psychosis','chillout-room')
  and a.category_id <> t.category_id and a.is_primary;

-- Aliases for the new rows, from the sources' own vocabulary.
insert into tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
select t.id, v.alias_name, v.alias_slug, v.alias_type, v.review_status
from (values
  ('gbl',              'Gamma-butyrolactone',  'gamma-butyrolactone',  'synonym',      'approved'),
  -- No "G Hole" spelling variant: it normalises to the tag's own slug, which is the
  -- self-alias shape tag_hygiene_stats().alias_equals_name exists to keep at zero.
  ('g-hole',           'G-Sleep',              'g-sleep',              'synonym',      'approved'),
  ('booty-bumping',    'Booty Bump',           'booty-bump',           'synonym',      'approved'),
  ('booty-bumping',    'Boofing',              'boofing',              'synonym',      'approved'),
  ('cathinones',       'Synthetic Cathinones', 'synthetic-cathinones', 'synonym',      'approved'),
  ('ketamine-bladder', 'K-Cramps',             'k-cramps',             'covers',       'approved'),
  ('ketamine-bladder', 'Ketamine Cystitis',    'ketamine-cystitis',    'synonym',      'approved'),
  ('drug-induced-psychosis','Stimulant Psychosis','stimulant-psychosis','synonym',     'approved')
) as v(tag_slug, alias_name, alias_slug, alias_type, review_status)
join unified_tags t on t.slug = v.tag_slug and t.status = 'active'
where not exists (select 1 from tag_aliases x where x.alias_slug = v.alias_slug);

-- ---------------------------------------------------------------------------
-- Part 7. Ontology edges.
-- ---------------------------------------------------------------------------
-- Only 'broader' and 'related' are used: tag_relations carries two overlapping CHECKs
-- and those two values are the whole of their intersection.
insert into tag_relations (source_tag_id, target_tag_id, relation_type, review_status, confidence)
select s.id, tg.id, v.relation_type, 'approved', 1.0
from (values
  ('gbl',                   'ghb',              'broader'),
  ('mephedrone',            'cathinones',       'broader'),
  ('methcathinone',         'cathinones',       'broader'),
  ('g-hole',                'ghb',              'broader'),
  ('k-hole',                'ketamine',         'broader'),
  ('ketamine-bladder',      'ketamine',         'broader'),
  ('crystal-dick',          'methamphetamine',  'broader'),
  ('cocaethylene',          'cocaine',          'broader'),
  ('booty-bumping',         'safer-use',        'broader'),
  ('comedown',              'withdrawal',       'related'),
  ('g-hole',                'recovery-position','related'),
  ('g-hole',                'consent',          'related'),
  ('k-hole',                'consent',          'related'),
  ('spiking',               'consent',          'related'),
  ('spiking',               'ghb',              'related'),
  ('drug-induced-psychosis','methamphetamine',  'related'),
  ('drug-induced-psychosis','cathinones',       'related'),
  ('priapism',              'crystal-dick',     'related'),
  ('priapism',              'erectile-dysfunction','related'),
  ('chillout-room',         'chemsex',          'related'),
  ('cathinones',            'chemsex',          'related'),
  ('gbl',                   'chemsex',          'related'),
  ('comedown',              'chemsex',          'related'),
  ('booty-bumping',         'chemsex',          'related'),
  ('crystal-dick',          'chemsex',          'related')
) as v(source_slug, target_slug, relation_type)
join unified_tags s  on s.slug  = v.source_slug and s.status = 'active'
join unified_tags tg on tg.slug = v.target_slug and tg.status = 'active'
on conflict (source_tag_id, target_tag_id, relation_type) do nothing;

-- ---------------------------------------------------------------------------
-- Part 8. Assertions.
-- ---------------------------------------------------------------------------
-- These check the OUTCOME, not that the statements ran. Counts are deliberately
-- lower bounds (>=), not equalities: several sibling sessions are editing this same
-- table, and an equality here would turn someone else's unrelated write into a red
-- deploy. What must hold exactly is the safety property, asserted at zero.
do $$
declare v_n int;
begin
  -- Every row this pass publishes is sensitive, and the SEO gate deindexes a sensitive
  -- row that is not human_reviewed. If a later edit drops human_reviewed from any of
  -- them, the whole cohort silently leaves the index — the failure mode that has to be
  -- caught here rather than noticed in Search Console months later.
  select count(*) into v_n from unified_tags
   where slug in ('gbl','g-hole','comedown','booty-bumping','spiking','cocaethylene',
                  'ketamine-bladder','cathinones','k-hole','drug-induced-psychosis')
     and status = 'active' and is_sensitive and not (human_reviewed and seo_indexable);
  if v_n > 0 then
    raise exception 'chemsex pass: % sensitive rows published un-reviewed and so deindexed', v_n;
  end if;

  -- The three-layer filing rule. A row with a category_id and no primary junction row
  -- renders its page uncategorised while the search facet reads fine, and nothing
  -- reconciles the two on INSERT.
  select count(*) into v_n from unified_tags t
   where t.slug in ('gbl','g-hole','comedown','booty-bumping','priapism','spiking',
                    'cocaethylene','crystal-dick','ketamine-bladder',
                    'cathinones','k-hole','drug-induced-psychosis','chillout-room')
     and t.status = 'active'
     and not exists (select 1 from tag_category_assignments a
                      where a.tag_id = t.id and a.category_id = t.category_id and a.is_primary);
  if v_n > 0 then
    raise exception 'chemsex pass: % rows have no primary junction row for their category_id', v_n;
  end if;

  -- No tag may end this migration with two primaries, which is what merge_tag_concept
  -- leaves behind when the two sides were filed differently — and they were here.
  select count(*) into v_n from (
    select a.tag_id from tag_category_assignments a
     where a.is_primary group by a.tag_id having count(*) > 1) x;
  if v_n > 0 then
    raise exception 'chemsex pass: % tags left with more than one primary category', v_n;
  end if;

  -- An alias whose slug is its own tag's slug is the self-alias shape the hygiene
  -- sentinel keeps at zero; an alias shadowing a DIFFERENT live tag is rejected by
  -- trigger, so only the self case can get this far.
  select count(*) into v_n from tag_aliases a
    join unified_tags t on t.id = a.canonical_tag_id
   where a.alias_slug = t.slug;
  if v_n > 0 then
    raise exception 'chemsex pass: % self-aliases', v_n;
  end if;

  -- Party & Play must have landed as a redirect, not as a second live page.
  if exists (select 1 from unified_tags where slug = 'party-and-play' and status = 'active') then
    raise exception 'chemsex pass: party-and-play is still a live tag';
  end if;

  select count(*) into v_n from unified_tags
   where status = 'active'
     and slug in ('gbl','g-hole','comedown','booty-bumping','priapism','spiking',
                  'cocaethylene','crystal-dick','ketamine-bladder',
                  'cathinones','k-hole','drug-induced-psychosis','chillout-room');
  if v_n < 13 then
    raise exception 'chemsex pass: only % of 13 expected tags are active', v_n;
  end if;
end $$;


