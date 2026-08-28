-- Harm-reduction practice vocabulary: revive what was pruned, add the
-- drug-emergency terms the glossary never had.
--
-- WHY THIS EXISTS
--
-- `Substances & Harm Reduction` holds 89 active tags, 80 of them substances
-- from the saferparty import (20260907100000). The harm-reduction *practice*
-- half of the category is entirely `status='deprecated'` — drug checking,
-- set and setting, trip sitting, naloxone, serotonin syndrome, polydrug use,
-- and safer use itself. So is `harm-reduction`, the concept the category is
-- named after.
--
-- None of them were retired on merit. Their deprecation_reason is
-- `auto: zero usage` or "orphan tag (no entity assignments, relations,
-- synonyms, or aliases)" — `deprecate_unused_tags()` prunes any active tag that
-- no venue or event links to. That is a reasonable test for a facet and the
-- wrong test for a glossary entry: `fetchTagWithCategories` selects
-- `status='active'`, so every one of these is a dead /tags/:slug page, and a
-- definition is useful whether or not a bar in Berlin is tagged with it.
--
-- `human_reviewed = true` IS WHAT KEEPS THEM ALIVE
--
-- The nightly pruner skips human_reviewed rows. Without the flag every tag here
-- is deprecated again on the next run — which is exactly how the previous
-- generation of these tags died. It is load-bearing a second time:
-- `enforce_tag_seo_sensitivity_gate()` forces seo_indexable = false when
-- (is_sensitive OR is_adult) AND NOT human_reviewed, so on a deliberately
-- sensitive row the flag is the only thing keeping the page in sitemap-tags.xml.
--
-- THREE MORE WRONG-ENTITY QIDs, FOUND THE SAME WAY AS pcp
--
-- Every wikidata_id on the revived rows was read back from the API before being
-- trusted. Three did not survive:
--
--   safer-use     Q113895968 = "Safer Use of Medication in Pediatric Patients
--                 at Home", a CLINICAL TRIAL.
--   polydrug-use  Q44944570 = "Polydrug use in adolescent drinkers with and
--                 without DSM-IV alcohol abuse and dependence", a PAPER.
--   naloxone-narcan Q67338805 = a scientific article published 1975.
--
-- The pattern is a resolver that matched a phrase to the title of a paper about
-- the phrase. `polydrug use` has NO concept item on Wikidata at all — the first
-- five hits are all journal articles — so it is set to NULL rather than to a
-- better-looking article. An empty identifier is a smaller error than a
-- confident wrong one, and this file writes NULL wherever the concept genuinely
-- has no item (safer use, trip killer, reagent testing, allergy self-test,
-- drug emergency, psychedelic integration).
--
-- The verified ones are spelled out because the near-misses are close: "bad
-- trip" returns two films and a video game before Q622106; "recovery position"
-- returns a Holby City episode second; "syncope" is also a genus of frogs.
-- This is the hate-crimes -> TV-episode trap, and it is one search-result row
-- away every time.
--
-- WHY panic-attack IS NOT FILED HERE
--
-- Everything else in this file goes under substances-harm-reduction. A panic
-- attack is a mental-health concept that exists independently of drugs; the
-- handbook covers it only because it happens at parties. Filing it as a
-- substance term would repeat the mistake 20261002100000 caught with
-- `tolerance`, whose page is about accepting people's differences. It goes
-- under mental-health and is linked to drug-emergency by a relation instead.
--
-- The category rule is therefore also the sensitivity rule, and it is asserted:
-- a row filed under substances-harm-reduction is is_sensitive (it renders
-- TagSafetyCallout and the /help link, which is the point on a page someone
-- reaches mid-crisis); panic-attack is not.
--
-- EMERGENCY STEPS ARE IN SCOPE; DOSING IS NOT
--
-- 20260907100000 set the boundary for this category: no dosage figures, no
-- route-of-administration instructions, no combination advice. That rule is
-- about how to take a drug. How to help someone who has collapsed is the
-- opposite kind of information — it is public first-aid knowledge, it is the
-- single most useful thing a page like this can carry, and it is why the
-- emergency chapters are the highest-value part of the source. Both boundaries
-- hold at once here.
--
-- NO COUNTRY-SPECIFIC EMERGENCY NUMBER IS PUBLISHED
--
-- The source handbook prints the Swiss ambulance number as 114 in its
-- first-responder chapter and 144 (the correct one) in its seizure chapter. A
-- reader on this platform is by definition often abroad, so no number from it is
-- reproduced: the prose says to call local emergency services and names only
-- 112 and 911, which are stable and near-universal.
--
-- THE PROSE IS OURS
--
-- The handbook (eve&rave, "Das Substanzhandbuch" v1.1) is CC BY-NC-SA 4.0 and
-- this is a commercial platform, so the NC term rules out reuse and SA would
-- push its licence onto our text. Not one sentence is copied; it is factual
-- grounding and an attributed tag_sources row. Same discipline as saferparty.
--
-- MECHANICS (all from the 20260907100000 header, each rule earned)
--   * one row per statement in a loop — a set-based UPDATE trips SQLSTATE 27000
--     via sync_tag_category_assignment -> unified_tags_recompute_is_adult;
--   * never set unified_tags.category_id in bulk; write tag_category_assignments;
--   * merges BEFORE aliases (tag_alias_reject_shadow blocks an alias shadowing a
--     live tag), and merge_tag_concept overwrites app.actor, so re-set it after;
--   * is_adult is trigger-derived from the Sexuality & Kink subtree. Never set
--     it. A harm-reduction page behind an age wall helps nobody.

set local statement_timeout = '600s';

do $mig$
declare
  v_cat_id      uuid;
  v_mental_id   uuid;
  v_tag_id      uuid;
  v_canon_id    uuid;
  v_dup_id      uuid;
  v_parent_id   uuid;
  v_n           int;
  r             record;
begin
  perform set_config('app.actor', 'admin:substanzhandbuch-harm-reduction', true);

  select id into strict v_cat_id
    from public.tag_categories where slug = 'substances-harm-reduction';
  select id into strict v_mental_id
    from public.tag_categories where slug = 'mental-health';

  ---------------------------------------------------------------------------
  -- 1. The vocabulary. `cat` is a tag_categories slug. `qid` is written
  --    verbatim including NULL — see the header on why NULL is deliberate.
  ---------------------------------------------------------------------------
  create temp table _hr (
    slug      text primary key,
    name      text not null,
    cat       text not null,
    qid       text,
    wiki      text,
    descr     text not null,
    longdescr text
  ) on commit drop;

  insert into _hr (slug, name, cat, qid, wiki, descr, longdescr) values

  -- ── the concept the category is named after ────────────────────────────
  ('harm-reduction', 'Harm Reduction', 'substances-harm-reduction',
   'Q1458711', 'https://en.wikipedia.org/wiki/Harm_reduction',
   'A public-health approach that works with what people are actually doing rather than what they should be doing. It does not require anyone to stop using in order to deserve help staying alive and well.',
   'Harm reduction starts from a plain observation: people use drugs, have sex, and take risks, and they will keep doing so whether or not that is approved of. Given that, the useful question is not how to make them stop but how to make what they are already doing less likely to kill or injure them.

In practice it is a set of unglamorous, well-evidenced things. Clean injecting equipment prevents HIV and hepatitis C. Naloxone reverses opioid overdoses. Drug checking tells someone what is actually in their pill. Supervised consumption rooms mean an overdose happens in front of someone who can respond. None of these require abstinence as a precondition, and that is the design, not a compromise.

The approach matters particularly in queer communities, where substance use is often bound up with the same social spaces that provide safety and belonging, and where a long history of being pathologised makes people reluctant to raise it with a doctor. A service that demands you stop first is a service most people simply do not use.

It is not the opposite of treatment or recovery. Many people arrive at those through harm reduction, because staying alive and staying in contact with services is what makes them possible.'),

  ('safer-use', 'Safer Use', 'substances-harm-reduction',
   null, null,
   'The practical side of harm reduction: the habits and precautions that make a given episode of drug use less risky. Nothing makes drug use safe — the word is deliberately "safer", not "safe".',
   'Safer use is less a checklist than a stance: taking the substance seriously enough to find out what it is, what it does, what it interacts with, and what would happen if something went wrong.

The recurring elements are consistent across substances. Know what you actually have, ideally through drug checking. Consider the setting and your own state of mind before rather than after. Do not mix without understanding the specific combination. Do not use alone, or make sure someone knows what you took and when. Leave the following day free rather than assuming you will be fine. Eat, drink water, and stay aware of temperature.

The phrasing is exact and worth keeping exact. Risk can be reduced, sometimes dramatically, but not removed, and any framing that promises otherwise is doing the reader a disservice.'),

  -- ── knowing what you have ───────────────────────────────────────────────
  ('drug-checking', 'Drug Checking', 'substances-harm-reduction',
   'Q3519101', 'https://en.wikipedia.org/wiki/Drug_checking',
   'A service that analyses a sample in a laboratory and tells the person what is in it and how strong it is. Usually free, usually anonymous, and the only method that answers both questions properly.',
   'Drug checking means handing a small sample to a laboratory and getting back what it actually contains and in what concentration. Mobile services at festivals and clubs typically return a result within half an hour; fixed-site services take longer but analyse more thoroughly.

Two things make it valuable beyond the individual result. The first is that the illicit market is not consistent: the same-looking pill varies enormously between batches, substances are sold as other substances, and contamination with far stronger compounds is a leading cause of fatal overdose. Nothing about a sample''s appearance reveals any of that. The second is that services aggregate what they find and publish warnings, so one person''s test can protect people who never used the service.

Most services attach a short conversation to the result, which is often the only contact someone has with a drug service that is not framed around stopping.

Availability is uneven and legal status varies by country — worth checking before travelling rather than assuming.'),

  ('reagent-testing', 'Reagent Testing', 'substances-harm-reduction',
   null, null,
   'A colour-change spot test using chemical reagents, done by hand when no laboratory is available. It can indicate what a substance probably is; it cannot tell you how much of it there is.',
   'Reagent testing works by putting a tiny amount of a sample onto a reagent and reading the colour it turns. It is cheap, quick, and the realistic fallback where drug checking does not exist.

Its limits are the important part. It indicates presence, not purity or strength — which means it cannot detect the thing that most often causes harm, an unexpectedly potent dose. It struggles when two substances are present, because one reaction can mask another. Adulterants and closely related analogues can produce misleading colours, and reading a colour is subjective and affected by lighting. For those reasons several different reagents are normally used together rather than one, and a result is treated as a strong hint rather than an answer.

The reagents themselves are corrosive. Eye protection is not optional — contact can cause permanent damage — and reagents should never be mixed unless they are sold as a paired test.

Newer kits claim to estimate potency rather than only identity. They are a genuine step forward and are still marketed with more confidence than the underlying chemistry supports.'),

  -- ── the frame around an experience ──────────────────────────────────────
  ('set-and-setting', 'Set And Setting', 'substances-harm-reduction',
   'Q1752960', 'https://en.wikipedia.org/wiki/Set_and_setting',
   'The idea that a drug experience is shaped as much by the person''s state of mind (set) and their surroundings (setting) as by the substance itself. Coined for psychedelics, but it applies to everything.',
   'Set and setting is the observation that the same substance, at the same amount, produces very different experiences depending on who is taking it and where.

Set is everything the person brings: mood, expectations, fears, physical condition, what happened that week, whether they feel safe. Setting is everything around them: the place, who else is there, noise, temperature, whether they can leave, and whether anything unpredictable is likely to happen.

It matters most with psychedelics, which tend to amplify whatever is already present rather than introduce something new — anxiety carried into an experience usually comes back larger. But it generalises. Stimulants in a hostile environment and depressants among people you do not trust are both worse than the same substances elsewhere.

The practical consequence is that preparation is not fussiness. Choosing the place, the people and the timing deliberately is one of the few variables genuinely under anyone''s control, and it is free.'),

  ('trip-sitter', 'Trip Sitter', 'substances-harm-reduction',
   'Q1720485', 'https://en.wikipedia.org/wiki/Trip_sitter',
   'Someone who stays sober to look after a person taking a psychedelic or dissociative — and who intervenes if a physical problem develops. The role is presence and reassurance, not treatment.',
   'A trip sitter stays sober and stays present. Most of the job is unremarkable: being calm, being there, and not making anything worse.

What generally helps is introducing yourself plainly, asking what was taken and roughly when, and returning to a few steady reassurances — that the state is caused by a substance, that it will pass, and roughly how long is left. People lose their sense of time badly, so saying the time out loud is more useful than it sounds. Grounding questions can reorient someone, but they can also increase fear in an already anxious state, so they need judgement rather than repetition.

Two boundaries are absolute. Ask before any physical contact, and never anything sexual — a person in this state cannot meaningfully consent, and this is the setting in which that is most often ignored. And a sitter does not give out medication of any kind; if there is a physical problem or the situation is beyond reassurance, that is a call to emergency services.

If someone becomes aggressive, your own safety comes first: create distance, and talk from there.'),

  ('bad-trip', 'Bad Trip', 'substances-harm-reduction',
   'Q622106', 'https://en.wikipedia.org/wiki/Bad_trip',
   'An overwhelming, frightening psychedelic experience — often a conviction of dying, losing your mind, or being stuck this way forever. Distressing rather than physically dangerous in itself, and it ends.',
   'A bad trip is a psychedelic experience dominated by fear and loss of control. People frequently describe being certain they are dying, that they have permanently broken something, or that the state will never end. None of those are usually true, and being told so calmly by someone sober is genuinely useful.

Most of what helps is preparation. Knowing what the substance is and how long it lasts, choosing a familiar place, having someone trusted present, clearing the following day, and arranging somewhere quiet to retreat to all reduce the odds. Current medication matters too — several antidepressants and antipsychotics substantially blunt or block psychedelics, and taking more to compensate is how people end up in trouble later.

During the experience, changing something in the environment is often more effective than enduring it: different room, outside, familiar music, dimmer light. Slow deliberate breathing gives the mind something to hold. So does remembering, out loud if necessary, that this is a drug and it is wearing off.

Some people find a difficult experience meaningful afterwards, particularly if they work through it — writing it down, talking about it, giving it time. Others simply find it frightening. If it stays unresolved or keeps intruding weeks later, that is worth taking to a professional.'),

  ('trip-killer', 'Trip Killer', 'substances-harm-reduction',
   null, null,
   'Taking a sedative to cut short an overwhelming psychedelic experience. It is widely misunderstood: it removes the fear, it does not end the trip.',
   'A "trip killer" is usually a benzodiazepine taken to bring a frightening psychedelic experience under control. The name oversells it. What these drugs reliably do is reduce anxiety; the perceptual effects generally continue, so the experience carries on while mattering less.

That distinction has practical consequences. Someone expecting the trip to stop may take more when it does not, which stacks a sedative on top of a psychedelic and adds a second problem. Benzodiazepines also disinhibit and impair memory, and they carry their own dependence risk.

Antipsychotics are sometimes used instead. They dampen the experience more but do less for the fear, and they have side effects of their own.

Two hard rules follow. Nobody should be given medication by a friend, a sitter or a stranger — that is a decision for medical staff who know what else is in the person''s system. And if someone''s physical or mental safety is genuinely at stake, the answer is emergency services, not the contents of someone''s bag.'),

  -- ── when something goes wrong ───────────────────────────────────────────
  ('drug-emergency', 'Drug Emergency', 'substances-harm-reduction',
   null, null,
   'What to do when someone is in trouble after taking something. The two things that matter most: your own safety first, and tell the ambulance what was taken.',
   'A drug emergency is any situation where someone''s breathing, consciousness, temperature or behaviour has become dangerous after taking a substance. The specifics vary; the opening moves do not.

Look after yourself first. This is not selfishness — someone who is frightened or aggressive can injure you, and a second casualty helps nobody. Keep distance if you need to, even if the person is hurting themselves, and get help rather than wrestling with them.

Call emergency services early rather than waiting to see. In most of Europe that is 112; in the US and Canada, 911. If you are travelling, look up the local number before you need it.

Say what was taken. This is where people hesitate, and the hesitation costs lives. Ambulance crews need to know what they are treating, and treatment for an opioid overdose is completely different from treatment for a stimulant one. Medical staff are bound by confidentiality, and in most places their job is not to report you. Whatever the legal exposure, it is smaller than the alternative.

Then: if they are breathing but not responsive, put them in the recovery position and stay. If they are not breathing normally, start chest compressions. Stay until help arrives, and tell the crew everything you know, including anything you are not sure about.'),

  ('recovery-position', 'Recovery Position', 'substances-harm-reduction',
   'Q1074604', 'https://en.wikipedia.org/wiki/Recovery_position',
   'Rolling an unresponsive but breathing person onto their side so that vomit or their own tongue cannot block their airway. One of the few interventions anyone can perform with no training and no equipment.',
   'The recovery position exists to solve one problem: someone who is unconscious on their back can be killed by their own airway. The tongue falls back, and vomit — very common after alcohol, opioids and dissociatives — has nowhere to go but the lungs.

It is only for someone who is breathing on their own. That is the check that decides everything. Try to rouse them by speaking loudly and shaking their shoulders, then look and listen for breathing with a hand near their mouth and nose. If they are not breathing normally, skip this entirely and start chest compressions.

If they are breathing: roll them onto their side, tilt the head back slightly and keep the mouth angled downwards so anything that comes up can drain away.

Then stay. This is the part people skip, and it is the part that matters — the position keeps the airway clear, but it does not keep them breathing. Check every minute or so. Slow, irregular or gasping breathing is not breathing; it is a sign the heart has stopped or is about to, and it means compressions now.'),

  ('cpr', 'CPR', 'substances-harm-reduction',
   'Q185325', 'https://en.wikipedia.org/wiki/Cardiopulmonary_resuscitation',
   'Chest compressions to keep blood moving when someone has stopped breathing normally. Imperfect CPR started immediately is worth far more than perfect CPR started late.',
   'CPR is what you do when someone is unresponsive and not breathing normally. It does not restart the heart; it keeps oxygenated blood moving to the brain until something that can restart it arrives.

Call emergency services first, or have someone else do it — and point at a specific person when you delegate, because a general appeal to a crowd tends to produce nobody. Tilt the head back to open the airway. Never put your fingers into someone''s mouth to search for an obstruction.

Then compress the centre of the chest, hard and fast — around twice a second, and deep. Arms straight, hands stacked, weight over your shoulders. Rescue breaths can be added if you are trained and willing, but compressions alone are accepted practice and are much better than hesitating over the alternative.

Two things people find difficult. Ribs sometimes break, and that is not a reason to stop. And it is exhausting: swap with someone else every couple of minutes if you can, because compressions get shallower long before you notice.

Checking for a pulse is no longer recommended before starting — it is unreliable under stress and wastes the time that matters most.'),

  ('heatstroke', 'Heatstroke', 'substances-harm-reduction',
   'Q337554', 'https://en.wikipedia.org/wiki/Heat_stroke',
   'The body''s temperature climbing past the point where sweating can control it. A genuine emergency, and a well-known risk of stimulants in hot, crowded rooms.',
   'Heatstroke is what happens when heat production outruns the body''s ability to shed it. It is a medical emergency and it can cause organ damage and death.

It has a particular association with dance floors: stimulants raise body temperature and suppress the sense of exhaustion, crowded venues are hot, and dancing adds more heat. Someone can be in serious trouble while believing they feel fine.

Signs include a hot, red face, a racing pulse, nausea and vomiting, headache, confusion, collapse and seizures.

Get them out of the heat and into shade or somewhere cool. Cool the skin with water. Loosen clothing. Call emergency services, and say what was taken.

Fluids only if they are fully alert. Pouring liquid into someone drowsy or unconscious risks it going into the lungs, which turns one emergency into two. And drinking large amounts of plain water is its own hazard with some stimulants — small sips and active cooling are the goal, not volume.'),

  ('circulatory-collapse', 'Circulatory Collapse', 'substances-harm-reduction',
   'Q180007', 'https://en.wikipedia.org/wiki/Syncope_(medicine)',
   'Fainting, caused by blood pressure dropping and blood pooling away from the brain. Common, usually brief, and worth knowing because standing up fast in a hot club is the classic trigger.',
   'Circulatory collapse — fainting — happens when blood pressure falls far enough that the brain is briefly short of blood. Standing up quickly, dehydration, heat, and substances that act on blood pressure are all common causes, and they stack.

There is usually a warning: dizziness, a cold sweat, a feeling of heat rising, greying vision. Acting on it prevents most of the harm. Tensing the leg muscles pushes blood back upward; sitting or lying down removes the distance the blood has to travel and takes away the risk of a head injury from the fall.

If someone has gone down, raise their legs. Check that they are breathing. Stay with them.

If consciousness does not come back quickly, or breathing has stopped, treat it as an emergency: call for help and begin chest compressions. When they do come round, let them sit up slowly, and check whether they hurt themselves on the way down — that injury is often the real damage.'),

  ('seizure', 'Seizure', 'substances-harm-reduction',
   'Q6279182', 'https://en.wikipedia.org/wiki/Seizure',
   'A sudden burst of abnormal electrical activity in the brain, causing loss of consciousness and convulsions. Several substances and combinations can cause one in someone who has no epilepsy at all.',
   'A seizure is a transient failure of normal brain function producing convulsions and loss of consciousness. It matters here because it is not confined to people with epilepsy — a number of substances lower the seizure threshold, and some combinations lower it much further than either component alone.

What to do is mostly restraint. Note the time it starts. Move hard objects out of the way. Put something soft under the head, loosen anything tight around the neck, take off their glasses, and stay.

What not to do is the part people get wrong. Do not hold them down or try to stop the convulsions. Do not sit them up. Do not put anything in their mouth — the belief that someone can swallow their tongue is a myth, and the attempt breaks teeth and fingers. Do not give them anything to drink, and do not try to shake or shout them awake.

If it lasts more than a couple of minutes, call emergency services. Afterwards, put them in the recovery position and arrange medical follow-up — a first seizure always needs looking into, and one caused by a substance is worth being honest about.'),

  ('anaphylactic-shock', 'Anaphylactic Shock', 'substances-harm-reduction',
   'Q15965523', 'https://en.wikipedia.org/wiki/Anaphylaxis',
   'The most severe form of allergic reaction, capable of causing cardiac and respiratory arrest within minutes. Rare, and immediately life-threatening when it happens.',
   'Anaphylactic shock is an allergic reaction severe enough to collapse the circulation and close the airway, sometimes within seconds to minutes of exposure.

Signs include difficulty breathing, widespread weals, itching or flushing, blue lips or fingertips, swelling of the face or throat, vomiting, clouding consciousness, and collapse.

Call emergency services immediately — this is not a wait-and-see situation. Lay the person flat and raise their legs. If they are known to carry an adrenaline autoinjector, it will be in a pocket or bag; use it according to the instructions printed on the device itself. Still call first, or have someone call while you do it.

Worth knowing in this context: the reaction is often to an adulterant rather than to the drug someone thinks they took, and a first exposure to something does not usually produce a reaction — sensitisation happens first, and the reaction comes on a later encounter.'),

  ('allergy-test', 'Allergy Test', 'substances-harm-reduction',
   null, null,
   'Taking a very small amount of a new substance, waiting several days, then repeating it, to see whether you react. It reduces one specific risk and does not clear a substance as safe.',
   'A self-administered allergy test is a way of finding out whether you react badly to something before taking a full amount of it.

The logic rests on how allergies actually develop. A first-ever contact usually produces no reaction at all — it is the exposure that sensitises the immune system, and the reaction appears on a subsequent one. So a single small trial proves nothing on its own. The approach is to take a very small amount, wait several days, take a very small amount again, and watch.

The limits are worth stating plainly. A negative result does not mean an allergy cannot develop later. Reactions are frequently to an adulterant rather than the substance itself, so a clean result with one batch says little about the next. And many reactions are delayed by hours or days rather than immediate, which is why the waiting is the method rather than an inconvenience.

It tells you about allergy. It tells you nothing about strength, purity, or how the substance will interact with anything else.'),

  -- ── after the fact ──────────────────────────────────────────────────────
  ('naloxone', 'Naloxone', 'substances-harm-reduction',
   'Q282902', 'https://en.wikipedia.org/wiki/Naloxone',
   'A drug that reverses an opioid overdose by displacing opioids from their receptors, usually given as a nasal spray. It wears off faster than most opioids do, which is the thing people most often do not know.',
   'Naloxone blocks opioid receptors and pushes opioids off them, which can restore breathing in someone overdosing within minutes. It is available as a nasal spray designed to be used by bystanders with no training, and in many places it can be obtained in advance by anyone likely to be nearby when it is needed.

The critical caveat is duration. Naloxone is shorter-acting than most opioids, so someone can wake up, appear recovered, and then slide back into overdose as it wears off. A dose may need repeating, and emergency services still need to be called every time — the reversal is a way of buying time, not a substitute for care.

It also works less well against partial agonists such as buprenorphine, and against the opioid-like alkaloids in kratom, where higher and repeated dosing may be needed.

It has no effect on overdoses that do not involve opioids, and no recreational effect of its own, so giving it to someone who turns out not to have taken opioids does no harm. If in doubt, use it.

You cannot administer it to yourself once you are overdosing. That is the whole argument for other people having it and knowing where it is.'),

  ('polydrug-use', 'Polydrug Use', 'substances-harm-reduction',
   null, null,
   'Taking more than one substance so their effects overlap. Most drug-related deaths involve a combination rather than a single substance, and the risk is rarely just the sum of the parts.',
   'Polydrug use covers everything from a drink alongside something else to deliberately stacking several substances. It is extremely common and it is where a disproportionate share of serious harm occurs.

Combinations do not simply add up. Some multiply: two depressants together suppress breathing far more than either alone, which is the mechanism behind a large share of fatal overdoses. Some mask: a stimulant can hide how sedated someone is, so the depressant overdose only becomes visible when the stimulant wears off — often while they are asleep. Some are chemically dangerous in a specific way, such as serotonergic drugs combining into serotonin syndrome. And some simply cancel out, which leads people to take more of one and discover the interaction later.

The practical advice is unglamorous. Try substances individually before combining them. Dose each component lower than you would alone, not the same. Look the specific pair up rather than reasoning from category — several published interaction charts exist for exactly this, and they disagree usefully.

Alcohol counts. It is the most frequently forgotten half of a dangerous combination precisely because it is not thought of as a drug.'),

  ('serotonin-syndrome', 'Serotonin Syndrome', 'substances-harm-reduction',
   'Q616181', 'https://en.wikipedia.org/wiki/Serotonin_syndrome',
   'A potentially fatal reaction to too much serotonin activity, usually from combining serotonergic drugs. Antidepressants plus MDMA is the combination people most often walk into without knowing.',
   'Serotonin syndrome is what happens when too many things push serotonin signalling in the same direction at once. It is a spectrum, from mildly unpleasant to fatal, and the severity tracks how many mechanisms are stacked.

It shows up as a combination of three things: altered mental state (agitation, confusion), autonomic overactivity (fever, sweating, racing heart, raised blood pressure), and neuromuscular abnormality (tremor, twitching, muscle rigidity, and in severe cases seizures). Symptoms usually begin within hours of the last dose.

The combinations that cause it are the point. MAO inhibitors are the highest risk and the least forgiving — with some substances the combination can be fatal, and irreversible MAOIs require a substantial gap, measured in weeks, before anything serotonergic. SSRIs and SNRIs, tramadol, dextromethorphan, MDMA and several stimulants all contribute. People taking a prescribed antidepressant frequently do not think of it as one of the drugs in the equation.

Mild cases resolve when the substances clear. Severe ones need hospital care and are not something to wait out — high fever, muscle rigidity or seizures mean emergency services now.'),

  ('microdosing', 'Microdosing', 'substances-harm-reduction',
   'Q6839483', 'https://en.wikipedia.org/wiki/Microdosing',
   'Taking an amount of a psychedelic small enough that there are no obvious perceptual effects, usually on a repeating schedule. Widely practised and, so far, weakly evidenced.',
   'Microdosing means taking a fraction of a normal psychedelic dose — small enough that the person does not feel intoxicated — typically to a schedule of every few days.

Reported motivations are mood, focus and creativity. The research picture is much less settled than the popular one: placebo-controlled studies have repeatedly struggled to separate microdosing from placebo, and enthusiasm has consistently run ahead of the evidence.

The practical complication is measurement. These amounts are below what an ordinary scale can weigh reliably, which is why people who do this seriously dissolve a weighed amount into a known volume of liquid and measure out a fraction. Estimating by eye at this scale is guesswork.

Two open risks are worth naming. Repeated use of any psychedelic builds tolerance quickly, which pushes amounts upward. And the long-term effects of frequent low-dose use are genuinely not established — including for the heart, where regular exposure to serotonergic compounds is an open question rather than a settled one.'),

  ('psychedelic-integration', 'Psychedelic Integration', 'substances-harm-reduction',
   null, null,
   'The work of making sense of a psychedelic experience afterwards, so that it becomes something useful rather than something that simply happened.',
   'Psychedelic integration is what turns an experience into something with consequences. Without it, a striking trip tends to fade into an anecdote; with it, people more often report an actual change.

The methods are ordinary. Writing an account soon afterwards captures detail that disappears within days and often surfaces connections that were not obvious at the time. Talking it through with someone who takes it seriously does similar work. Physical exercise and meditation are both commonly recommended, less for insight than for settling an unsettled state.

The part worth emphasising is drawing a practical consequence. A difficult experience frequently points at something the person was already dissatisfied with, and the useful question afterwards is what, concretely, changes on Monday.

Not everything integrates. If an experience stays intrusive, distressing or unresolved over weeks, that is a reason to talk to a mental-health professional rather than to sit with it — and increasingly there are practitioners who will discuss it without judgement.'),

  -- ── filed under mental-health, deliberately (see header) ────────────────
  ('panic-attack', 'Panic Attack', 'mental-health',
   'Q696490', 'https://en.wikipedia.org/wiki/Panic_attack',
   'A sudden episode of intense fear with strong physical symptoms — racing heart, breathlessness, a sense of imminent catastrophe. Deeply frightening, and not itself dangerous.',
   'A panic attack comes on suddenly, peaks quickly and passes. While it is happening it produces a racing heart, difficulty breathing, chest tightness, shaking, and a conviction that something catastrophic is occurring — commonly that the person is dying or losing their mind. The physical symptoms are real; the catastrophe is not.

Attacks happen for many reasons and are common in people with no drug involvement at all. Stimulants and cannabis can trigger or worsen them, and an unfamiliar setting makes one more likely, which is why they turn up in drug-emergency guidance.

If you are with someone having one: stay, keep your own voice level, and do not minimise it — being told there is nothing wrong is not reassuring to someone whose body is insisting otherwise. Slow the breathing down with them by counting, longer on the out-breath than the in-breath; the counting itself helps by giving attention somewhere to go. Move somewhere quieter if you can.

Call for medical help if the fear is uncontrollable or you are unsure whether it is a panic attack at all — chest pain and breathlessness have other causes. Do not hand out anyone''s medication.

Repeated attacks are treatable, and the treatments work well.');

  ---------------------------------------------------------------------------
  -- 2. Upsert. One row per statement — see header on SQLSTATE 27000.
  --    Revived rows keep their id, assignments and history; the
  --    merged/deprecated columns are cleared explicitly.
  ---------------------------------------------------------------------------
  for r in select * from _hr order by slug loop
    insert into public.unified_tags (
      name, slug, entity_kind, status, description, short_description,
      long_description, wikidata_id, wikipedia_url,
      is_sensitive, sensitive_topics, verification_status, human_reviewed,
      seo_indexable, last_verified_at
    ) values (
      r.name, r.slug, 'concept', 'active', r.descr,
      split_part(r.descr, '. ', 1) || '.', r.longdescr, r.qid, r.wiki,
      (r.cat = 'substances-harm-reduction'),
      case when r.cat = 'substances-harm-reduction'
           then array['substance use','harm reduction'] else '{}'::text[] end,
      'reviewed', true, true, now()
    )
    on conflict (slug) do update set
      name              = excluded.name,
      entity_kind       = 'concept',
      status            = 'active',
      description       = excluded.description,
      short_description = excluded.short_description,
      long_description  = excluded.long_description,
      -- written verbatim, NULL included: three of these were papers.
      wikidata_id       = excluded.wikidata_id,
      wikipedia_url     = excluded.wikipedia_url,
      is_sensitive      = excluded.is_sensitive,
      sensitive_topics  = excluded.sensitive_topics,
      verification_status = 'reviewed',
      human_reviewed    = true,
      seo_indexable     = true,
      merged_into_id    = null,
      deprecated_at     = null,
      deprecation_reason = null,
      last_verified_at  = now(),
      updated_at        = now();
  end loop;

  ---------------------------------------------------------------------------
  -- 3. Category assignment, one row per statement.
  ---------------------------------------------------------------------------
  for r in select * from _hr order by slug loop
    select id into v_tag_id from public.unified_tags where slug = r.slug;
    continue when v_tag_id is null;

    if r.cat = 'substances-harm-reduction' then
      v_parent_id := v_cat_id;
    else
      v_parent_id := v_mental_id;
    end if;

    update public.tag_category_assignments
       set is_primary = false
     where tag_id = v_tag_id and category_id <> v_parent_id;

    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    values (v_tag_id, v_parent_id, true)
    on conflict (tag_id, category_id) do update set is_primary = true;

    update public.unified_tags
       set category_id = v_parent_id, updated_at = now()
     where id = v_tag_id and category_id is distinct from v_parent_id;
  end loop;

  ---------------------------------------------------------------------------
  -- 4. Merges. BEFORE aliases, per tag_alias_reject_shadow. merge_tag_concept
  --    overwrites app.actor, so it is re-set afterwards.
  --
  --    naloxone-narcan duplicates naloxone (and carried Q67338805, a 1975
  --    paper). drug-checking-reagent-testing conflated two distinct services
  --    that the source treats as separate chapters; reagent-testing above is
  --    the surviving concept and the old row folds into it, which also leaves a
  --    tag_slug_redirects row so the old URL keeps resolving.
  ---------------------------------------------------------------------------
  for r in
    select * from (values
      ('naloxone', 'naloxone-narcan'),
      ('reagent-testing', 'drug-checking-reagent-testing')
    ) as t(canon, dup)
  loop
    select id into v_canon_id from public.unified_tags where slug = r.canon;
    select id into v_dup_id   from public.unified_tags where slug = r.dup;
    if v_canon_id is not null and v_dup_id is not null and v_canon_id <> v_dup_id then
      begin
        perform public.merge_tag_concept(
          v_canon_id, v_dup_id,
          'admin:substanzhandbuch-harm-reduction',
          'substanzhandbuch harm-reduction vocabulary');
      exception when others then
        raise notice 'merge % <- % skipped: %', r.canon, r.dup, sqlerrm;
      end;
    end if;
  end loop;
  perform set_config('app.actor', 'admin:substanzhandbuch-harm-reduction', true);

  ---------------------------------------------------------------------------
  -- 5. Ontology edges. tag_relations CHECKs source <> target, so a self-edge
  --    would raise — every pair below is guarded.
  ---------------------------------------------------------------------------
  for r in
    select * from (values
      -- practice -> the concept it belongs to
      ('safer-use',                'harm-reduction'),
      ('drug-checking',            'harm-reduction'),
      ('reagent-testing',          'drug-checking'),
      ('naloxone',                 'harm-reduction'),
      ('drug-emergency',           'harm-reduction'),
      ('polydrug-use',             'harm-reduction'),
      ('set-and-setting',          'safer-use'),
      ('allergy-test',             'safer-use'),
      ('microdosing',              'safer-use'),
      -- emergency response -> drug emergency
      ('recovery-position',        'drug-emergency'),
      ('cpr',                      'drug-emergency'),
      ('heatstroke',               'drug-emergency'),
      ('circulatory-collapse',     'drug-emergency'),
      ('seizure',                  'drug-emergency'),
      ('anaphylactic-shock',       'drug-emergency'),
      ('panic-attack',             'drug-emergency'),
      -- psychedelic care
      ('trip-sitter',              'bad-trip'),
      ('trip-killer',              'bad-trip'),
      ('psychedelic-integration',  'bad-trip'),
      -- hazards
      ('serotonin-syndrome',       'polydrug-use')
    ) as t(child, parent)
  loop
    select id into v_tag_id  from public.unified_tags where slug = r.child;
    select id into v_parent_id from public.unified_tags where slug = r.parent;
    if v_tag_id is not null and v_parent_id is not null and v_tag_id <> v_parent_id then
      insert into public.tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
      values (v_tag_id, v_parent_id, 'broader', 1.0, 'approved')
      on conflict (source_tag_id, target_tag_id, relation_type) do nothing;
    end if;
  end loop;

  ---------------------------------------------------------------------------
  -- 6. Attribution. The handbook is the factual grounding for this vocabulary
  --    even though none of its prose is reused; the row records that.
  ---------------------------------------------------------------------------
  for r in select * from _hr order by slug loop
    select id into v_tag_id from public.unified_tags where slug = r.slug;
    continue when v_tag_id is null;
    delete from public.tag_sources
     where tag_id = v_tag_id and source_url = 'https://www.eve-rave.ch/das-substanzhandbuch/';
    insert into public.tag_sources (tag_id, source_type, source_url, claim_summary, fetched_at)
    values (v_tag_id, 'editorial', 'https://www.eve-rave.ch/das-substanzhandbuch/',
            'Factual grounding from "Das Substanzhandbuch" v1.1 (eve&rave Schweiz, 2024), a peer-produced harm-reduction handbook. Wording here is original; the handbook is CC BY-NC-SA and is not reproduced.',
            now());
  end loop;

  ---------------------------------------------------------------------------
  -- 7. Assertions.
  ---------------------------------------------------------------------------
  select count(*) into v_n
    from _hr h left join public.unified_tags t on t.slug = h.slug
   where t.id is null;
  if v_n > 0 then
    raise exception 'harm-reduction vocabulary: % expected slug(s) missing after upsert', v_n;
  end if;

  select count(*) into v_n
    from _hr h join public.unified_tags t on t.slug = h.slug
   where t.status <> 'active' or t.human_reviewed is not true
      or t.seo_indexable is not true or t.verification_status <> 'reviewed'
      or t.merged_into_id is not null or t.deprecated_at is not null;
  if v_n > 0 then
    raise exception 'harm-reduction vocabulary: % tag(s) did not land in the publishable state', v_n;
  end if;

  -- Category and sensitivity are the same rule (see header).
  select count(*) into v_n
    from _hr h join public.unified_tags t on t.slug = h.slug
   where t.is_sensitive is distinct from (h.cat = 'substances-harm-reduction');
  if v_n > 0 then
    raise exception 'harm-reduction vocabulary: % tag(s) where sensitivity disagrees with category', v_n;
  end if;

  select count(*) into v_n
    from _hr h join public.unified_tags t on t.slug = h.slug
    join public.tag_categories c on c.slug = h.cat
    left join public.tag_category_assignments ca
      on ca.tag_id = t.id and ca.category_id = c.id
   where ca.tag_id is null;
  if v_n > 0 then
    raise exception 'harm-reduction vocabulary: % tag(s) not filed under their category', v_n;
  end if;

  -- The three wrong QIDs must be gone, and no revived row may point at a paper.
  select count(*) into v_n
    from public.unified_tags
   where slug in ('safer-use','polydrug-use')
     and wikidata_id is not null;
  if v_n > 0 then
    raise exception 'harm-reduction vocabulary: safer-use/polydrug-use still carry a wikidata_id (both resolved to journal articles)';
  end if;

  -- The wrong-entity guard from 20261002100000, re-run over the new rows.
  select count(*) into v_n
    from _hr h join public.unified_tags t on t.slug = h.slug
   where coalesce(t.long_description, '') <> ''
     and t.long_description not ilike '%' || t.name || '%';
  if v_n > 0 then
    raise exception 'harm-reduction vocabulary: % tag(s) have a body that never names the tag', v_n;
  end if;

  -- The handbook's own typo must not have been propagated.
  select count(*) into v_n
    from _hr h join public.unified_tags t on t.slug = h.slug
   where coalesce(t.description, '') || coalesce(t.long_description, '') like '%114%';
  if v_n > 0 then
    raise exception 'harm-reduction vocabulary: % tag(s) contain "114" — the source''s wrong ambulance number', v_n;
  end if;

  -- is_adult is trigger-derived; nothing here belongs behind an age wall.
  select count(*) into v_n
    from _hr h join public.unified_tags t on t.slug = h.slug where t.is_adult;
  if v_n > 0 then
    raise exception 'harm-reduction vocabulary: % tag(s) became is_adult', v_n;
  end if;

  select count(*) into v_n
    from _hr h
    join public.unified_tags t on t.slug = h.slug
    join public.tag_relations tr on tr.source_tag_id = t.id and tr.relation_type = 'broader';
  raise notice 'harm-reduction vocabulary: % tags active, % broader edges',
    (select count(*) from _hr), v_n;
end
$mig$;

select public.recount_all_tag_usage(500);
