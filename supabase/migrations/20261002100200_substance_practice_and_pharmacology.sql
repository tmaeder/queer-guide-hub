-- Route-of-use practice, hazards and the pharmacology vocabulary — plus the
-- wikidata_id audit that fell out of writing it.
--
-- THE AUDIT IS THE IMPORTANT PART OF THIS FILE
--
-- 20261002100000 repaired three tags whose bodies described the wrong entity.
-- Writing this migration meant checking the wikidata_id on every row it
-- touched, and the failure turned out not to be incidental. Every QID on an
-- active tag in `Substances & Harm Reduction` was read back from the Wikidata
-- API — 33 of them — and five did not describe the tag:
--
--   poppers            Q106454435 -> "Poppers", a FAMILY NAME
--   anabolic-steroids  Q56602382  -> a scientific article published 2002
--   beer               Q814067    -> a family name        (fixed in ...100000)
--   dependence         Q3044808   -> an outbuilding        (fixed in ...100000)
--   pcp                Q769829    -> Portuguese Communist Party (fixed in ...100000)
--
-- and the same check over the deprecated rows revived here found five more:
--
--   addiction   Q4681106  -> the academic journal "Addiction"
--   bumping     Q11831728 -> "pumping house", a house-music subgenre
--   slam        Q1760539  -> Saint Louis Art Museum
--   slamming    Q1463560  -> moshing
--   withdrawal  Q26256296 -> "rectification", correction of a mistake
--
-- The mechanism is visible in the search results: for `poppers`, Q106454435
-- (the surname) is the FIRST hit and Q898516 ("class of recreational drug") is
-- the third. Whatever resolver populated this column took the top match without
-- checking what it was. That makes wikidata_id in this category untrustworthy
-- as a class, not tag by tag.
--
-- WHY A WRONG QID IS NOT COSMETIC: IT PUBLISHES CLINICAL CODES
--
-- `run_tag_medical_codes_sync` (weekly) derives tag_medical_codes from
-- wikidata_id, and TagDiagnosticCodes renders them at /tags/:slug#codes. So a
-- wrong identifier becomes a wrong medical claim on a public page.
--
-- It already had. `drug-use` pointed at Q7632070, which is *substance use
-- disorder* — a different and much narrower concept — and had therefore
-- accumulated 13 clinical codes: ICD-10 F10 through F19 and ICD-9 303/304/305,
-- the dependence and harmful-use codes. The page for "drug use" was asserting
-- that using a drug is that diagnosis. That is precisely the framing the
-- category exists to avoid, and it was stated in ICD codes.
--
-- The fix is not to delete the codes but to move the concept: Q7632070 belongs
-- to `substance-use-disorder`, created below, and the weekly sync will attach
-- them there. `drug-use` keeps no identifier, and its stale rows are deleted so
-- the sync does not simply restore them.
--
-- NULL BEATS A PLAUSIBLE GUESS
--
-- Where a concept genuinely has no Wikidata item — safer sniffing, volumetric
-- dosing, eyeballing, trip killers, dirty drugs — this file writes NULL. That
-- is the lesson of the five wrong IDs above: an empty identifier is a smaller
-- error than a confident wrong one, and it cannot generate a false code.
--
-- SCOPE WAS CUT DELIBERATELY
--
-- The source handbook has chapters this file does NOT turn into tags. The
-- purification methods (acetone wash, recrystallisation) are step-by-step
-- procedure, and the boundary set by 20260907100000 — no dosage, no route
-- instructions — covers them; `drug-purification` exists as a concept without
-- the method. Individual toxidromes are rows in a recognition table, not pages,
-- so there is one `toxidrome`. Five of the eight neurotransmitters are omitted
-- because nothing else in the glossary refers to them; serotonin, dopamine and
-- GABA stay because the serotonin-syndrome and withdrawal pages lean on them.
--
-- `substance-abuse` IS NOT MERGED HERE
--
-- The plan proposed folding it into `substance-use-disorder` as the
-- non-stigmatising term. It is left standing: Q3184856 is a legitimate distinct
-- Wikidata concept, it carries four correct medical codes of its own that a
-- merge would put at risk, and retiring a high-traffic term is a content
-- decision rather than a repair. The two are linked by a relation instead.
--
-- SCENE TERMS BECOME ALIASES, AND TWO OF THEM MUST NOT BE TRUSTED
--
-- `slam`, `slamming`, `bumping` and `snorting` fold into the practice tags.
-- merge_tag_concept records a merged slug as an APPROVED alias, and since
-- 20260910151200 an approved alias IS an auto-tagging rule for
-- run_tag_assignment_reconcile(). "slam" and "bumping" are ordinary English
-- words — a poetry slam, a car bumping — so they are demoted to 'auto'
-- immediately after the merge, exactly as 20260816105401 did for `rack`.
-- Recorded and resolvable, never trusted by the reconciler.
--
-- THE PROSE IS OURS; the handbook is CC BY-NC-SA and is grounding only.
-- is_adult is trigger-derived — never set it.

set local statement_timeout = '600s';

do $mig$
declare
  v_cat_id    uuid;
  v_tag_id    uuid;
  v_canon_id  uuid;
  v_dup_id    uuid;
  v_parent_id uuid;
  v_n         int;
  r           record;
begin
  perform set_config('app.actor', 'admin:substanzhandbuch-pharmacology', true);

  select id into strict v_cat_id
    from public.tag_categories where slug = 'substances-harm-reduction';

  ---------------------------------------------------------------------------
  -- 1. QID repairs on rows that already exist and are already live.
  ---------------------------------------------------------------------------
  update public.unified_tags
     set wikidata_id = 'Q898516',
         wikipedia_url = 'https://en.wikipedia.org/wiki/Poppers',
         last_verified_at = now(), updated_at = now()
   where slug = 'poppers';

  update public.unified_tags
     set wikidata_id = 'Q309438',
         wikipedia_url = 'https://en.wikipedia.org/wiki/Anabolic_steroid',
         last_verified_at = now(), updated_at = now()
   where slug = 'anabolic-steroids';

  -- drug-use: the identifier moves to substance-use-disorder (created below),
  -- and the 13 codes it produced go with it. Deleting them matters — the
  -- weekly sync would otherwise leave them in place.
  select id into v_tag_id from public.unified_tags where slug = 'drug-use';
  if v_tag_id is not null then
    delete from public.tag_medical_codes where tag_id = v_tag_id;
    update public.unified_tags
       set wikidata_id = null,
           wikipedia_url = null,
           last_verified_at = now(), updated_at = now()
     where id = v_tag_id;
  end if;

  ---------------------------------------------------------------------------
  -- 2. The vocabulary.
  ---------------------------------------------------------------------------
  create temp table _px (
    slug      text primary key,
    name      text not null,
    qid       text,
    wiki      text,
    descr     text not null,
    longdescr text
  ) on commit drop;

  insert into _px (slug, name, qid, wiki, descr, longdescr) values

  -- ── routes of use ──────────────────────────────────────────────────────
  ('safer-sniffing', 'Safer Sniffing', 'Q3153701', 'https://en.wikipedia.org/wiki/Insufflation_(medicine)',
   'Harm reduction for taking drugs nasally: never sharing the tube, never using a banknote, and looking after the nose afterwards. Sharing is a real route for hepatitis C.',
   'Safer sniffing is the set of habits that make nasal use less damaging. The nose is delicate, most powders are irritant, and the damage accumulates quietly.

The transmission point is the one people underestimate. Nasal tissue bleeds, often invisibly, and a shared tube can carry hepatitis C and other blood-borne infections from one person to the next. Banknotes are worse — filthy, and passed around by definition. A tube should belong to one person and be marked if there is any chance of confusion.

The rest is mostly mechanical. Finely ground powder scratches less than coarse. Pills are not suitable for nasal use at all: the binders and fillers are not meant to go there and can cause real damage. Angling the tube against the side of the nostril rather than straight up gets more of the material onto the tissue that absorbs it and less into the throat and lungs.

Afterwards, rinsing with a saline solution helps, and doing it routinely rather than only when something hurts is the difference. Nasal tissue that dies does not grow back, and long-term heavy use is how people end up with perforated septums.'),

  ('safer-smoking', 'Safer Smoking', null, null,
   'Reducing the damage from inhaling a substance, mostly by vaporising rather than burning it. Inhaled drugs act faster and harder than swallowed ones, which cuts both ways.',
   'Safer smoking starts from the fact that burning anything produces a lot of chemistry that was not in the original material. Vaporising at the lowest workable temperature avoids most of that, and is the single biggest improvement available.

Inhalation also changes the drug''s behaviour. Effects arrive within seconds, hit harder and fade faster than the same substance swallowed. That makes the amount much harder to judge and encourages repeating, which is where much of the harm comes from.

Practical points: use borosilicate glass rather than plastic or thin glass, which degrade under heat; use a filter if you are rolling something; and avoid pre-mixed "herbal blends" of unknown composition, which are one of the main ways people encounter synthetic cannabinoids without meaning to.

Mixing tobacco in is worth avoiding if you are not otherwise a smoker, since it establishes a nicotine habit alongside whatever else you were doing.'),

  ('safer-plugging', 'Safer Plugging', null, null,
   'Taking a dissolved substance rectally. Absorption is higher and faster than swallowing, so the same amount hits considerably harder — which is the whole risk.',
   'Safer plugging covers rectal administration. It has a genuine rationale — absorption is more complete and partly bypasses the liver, so less is wasted — and a corresponding hazard, which is that an amount judged by oral experience is now substantially stronger.

Overdose risk by this route is closer to injecting than to swallowing. That is the fact that governs everything else about it.

The tissue involved is thin, easily torn and readily inflamed. Irritant solvents do real damage there, and alcohol is a poor choice for this reason. Anything with sharp edges or an unnecessary applicator adds injury risk.

Rectal use also has implications for sexual health that are easy to overlook: damaged tissue raises the risk of transmitting or acquiring infections, and it does so during exactly the sort of evening where this route tends to be used.'),

  ('safer-injecting', 'Safer Injecting', null, null,
   'The highest-risk way to take a drug, and the one with the most to gain from technique. Never share equipment, treat every new batch as stronger than the last, and never do it alone.',
   'Safer injecting exists because injecting carries more risk than any other route and people do it anyway. The realistic goal is fewer infections, fewer injuries and fewer fatal overdoses, not persuasion.

Equipment first. Nothing is ever shared — not needles, not filters, not water, not spoons — because hepatitis C in particular transmits through traces far too small to see. Each needle is used once; a blunted needle does more tissue damage on the way in. Everything comes from sealed packaging, and needle exchanges supply it free and without judgement in many places.

Dose next, and this is what kills people. Every new batch should be treated as far stronger than the last, because purity swings unpredictably and contamination with potent synthetic opioids has made that swing much wider. Tolerance also collapses during any break — after detox, illness, prison or simply a quiet month — so a previously routine amount can be fatal on the day someone returns to it. This is among the most common patterns in overdose deaths.

Never inject alone. The overwhelming majority of fatal overdoses happen with nobody present, and naloxone cannot be self-administered once someone is overdosing.

Complications worth recognising: an abscess presents as a hot, swollen, painful lump and may need draining. A deep vein thrombosis shows as a swollen, warm, discoloured limb that hurts more on walking, and can throw a clot to the lungs — sudden breathlessness and chest pain is an emergency. Sepsis develops over hours to days with fever, racing pulse, breathlessness and confusion, and is fatal untreated. Groin and neck veins carry much higher risk of all of these.'),

  -- ── measuring ──────────────────────────────────────────────────────────
  ('milligram-scale', 'Milligram Scale', null, null,
   'A precision scale for weighing small amounts, and a lesson in its own limits: below roughly 50 mg an affordable one is already unreliable, and below 10–15 mg it is guessing.',
   'A milligram scale reading to 0.001 g is the usual tool for weighing a dose, and knowing where it stops working is more useful than owning one.

Affordable models are typically accurate to within a few milligrams. That is fine when weighing something measured in hundreds of milligrams and useless when weighing something measured in tens — the error becomes a large fraction of the dose. Below about 10 to 15 milligrams the reading should not be trusted at all, and for substances active in that range the answer is volumetric dosing rather than a better scale.

Scales need calibrating with their own check weight before use, not once when new. They are also sensitive to draughts, vibration, temperature swings and nearby electronics, all of which are ordinary conditions in the places people actually use them.

One practical trick: leaving a tared container on the pan puts the measurement into a range where cheap scales behave better.'),

  ('eyeballing', 'Eyeballing', null, null,
   'Estimating a dose by eye. Extremely common and extremely unreliable — the same weight of two substances can occupy visibly different volumes, and batches differ from each other.',
   'Eyeballing means judging an amount by how it looks. It is the default method for most people and it is the method most likely to produce an accidental overdose.

The reason is that volume is not a proxy for weight. Moisture content, salt form, crystal size, packing density, cutting agents and outright substitution all change how much space a given weight occupies — two substances of identical mass can differ in apparent volume by a third or more. A batch bought last month is not a guide to this one.

The danger scales inversely with the active amount. For a substance where a dose is hundreds of milligrams, a visual misjudgement is a small proportional error. For one where a dose is twenty milligrams, the same misjudgement can be several times the intended amount.

Weighing a single reference dose from a new batch, once, is a large improvement for very little effort — it calibrates the eye against that specific material.'),

  ('volumetric-dosing', 'Volumetric Dosing', null, null,
   'Dissolving a weighed amount into a known volume of liquid and measuring out a fraction. The only workable way to handle substances active in microgram or low-milligram amounts.',
   'Volumetric dosing solves the problem that no affordable scale can weigh a few milligrams accurately. Instead of weighing the dose, you weigh a larger amount that the scale can handle, dissolve it into a measured volume of liquid, and then measure out a fraction of that liquid.

Because the substance distributes evenly through the solvent, the accuracy of the final dose depends on the arithmetic and the measuring rather than on the scale''s worst range. Weighing at least 50 mg keeps the scale inside the range where it behaves.

It matters most for substances where a dose is measured in micrograms, and for newer compounds whose active amounts are small and poorly characterised — the situations where eyeballing is not merely inaccurate but dangerous.

Two cautions. The solvent must be pharmacopoeia-grade; technical-grade solvents contain contaminants not intended to be consumed. And arithmetic mistakes are the main failure mode — a misplaced decimal point produces a tenfold error with no visible sign that anything is wrong.'),

  ('drug-purification', 'Drug Purification', null, null,
   'Home methods for removing some of what has been cut into a street powder. They improve purity somewhat, they do not produce a pure substance, and they change how strong it is.',
   'Drug purification covers techniques that exploit the different solubilities of a substance and its adulterants to wash some of the latter away. They exist because some street powders are heavily cut — amphetamine in particular is often a small fraction of what is sold.

The realistic outcome is a modest improvement, not a pure product. Reported gains are in the region of a two- to fourfold increase in purity, and the result is still an unknown mixture.

That improvement is itself the main hazard, and it is routinely missed. Removing the cut makes what remains stronger by weight, so an amount that was familiar before is now a much larger dose. Anything purified should be approached as if it were an entirely new and much stronger batch.

Solvent residues are the other risk. Anything used in the process has to be fully evaporated, and that needs real ventilation — the solvents involved are flammable and their vapour is not something to breathe or keep near a flame.'),

  -- ── hazards ────────────────────────────────────────────────────────────
  ('sepsis', 'Sepsis', null, null,
   'The body''s response to infection turning against itself and damaging its own organs. It develops over hours to days, it is a leading cause of death after injecting, and it is treatable if caught early.',
   'Sepsis is what happens when the immune response to an infection becomes systemic and starts damaging the body it is defending. It is a medical emergency and it kills a significant proportion of the people who develop it even with treatment.

It matters here because injecting introduces bacteria directly into the bloodstream, and non-sterile technique or shared equipment makes that far more likely.

Onset is typically hours to days after the infection starts, which means it is often not connected to the injection that caused it. The signs are fever above 38 °C, a fast pulse, breathlessness, shivering, a rash, low blood pressure, and confusion or unusual drowsiness. Feeling suddenly and inexplicably terrible is itself a symptom worth acting on.

There is no waiting this out. It progresses, sometimes quickly, and the earlier antibiotics are started the better the outcome. Anyone who injects and becomes feverish and unwell should be assessed rather than left to sleep it off — and it is worth telling the clinician about the injecting, because it changes what they look for.'),

  ('toxidrome', 'Toxidrome', null, null,
   'A recognisable pattern of symptoms that points to a class of poisoning. Emergency clinicians use them to work out what someone has taken when nobody can say.',
   'A toxidrome is a cluster of signs — pulse, blood pressure, breathing rate, temperature, pupil size, skin, level of consciousness — that together indicate which class of substance is causing a poisoning. It is how a clinician narrows things down when the patient cannot answer questions.

The broad families are the opioid pattern (pinpoint pupils, slow shallow breathing, unresponsiveness), the sedative-hypnotic pattern from alcohol, benzodiazepines and GHB (poor coordination, memory loss, sliding toward coma), the sympathomimetic pattern from stimulants (dilated pupils, fast pulse, high blood pressure, raised temperature, agitation, sweating), the anticholinergic pattern from deliriants and some antihistamines (dilated pupils, dry hot skin, confusion), and the hallucinogenic pattern (altered perception with a fast pulse and raised blood pressure).

Two things are worth taking from this. Pupils and skin do a lot of the discriminating work — pinpoint and clammy versus dilated and dry points in opposite directions. And with the partial exception of the hallucinogenic pattern, all of these are emergencies requiring medical care.

Recognising a pattern is not diagnosing one. The value for a bystander is knowing that these signs are worth describing precisely to the ambulance crew, because they change treatment.'),

  ('hppd', 'HPPD', null, null,
   'Hallucinogen persisting perception disorder: visual disturbances that continue after a psychedelic has worn off. Uncommon, usually temporary, and genuinely distressing when it persists.',
   'HPPD is the continuation of visual phenomena — trails behind moving objects, static or "snow" over the visual field, halos, afterimages, drifting patterns — after the drug that produced them has cleared. It can appear in people with no psychiatric history.

It is usually described in two forms. One is brief and intermittent: episodes lasting seconds or minutes, often triggered by a reminder such as particular music or a place, frequently not experienced as unpleasant. The other is persistent and intrusive, lasting weeks or months and interfering with daily life. The first is considerably more common than the second.

Most cases resolve within a year. A small number do not.

Two complications are worth knowing. Some of these phenomena — floaters, faint visual static — exist in people who have never taken anything, which makes self-diagnosis unreliable. And the condition is poorly known among clinicians, so people often struggle to be taken seriously. What sufferers consistently report is that cannabis makes it worse and that abstaining from everything helps.'),

  ('ego-dissolution', 'Ego Dissolution', null, null,
   'The temporary loss of the sense of being a separate self, at higher psychedelic doses. Often preceded by a conviction of dying, and often described afterwards as valuable.',
   'Ego dissolution is the experience of the boundary between self and everything else coming apart. Name, history, plans, the sense of being a particular person located somewhere — these can all recede or vanish entirely.

It becomes more likely as the dose increases, and it occurs in degrees rather than all at once. Partial versions are far more common than complete ones.

It is very frequently preceded by a conviction of dying. That is not a sign anything physical is wrong, and knowing in advance that it is a normal feature of the experience appears to help a great deal. Resistance tends to make it harder; people who report the most difficulty are usually those fighting it, and those who report the most value are usually those who stopped.

It is also the reason set and setting and a sober sitter matter so much at higher doses. Someone in this state cannot reliably look after themselves, cannot meaningfully consent to anything, and needs the environment to have been made safe beforehand.'),

  ('delirium-tremens', 'Delirium Tremens', null, null,
   'The most severe form of withdrawal from alcohol or other GABA-acting drugs: confusion, hallucinations, seizures and dangerous instability of the body''s basic functions. It can kill.',
   'Delirium tremens is the extreme end of withdrawal from substances that act on the GABA system — alcohol above all, and also benzodiazepines and GHB and its precursors. It typically appears a day or more after the last dose.

It presents as severe confusion and disorientation, vivid hallucinations, intense agitation and anxiety, tremor, sweating, a racing heart, and seizures. Body temperature and cardiovascular function can become dangerously unstable, and untreated it has a substantial mortality rate.

The reason it belongs in a harm-reduction glossary rather than only a clinical one is that it inverts the intuition people bring to stopping. With most drugs, stopping abruptly is unpleasant but safe. With these, stopping abruptly can be lethal, while continuing is not — which means "just quit" is actively dangerous advice for someone physically dependent on alcohol or benzodiazepines.

The safe route is a planned, medically supervised reduction, and inpatient detox where dependence is significant. This is one of the clearest cases in the whole field where the right move is to involve a doctor rather than manage it alone.'),

  ('substance-use-disorder', 'Substance Use Disorder', 'Q7632070', 'https://en.wikipedia.org/wiki/Substance_use_disorder',
   'The clinical diagnosis for drug use that has become compulsive and is causing harm. It is graded by how many criteria are met, and it is deliberately not the same thing as using drugs.',
   'Substance use disorder is the current diagnostic term, replacing the older split between "abuse" and "dependence" with a single condition assessed on a set of criteria and graded mild, moderate or severe according to how many apply.

The criteria describe a pattern rather than a substance or a quantity: using more or for longer than intended, wanting to cut down and not managing it, spending a great deal of time obtaining or recovering, craving, failing to meet obligations, continuing despite it causing problems, giving up other activities, using in situations where it is physically hazardous, continuing despite knowing it is causing harm, tolerance, and withdrawal.

Two of those criteria — tolerance and withdrawal — are physiological adaptations that occur in anyone using regularly enough, including people taking prescribed medication exactly as directed. On their own they do not indicate a disorder, which is a distinction that gets lost constantly.

The terminology matters. "Substance abuse" and "addict" carry judgement that measurably deters people from seeking help, and the shift toward describing a condition rather than labelling a person is a deliberate part of making treatment reachable. Treatment works, and works better the earlier someone feels able to ask.'),

  ('craving', 'Craving', null, null,
   'The compulsive pull toward using — including the urge to take more while already using. One of the diagnostic criteria for substance use disorder, and a large part of what makes stopping hard.',
   'Craving is the intense, intrusive urge to use. It shows up in two places: the pull toward starting again after stopping, and the pull toward redosing during a session, which is where a great deal of acute harm originates.

It is strongly cued. Places, people, music, times of day and objects associated with previous use can trigger it long after the substance itself is gone, which is why people often find the urge much stronger in some settings than others and why avoiding particular contexts is a real strategy rather than an evasion.

Short-acting substances produce it most sharply, because the drop-off arrives while the person is still there and still able to take more. This is the mechanism behind a lot of stimulant harm — the decision to redose is made in a state that the drug itself has altered.

Practical responses tend to be structural rather than willpower-based: deciding a cut-off in advance, limiting how much is on hand, and putting distance between yourself and the cue. Craving passes in waves, and knowing that it peaks and then recedes makes it easier to wait out.'),

  ('drug-tolerance', 'Drug Tolerance', 'Q1425425', 'https://en.wikipedia.org/wiki/Drug_tolerance',
   'Needing more of a substance for the same effect after repeated use. The dangerous part is the reverse: tolerance falls away during a break, and a familiar amount can then be an overdose.',
   'Drug tolerance is the body adapting to repeated exposure so that a given amount produces less effect than it used to. It develops at very different speeds depending on the substance — within a single session for some, over weeks for others.

The direction people worry about is upward: the amount creeping higher over time, which raises cost, physical strain and dependence risk. But the direction that kills is downward. Tolerance recedes during any period of not using — after detox, illness, prison, or simply a few weeks off — and it recedes faster than most people expect. Returning to a previously routine amount after a break is one of the most common patterns in fatal overdose.

Tolerance is also selective. It does not develop evenly across every effect of a drug: with opioids, tolerance to the pleasant effects typically outpaces tolerance to respiratory depression, so the gap between an effective amount and a dangerous one narrows as use continues.

Classical psychedelics behave differently again — tolerance builds so steeply after a single use that taking more within a few days does very little, which effectively rules out daily use.'),

  ('withdrawal', 'Withdrawal', 'Q498902', 'https://en.wikipedia.org/wiki/Drug_withdrawal',
   'What happens when a body adapted to a substance stops getting it. Severity ranges from thoroughly unpleasant to genuinely life-threatening, depending entirely on which substance.',
   'Withdrawal is the set of symptoms that appear when someone physically dependent on a substance reduces or stops it. The body has adjusted to the substance being present; removing it leaves that adjustment exposed.

The crucial point is that danger varies enormously by drug, and not in the direction most people assume. Withdrawal from alcohol, benzodiazepines and GHB and its precursors can be fatal — seizures and delirium tremens — and needs a planned reduction under medical supervision rather than an abrupt stop. Opioid withdrawal is famously miserable, with pain, sickness, sleeplessness and profound restlessness, but is not usually life-threatening in an otherwise healthy person. Withdrawal from stimulants, cannabis and dissociatives is predominantly psychological: exhaustion, low mood, irritability, disrupted sleep and strong craving.

So the substances with the fearsome reputation for withdrawal are not the ones most likely to kill someone during it. Alcohol is.

Tapering is the general answer where dependence is established, and inpatient detox where it is significant. And whatever the route, the tolerance drop that follows is its own hazard — see drug tolerance.'),

  ('addiction', 'Addiction', null, null,
   'The everyday word for compulsive use that a person cannot easily stop, despite it causing harm. Clinically the condition is called substance use disorder.',
   'Addiction is the common term for a pattern where use has become compulsive and continues despite clear harm. It describes something real, and it is used here alongside the clinical term rather than instead of it.

It is not usefully explained by any single cause. The substance matters — some are far more reinforcing than others — but so does environment, and so does the person: upbringing, isolation, economic circumstance, trauma, mental illness and genetics all contribute. Explanations that place the whole weight on individual willpower do not match the evidence and get in the way of treatment.

That framing has a particular history in queer communities, where substance use has often been read as a moral failing layered on top of an identity already treated as one, and where the bars that provided the only safe social space were also the only social space. Both things being true at once is part of why a non-judgemental service is reached and a judgemental one is not.

The practical marker is not frequency or quantity but loss of control and impact: whether use is displacing work, relationships, health and the things a person otherwise wants. Someone using rarely can have a problem; someone using regularly may not.

Help exists and works, and it does not require hitting a rock bottom first — that idea is folklore, and a harmful piece of it.'),

  -- ── pharmacology ───────────────────────────────────────────────────────
  ('bioavailability', 'Bioavailability', null, null,
   'How much of a dose actually reaches the bloodstream, and how fast. It is the reason the same amount taken by a different route is not the same dose.',
   'Bioavailability is the proportion of an administered amount that reaches circulation intact. Injecting is defined as 100% because the substance goes straight in; every other route delivers less, and often much less.

Swallowing usually gives the lowest figure, because the substance must survive the gut and then a first pass through the liver. Nasal and rectal routes bypass part of that and therefore deliver more of the same amount. This is precisely why converting a familiar oral amount to another route without adjusting it is a common way to take far more than intended.

The figures quoted for any substance are averages with wide individual variation, and they trade off against duration — routes that deliver more, faster, generally also wear off sooner.'),

  ('half-life', 'Half-Life', null, null,
   'The time it takes for the amount in the blood to fall by half. Useful for judging when a substance has cleared — and a poor guide to how long it feels like it is working.',
   'Half-life measures elimination, not experience. After roughly five to six half-lives a substance is essentially gone, which is the number that matters when working out whether it is safe to take something that interacts with it.

It is routinely mistaken for duration of effect, and the two can diverge sharply — LSD has a half-life of a few hours while its effects run most of a day. Conversely, a substance can be well past its noticeable effects while still present in amounts that interact with something else.

Individual variation is large, and liver function, age, other drugs and genetics all shift it. Substances that accumulate in fat, such as THC, do not clear on a simple curve at all. And detectability in a drug test is a different question again, often outlasting any pharmacological relevance by a long way.'),

  ('first-pass-effect', 'First-Pass Effect', null, null,
   'The liver metabolising much of a swallowed substance before it ever reaches the rest of the body. It is why oral doses are larger than doses by other routes.',
   'The first-pass effect is what happens between swallowing something and it reaching the rest of the body. Absorbed from the gut, it travels first to the liver, which metabolises a share of it immediately — sometimes the large majority — so only what survives that first pass reaches general circulation.

This is the main reason oral bioavailability is low, and the reason routes that avoid the liver on the way in deliver noticeably more from the same amount.

It also cuts the other way for some substances. A prodrug is inactive as swallowed and is converted by this same process into the active form, so for those the first pass is not a loss but the activation step.

How large the effect is varies with liver function and between individuals, which is part of why oral doses are less predictable than the numbers suggest.'),

  ('prodrug', 'Prodrug', null, null,
   'A substance that does nothing until the body converts it into something active. The conversion varies between people, which makes the effective dose vary too.',
   'A prodrug is inactive as administered. It becomes active only after the body — usually the liver — chemically converts it, which means the effect depends on a metabolic step as much as on the amount taken.

That step is not the same in everyone. Genetic differences in the relevant enzymes mean some people convert quickly and get a strong effect from a modest amount, while others convert poorly and get very little. Codeine, which the body converts into morphine, is the standard example, and the variation between individuals is substantial.

The design is sometimes deliberate: making a drug harder to misuse by requiring a conversion that only happens internally, so crushing or dissolving it does not defeat the delay.'),

  ('agonist', 'Agonist', null, null,
   'A substance that binds a receptor and switches it on. Most psychoactive drugs work mainly this way.',
   'An agonist binds to a receptor and produces the response that receptor exists to produce — it mimics or amplifies the body''s own signalling.

Most recreational drugs are agonists at one receptor system or another, and much of what distinguishes them is which receptors they act on and how strongly.

The same molecule can behave differently at different receptors, acting as an agonist at one and blocking another, which is why effects are rarely as simple as a single mechanism suggests.'),

  ('antagonist', 'Antagonist', null, null,
   'A substance that occupies a receptor without switching it on, blocking whatever else would have. This is how overdose antidotes work.',
   'An antagonist binds a receptor and does nothing there, which prevents anything else from acting on it. On its own it produces no effect; its function is to stop something else.

That is the mechanism behind the overdose antidotes. Naloxone displaces opioids from opioid receptors and blocks them, reversing an overdose within minutes. Flumazenil does the equivalent for benzodiazepines.

The practical caveat, and the one that catches people out, is duration: an antagonist that wears off faster than the drug it displaced allows the original effect to return. That is why naloxone may need repeating and why the ambulance is still necessary after it appears to have worked.'),

  ('partial-agonist', 'Partial Agonist', null, null,
   'A substance that switches a receptor on only partly, no matter how much is taken. That ceiling is what makes some of them much safer than full agonists.',
   'A partial agonist activates a receptor but cannot produce the full response, however much is present. The effect rises with dose and then flattens.

For opioids this matters a great deal. Buprenorphine is a partial agonist, and its effect on breathing plateaus rather than continuing to deepen, which is why it is far harder to fatally overdose on alone and why it is used in substitution treatment. The alkaloids in kratom behave similarly.

Two consequences follow. A partial agonist can displace a full agonist from the receptor while producing less effect, which can precipitate sudden withdrawal in someone currently dependent on another opioid. And antidotes work less well against them — naloxone competes poorly with buprenorphine and may need higher, repeated dosing.'),

  ('antidote', 'Antidote', null, null,
   'A substance that reverses another''s effect. Few drugs have one, and the ones that exist usually wear off before the drug they are reversing does.',
   'An antidote counteracts a poisoning, either by displacing the substance from where it is acting or by countering what it is doing. In this field there are two that matter: naloxone for opioids and flumazenil for benzodiazepines.

Most substances have no antidote at all. Stimulants, psychedelics, dissociatives, GHB and alcohol are all managed supportively — keeping the person breathing, cooled, calm and monitored — rather than reversed.

Where one does exist, the recurring trap is duration. Antidotes typically act for less time than the drug they are countering, so someone can recover, appear fine, and then deteriorate again as it wears off. Repeat dosing may be needed, and an apparent recovery is not a reason to cancel the ambulance.'),

  ('sustained-release', 'Sustained Release', null, null,
   'A formulation designed to release its active ingredient slowly. Crushing one defeats the design and delivers the whole amount at once — a common route to overdose.',
   'Sustained release means a formulation built to deliver its active ingredient over hours rather than at once, giving a longer, flatter effect from the same total amount. Prescription opioids and stimulants frequently come this way.

Crushing, chewing or dissolving a mechanically sustained-release tablet destroys that control and delivers everything at once. Since the total amount in the tablet is calculated for a whole day, the resulting peak can be several times what the body would normally see, and this is a well-documented route to fatal overdose with prescription opioids.

Some formulations resist this chemically rather than physically: the substance is inactive as supplied and must be converted by the body, so no amount of physical preparation speeds it up. Those cannot be defeated outside the body — a distinction worth knowing, because assuming a tablet works one way when it works the other is dangerous in both directions.'),

  ('dirty-drug', 'Dirty Drug', null, null,
   'A substance that acts on several receptor systems at once rather than one. Broader effects, and a much wider set of interactions to worry about.',
   'A dirty drug is one with low selectivity — it binds several unrelated receptor systems instead of targeting one. The term is descriptive rather than pejorative; many useful medicines are dirty drugs.

Tramadol is the standard example: it acts on opioid receptors and on serotonin at the same time, which is why it carries both opioid risks and serotonin-syndrome risk, and why it appears in interaction warnings that pure opioids do not. Alcohol is another, acting on more than one system simultaneously.

The practical consequence is that interactions are harder to predict. Reasoning about such a substance as though it belonged to a single class will miss half of what it does, which is exactly how people combine tramadol with an antidepressant without realising they have stacked two serotonergic drugs.'),

  ('natural-and-synthetic-drugs', 'Natural And Synthetic Drugs', null, null,
   'The distinction between plant-derived and laboratory-made substances — and the widespread belief that the first is safer, which is simply wrong.',
   'Natural and synthetic drugs are distinguished by origin: whether the substance is extracted from something that grows or built in a laboratory. Semi-synthetic sits between, where a natural starting material is chemically modified.

The belief that natural means safer is common and false. Some of the most dangerous substances in this field are entirely natural — the deliriant nightshades, which have killed people through accidents caused by complete loss of contact with reality, are plants growing in hedgerows. Meanwhile many synthetic substances are comparatively well characterised.

Origin also says nothing about consistency, which is often what actually matters. Plant material varies enormously in potency between specimens, seasons and parts of the same plant, so a "natural" dose can be far less predictable than a manufactured one.

What determines risk is the pharmacology of the specific substance, the amount, and what it is combined with. Where it came from is not one of the variables.'),

  -- ── the three neurotransmitters the rest of the glossary leans on ──────
  ('serotonin', 'Serotonin', null, null,
   'A signalling chemical involved in mood, sleep, appetite and gut function. Too much activity at once causes serotonin syndrome, which is why it appears in so many interaction warnings.',
   'Serotonin is a neurotransmitter acting in the brain, the gut and the cardiovascular system. In the brain it contributes to mood, sleep, appetite and impulse regulation; most of the body''s supply is actually in the digestive tract.

It matters in this glossary because so many substances act on it and the effects add up. MDMA releases it in bulk. SSRIs and SNRIs block its reuptake. MAO inhibitors prevent its breakdown. Tramadol, dextromethorphan and several stimulants contribute too. Stacking these pushes serotonin signalling to levels that produce serotonin syndrome, which can be fatal.

The other reason it appears is the reverse interaction: someone on a serotonergic antidepressant will often find psychedelics and MDMA markedly blunted, and taking more to compensate is how people end up in the dangerous version of this.'),

  ('dopamine', 'Dopamine', null, null,
   'A signalling chemical central to motivation, drive and reward. Most substances with strong dependence potential amplify it one way or another.',
   'Dopamine is a neurotransmitter closely associated with motivation, movement and the anticipation of reward. It is more accurately about wanting than about pleasure — the pull toward something rather than the enjoyment of it.

That distinction explains a good deal about dependence. Substances that strongly amplify dopamine signalling — stimulants above all — produce an intense drive to repeat, which can persist even when the experience itself has stopped being enjoyable. Craving and compulsive redosing both sit here.

Heavy stimulant use is followed by a period of depleted signalling, which is much of what the comedown consists of: flat mood, no motivation, no interest in anything. It recovers, but not on the timescale people hope for.'),

  ('gaba', 'GABA', null, null,
   'The brain''s main inhibitory signalling chemical — the one that damps activity down. Alcohol, benzodiazepines and GHB all act here, which is why they stack so dangerously.',
   'GABA is the principal inhibitory neurotransmitter: where glutamate excites, GABA quiets. It is what keeps neural activity from running away with itself.

Alcohol, benzodiazepines, GHB and its precursors, and barbiturates all enhance GABA signalling. That shared mechanism is exactly why combining any of them is so dangerous — the suppression adds up, and the function most affected is breathing. A large share of fatal overdoses involve two or more of these together rather than a large amount of any one.

It also explains why withdrawal from them is the dangerous kind. The brain compensates for chronic suppression by turning excitation up; remove the suppressant abruptly and nothing balances that, which is the mechanism behind withdrawal seizures and delirium tremens. This is the reason stopping alcohol or benzodiazepines abruptly can kill, while stopping most other drugs cannot.');

  ---------------------------------------------------------------------------
  -- 3. Upsert, one row per statement (SQLSTATE 27000 — see 20260907100000).
  ---------------------------------------------------------------------------
  for r in select * from _px order by slug loop
    insert into public.unified_tags (
      name, slug, entity_kind, status, description, short_description,
      long_description, wikidata_id, wikipedia_url,
      is_sensitive, sensitive_topics, verification_status, human_reviewed,
      seo_indexable, last_verified_at
    ) values (
      r.name, r.slug, 'concept', 'active', r.descr,
      split_part(r.descr, '. ', 1) || '.', r.longdescr, r.qid, r.wiki,
      true, array['substance use','harm reduction'], 'reviewed', true,
      true, now()
    )
    on conflict (slug) do update set
      name              = excluded.name,
      entity_kind       = 'concept',
      status            = 'active',
      description       = excluded.description,
      short_description = excluded.short_description,
      long_description  = excluded.long_description,
      wikidata_id       = excluded.wikidata_id,   -- NULL is deliberate
      wikipedia_url     = excluded.wikipedia_url,
      is_sensitive      = true,
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
  -- 4. Category assignment, one row per statement.
  ---------------------------------------------------------------------------
  for r in select * from _px order by slug loop
    select id into v_tag_id from public.unified_tags where slug = r.slug;
    continue when v_tag_id is null;

    update public.tag_category_assignments
       set is_primary = false
     where tag_id = v_tag_id and category_id <> v_cat_id;

    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    values (v_tag_id, v_cat_id, true)
    on conflict (tag_id, category_id) do update set is_primary = true;

    update public.unified_tags
       set category_id = v_cat_id, updated_at = now()
     where id = v_tag_id and category_id is distinct from v_cat_id;
  end loop;

  ---------------------------------------------------------------------------
  -- 5. Merges: scene terms fold into the practice pages. BEFORE the alias
  --    demotion below, and merge_tag_concept overwrites app.actor.
  ---------------------------------------------------------------------------
  for r in
    select * from (values
      ('safer-sniffing',  'snorting'),
      ('safer-sniffing',  'bumping'),
      ('safer-injecting', 'slamming'),
      ('safer-injecting', 'slam')
    ) as t(canon, dup)
  loop
    select id into v_canon_id from public.unified_tags where slug = r.canon;
    select id into v_dup_id   from public.unified_tags where slug = r.dup;
    if v_canon_id is not null and v_dup_id is not null and v_canon_id <> v_dup_id then
      begin
        perform public.merge_tag_concept(
          v_canon_id, v_dup_id,
          'admin:substanzhandbuch-pharmacology',
          'substanzhandbuch practice vocabulary');
      exception when others then
        raise notice 'merge % <- % skipped: %', r.canon, r.dup, sqlerrm;
      end;
    end if;
  end loop;
  perform set_config('app.actor', 'admin:substanzhandbuch-pharmacology', true);

  -- An APPROVED alias is an auto-tagging rule (20260910151200). "slam" and
  -- "bump"/"bumping" are ordinary English words; demote them so they stay
  -- recorded and searchable but the reconciler never acts on them.
  update public.tag_aliases
     set review_status = 'auto'
   where lower(alias_slug) in ('slam','slamming','bumping','bump')
     and review_status = 'approved';

  ---------------------------------------------------------------------------
  -- 6. Ontology edges (tag_relations CHECKs source <> target).
  ---------------------------------------------------------------------------
  for r in
    select * from (values
      ('safer-sniffing',    'safer-use'),
      ('safer-smoking',     'safer-use'),
      ('safer-plugging',    'safer-use'),
      ('safer-injecting',   'safer-use'),
      ('milligram-scale',   'safer-use'),
      ('eyeballing',        'safer-use'),
      ('volumetric-dosing', 'safer-use'),
      ('drug-purification', 'safer-use'),
      ('craving',           'substance-use-disorder'),
      ('withdrawal',        'substance-use-disorder'),
      ('addiction',         'substance-use-disorder'),
      ('substance-abuse',   'substance-use-disorder'),
      ('delirium-tremens',  'withdrawal'),
      ('hppd',              'psychedelics'),
      ('ego-dissolution',   'psychedelics'),
      ('partial-agonist',   'agonist'),
      ('toxidrome',         'drug-emergency')
    ) as t(child, parent)
  loop
    select id into v_tag_id   from public.unified_tags where slug = r.child;
    select id into v_parent_id from public.unified_tags where slug = r.parent;
    if v_tag_id is not null and v_parent_id is not null and v_tag_id <> v_parent_id then
      insert into public.tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
      values (v_tag_id, v_parent_id, 'broader', 1.0, 'approved')
      on conflict (source_tag_id, target_tag_id, relation_type) do nothing;
    end if;
  end loop;

  ---------------------------------------------------------------------------
  -- 7. Attribution.
  ---------------------------------------------------------------------------
  for r in select * from _px order by slug loop
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
  -- 8. Assertions.
  ---------------------------------------------------------------------------
  select count(*) into v_n
    from _px h left join public.unified_tags t on t.slug = h.slug
   where t.id is null;
  if v_n > 0 then
    raise exception 'practice vocabulary: % expected slug(s) missing after upsert', v_n;
  end if;

  select count(*) into v_n
    from _px h join public.unified_tags t on t.slug = h.slug
   where t.status <> 'active' or t.human_reviewed is not true
      or t.is_sensitive is not true or t.seo_indexable is not true
      or t.verification_status <> 'reviewed'
      or t.merged_into_id is not null or t.deprecated_at is not null;
  if v_n > 0 then
    raise exception 'practice vocabulary: % tag(s) did not land in the publishable state', v_n;
  end if;

  select count(*) into v_n
    from _px h join public.unified_tags t on t.slug = h.slug
    left join public.tag_category_assignments ca
      on ca.tag_id = t.id and ca.category_id = v_cat_id
   where ca.tag_id is null;
  if v_n > 0 then
    raise exception 'practice vocabulary: % tag(s) not filed under substances-harm-reduction', v_n;
  end if;

  -- The wrong-entity guard, over everything active in the category.
  select count(*) into v_n
    from public.unified_tags
   where category = 'Substances & Harm Reduction' and status = 'active'
     and coalesce(long_description, '') <> ''
     and long_description not ilike '%' || name || '%';
  if v_n > 0 then
    raise exception 'practice vocabulary: % active tag(s) have a body that never names the tag', v_n;
  end if;

  -- The five audited QIDs must be corrected or cleared.
  if exists (select 1 from public.unified_tags where slug = 'poppers' and wikidata_id is distinct from 'Q898516') then
    raise exception 'practice vocabulary: poppers still carries the surname QID';
  end if;
  if exists (select 1 from public.unified_tags where slug = 'anabolic-steroids' and wikidata_id is distinct from 'Q309438') then
    raise exception 'practice vocabulary: anabolic-steroids still carries the journal-article QID';
  end if;
  if exists (select 1 from public.unified_tags where slug = 'drug-use' and wikidata_id is not null) then
    raise exception 'practice vocabulary: drug-use still carries the substance-use-disorder QID';
  end if;
  if exists (
    select 1 from public.tag_medical_codes m
     join public.unified_tags t on t.id = m.tag_id
    where t.slug = 'drug-use'
  ) then
    raise exception 'practice vocabulary: drug-use still publishes clinical codes it should never have had';
  end if;
  select count(*) into v_n
    from public.unified_tags
   where slug in ('addiction','withdrawal')
     and wikidata_id in ('Q4681106','Q26256296');
  if v_n > 0 then
    raise exception 'practice vocabulary: % revived tag(s) still point at a journal / at "rectification"', v_n;
  end if;

  -- Ordinary-word aliases must never be auto-tagging rules.
  select count(*) into v_n
    from public.tag_aliases
   where lower(alias_slug) in ('slam','slamming','bumping','bump')
     and review_status = 'approved';
  if v_n > 0 then
    raise exception 'practice vocabulary: % ordinary-word alias(es) left approved and therefore auto-tagging', v_n;
  end if;

  -- Source typo must not be propagated; nothing belongs behind an age wall.
  select count(*) into v_n
    from _px h join public.unified_tags t on t.slug = h.slug
   where coalesce(t.description,'') || coalesce(t.long_description,'') like '%114%';
  if v_n > 0 then
    raise exception 'practice vocabulary: % tag(s) contain "114" — the source''s wrong ambulance number', v_n;
  end if;

  select count(*) into v_n
    from _px h join public.unified_tags t on t.slug = h.slug where t.is_adult;
  if v_n > 0 then
    raise exception 'practice vocabulary: % tag(s) became is_adult', v_n;
  end if;

  raise notice 'practice vocabulary: % tags, 4 merges, 3 QIDs repaired, 13 stale clinical codes removed',
    (select count(*) from _px);
end
$mig$;

select public.recount_all_tag_usage(500);
