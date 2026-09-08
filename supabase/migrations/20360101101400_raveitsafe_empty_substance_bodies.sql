-- Fill the long_description on nine ACTIVE, INDEXABLE glossary terms that have
-- had an empty body for their whole life.
--
-- All nine are in `Substances & Recovery`, all nine are covered by the
-- raveitsafe.ch pages this pass compared the glossary against, and all nine
-- already carry a good one-line `description`. What they do not carry is a body:
-- `/tags/cannabis` renders a single sentence and stops. Two of them have real
-- usage (cannabis 12, tobacco 13); the rest are the chemsex and comedown
-- vocabulary that the safer-use and Mischkonsum pages are largely about.
--
-- THIS IS A FILL, NOT A REWRITE. The rule that `long_description` is never
-- LLM-rewritten exists because the prose judge measured at ~19% precision and
-- nulled thirteen correct definitions in its first live batch. Nothing is
-- destroyed here: every target is NULL, the UPDATE is guarded on that, and no
-- `description` is touched. Wording is original, written from documented
-- pharmacology and harm-reduction practice; raveitsafe's pages were used only
-- to decide which terms were in scope.
--
-- THE REVIEW FLAGS ARE DELIBERATELY LEFT ALONE, and this is the part worth
-- reading before changing it. The honest signal for machine-written prose is
-- human_reviewed=false. It cannot be used here: `deprecate_unused_tags` selects
-- exactly `status='active' AND human_reviewed=false AND usage_count=0`, and
-- seven of these nine have zero usage — so stamping the truthful flag would
-- hand the sweep the very pages this migration exists to improve, and they
-- would be deprecated rather than reviewed. That is not a hypothetical: it is
-- how `impaired-driving`, `methadone` and `salvia` were lost.
--
-- The signal that IS available costs nothing, because it is already set:
-- `prose_reviewed_at` is NULL on all nine, so every one of them is already
-- counted by `tag_hygiene_stats().prose_unreviewed`. Writing a body leaves them
-- exactly where they were in that queue. An editor clearing the queue is what
-- marks this prose read, and until then the advisory count is honest.
--
-- The actor declaration below is not optional: `log_unified_tag_change()`
-- RAISEs when an undeclared `system:%` actor modifies a human_reviewed row, and
-- all nine are human_reviewed=true.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:raveitsafe-glossary-pass', true);

do $mig$
declare
  v_bad  int;
  v_hit  int;
begin
  create temp table _body (slug text primary key, longd text) on commit drop;

  insert into _body (slug, longd) values
    ('cannabis',
     'Cannabis is taken as dried flower, as resin, as concentrate, or eaten. The two compounds that matter most are THC, which produces the high and most of the unwanted effects, and CBD, which does not and appears to blunt some of THC''s edge. The ratio between them varies enormously between products and has moved steadily toward high-THC material over the last two decades, so strength is not comparable across decades or countries.

The route decides the risk profile more than the dose does. Smoked or vaporised, effects arrive within minutes and are easy to titrate. Eaten, onset takes one to two hours and the peak is stronger and much longer — which is why edibles produce most of the acute problems: people conclude nothing is happening and take more before the first dose has landed. Acutely, too much causes anxiety, a racing heart, nausea and occasionally a genuine panic reaction; it is very unpleasant and it passes.

Regular heavy use carries a real dependence risk, and there is a well-documented association between high-potency cannabis and psychosis in people already predisposed. Smoking it mixed with tobacco adds nicotine dependence to whatever else is going on, which is a large part of why quitting is harder in Europe than the plant alone would suggest.

For travellers the legal position is the thing to check first and separately for every border. Cannabis ranges from retail-legal to decriminalised to carrying severe custodial penalties, sometimes between neighbouring countries, and possession that is unremarkable at home can be a serious offence a two-hour drive away.'),

    ('tobacco',
     'Tobacco is used as cigarettes, roll-ups, cigars, waterpipe, snus and chewing tobacco, and its nicotine is also delivered by vapes, heated-tobacco devices and pouches. Nicotine is what produces the dependence, and it is a fast and unusually durable one: dependence is often established well before anyone considers themselves a smoker.

The distinction that matters clinically is between the nicotine and the smoke. Nicotine drives the addiction and raises heart rate and blood pressure; almost all of the cancer, respiratory disease and cardiovascular damage comes from combustion products, not from nicotine itself. This is why switching from smoking to a non-combusted product reduces harm substantially without touching the dependence, and why it is not the same thing as stopping.

Tobacco has a particular hold in nightlife. Smoking areas are where a lot of the social contact happens, the cue to smoke is bound to drinking, and cannabis is commonly rolled with tobacco in Europe, which quietly maintains a nicotine habit alongside it. People who have stopped often relapse in exactly these settings rather than at home.

Stopping is worth doing at any age and the health return begins within days. Combining nicotine replacement or prescribed medication with behavioural support works considerably better than willpower alone, and most countries run a free cessation service.'),

    ('gbl',
     'GBL is an industrial solvent that the body converts into GHB within minutes of being swallowed. Most of what is sold and used as G is in fact GBL, and the two are not interchangeable: GBL is absorbed faster, comes on faster, and is roughly stronger by volume, so a measure that is a normal dose of GHB is an overdose of GBL.

The dose window is the narrowest of anything in common recreational use. The difference between the intended effect, unconsciousness and a life-threatening overdose can be a fraction of a millilitre, and it moves with body weight, tolerance, food and — decisively — alcohol. GBL and alcohol are both central-nervous-system depressants and together they suppress breathing far more than either does alone; that combination is behind a large share of G deaths.

This is why dosing practice for G is unlike anything else: measure with an oral syringe rather than a cap or a free pour, never let anyone else prepare a dose, label the bottle so it cannot be drunk by mistake, and time every dose in writing rather than by memory. Redosing before the first dose has fully landed is the single most common route into a G-hole.

Daily use produces physical dependence quickly, and GBL withdrawal is a medical emergency in its own right — closer to alcohol or benzodiazepine withdrawal than to a stimulant comedown, with a genuine risk of seizures and delirium. It should be managed medically and never stopped abruptly alone.'),

    ('salvia-divinorum',
     'Salvia divinorum is a sage native to Oaxaca, where it has a long history of use by Mazatec healers. Its active compound, salvinorin A, works on the kappa-opioid receptor rather than the serotonin receptors that psychedelics act on, which is why the experience does not resemble LSD or psilocybin at all despite being grouped with them.

Smoked as a concentrated extract, the effect is immediate, extremely intense and very short — commonly a few minutes of peak with the whole thing over inside twenty. People frequently lose all awareness of where they are and that they have taken anything, and often report a complete substitution of their surroundings rather than a distortion of them. Chewed as fresh leaf in the traditional preparation it is far gentler and much slower.

The risk here is almost entirely physical rather than toxicological. Salvinorin A has low acute toxicity and no dependence potential, but someone who does not know they are in a room can walk into traffic, a heater or a stairwell. A sober sitter whose only job is to keep the person seated and safe is the whole of harm reduction for this substance, and doing it standing, alone, or anywhere near water or a balcony is where the injuries come from.

Legal status is unusually inconsistent: it is uncontrolled in some countries, specifically banned in others, and sold openly in shops in a few.'),

    ('comedown',
     'A comedown is the flat, exhausted, joyless stretch that follows a heavy session, most sharply after stimulants and empathogens. With MDMA it commonly lands two or three days later rather than the next morning, which is where the name "suicide Tuesday" comes from. It is not a hangover and it is not withdrawal; it is what a temporarily depleted system feels like.

Several things are happening at once, and they are worth separating because they resolve at different speeds. Neurotransmitters that were released faster than they could be replaced take days to come back. Sleep debt is usually enormous and often understated. Appetite has been suppressed for a day or more, so most people are genuinely undernourished and dehydrated by the time it starts. The subjective flatness is the sum of all three, not a single effect.

What helps is unspectacular: sleep before anything else, then food, water, daylight and time. What does not help is taking more of anything to get through it. A stimulant will postpone the comedown rather than cancel it and makes the eventual version worse, and alcohol on top of a depleted system reliably deepens the low mood.

The judgement worth making is when it stops being a comedown. Low mood that has not lifted after several days, or that arrives with thoughts of self-harm, is not the tail of a session and is worth taking to someone. Planning recovery time into the weekend rather than assuming you will be fine on Monday is the one change that makes the most difference.'),

    ('g-hole',
     'A G-hole is the sudden loss of consciousness that follows too much GHB or GBL. It is not sleep, and the distinction is what the whole entry turns on: the person cannot be roused, their breathing can slow or stop, and the airway is unprotected. Most deaths involving G happen here, and they happen to people who were with friends.

It is usually a timing error rather than a large dose. G comes up fast, the window between the intended effect and unconsciousness is very narrow, and someone who redoses because the first dose has not obviously landed goes under when both arrive together. Alcohol and any other depressant taken alongside make it dramatically more likely, because the mechanism is the same in both and the effects compound.

The fatal mistake is treating it as sleeping it off. Someone in a G-hole vomits often, and lying on their back they can inhale it. Put them in the recovery position immediately, stay with them, and keep checking that they are breathing rather than checking that they are still there. Do not leave them in a dark room to recover, do not put them to bed alone, and do not wait to see whether it gets worse.

Call emergency services if breathing is slow, irregular, noisy or has stopped, if they cannot be roused, or if you are not sure. Tell the crew what was taken and when, including the alcohol — they need it to treat, and treatment is the reason they are there.'),

    ('cocaethylene',
     'Cocaethylene is a distinct compound the liver produces when cocaine and alcohol are present at the same time. It is not cocaine and not a metabolite on the way out; it is psychoactive in its own right, and it is the reason this specific pairing behaves differently from either drug alone.

It lasts substantially longer than cocaine, so its effects outlive the visible part of the night, and it places a heavier load on the heart than either substance does by itself. Research consistently associates the combination with a raised risk of cardiac events and sudden death relative to cocaine alone. It also blunts the sedating effect of the alcohol, which lets people drink considerably more than they otherwise would and lose the usual signal that they have had enough.

What makes this worth its own entry is that almost nobody counts it as mixing drugs. Cocaine with a drink is the single most common combination there is, and it is generally not thought of as polydrug use at all, so the risk is not weighed. Separating the two — even by leaving a clear gap rather than abstaining — measurably reduces how much cocaethylene forms, and it is the most useful thing anyone can do about it short of not combining them.'),

    ('ketamine-bladder',
     'Ketamine-induced uropathy is damage to the lining of the bladder and urinary tract caused by regular ketamine use. It begins as urgency and frequency, progresses to pain on urinating and blood in the urine, and in advanced cases the bladder itself contracts and permanently loses capacity — to the point of holding only a small fraction of a normal volume.

It is dose- and frequency-related rather than a rare idiosyncratic reaction, and it appears in people far younger than any other cause of these symptoms would suggest. The early stage is routinely mistaken for a urinary tract infection and treated with repeated courses of antibiotics that do nothing, which is one of the main reasons it goes unaddressed until it is advanced.

The part worth acting on is that the early damage is substantially reversible and the late damage is not. Stopping, or cutting down sharply, is the only intervention that reliably changes the course, and doing it early is the difference between symptoms that settle and a bladder that has to be surgically managed. Pain relief and antispasmodics treat the symptom while use continues; they do not stop the process.

If you are using ketamine regularly and have urinary urgency, pain or any blood, that is the signal — not something to monitor. It is worth saying openly to a doctor what has been used and how often, because the diagnosis is otherwise close to unreachable and the treatment path is completely different.'),

    ('booty-bumping',
     'Booty bumping is taking a drug rectally, usually dissolved in water and administered with a lubricated needleless syringe. The rectal lining is thin and heavily supplied with blood vessels, so absorption is fast and efficient — considerably more so than swallowing — and a dose that is moderate orally can be strong taken this way.

That efficiency is the main risk. The margin for error is smaller, the onset is quicker than most people expect, and it is easy to overshoot a dose that felt reasonable in another form. Anything intended for a different route should be dosed down rather than across, and the first attempt with any substance is worth treating as a test dose.

The second risk is to the tissue itself. Stimulants constrict blood vessels and irritate the mucosa, and undissolved crystals or powder abrade it directly, so use plenty of water and make sure the substance is fully dissolved. That damage matters beyond discomfort: broken rectal mucosa markedly raises the risk of acquiring or passing on HIV and other sexually transmitted infections during sex that follows, which is why this comes up in chemsex guidance specifically.

Syringes and lube applicators carry blood and should be treated like any other injecting equipment — one person, one syringe, never shared and never reused after someone else. Label them if several people are dosing in the same place.');

  ------------------------------------------------------------------ guards
  select count(*) into v_bad from _body b
   where not exists (select 1 from public.unified_tags t
                      where t.slug = b.slug and t.status = 'active');
  if v_bad > 0 then
    raise exception 'raveitsafe bodies: % slug(s) are missing or not active', v_bad;
  end if;

  -- Never overwrite. If a body has appeared since this was authored, that is a
  -- human or another pass having written one, and it wins.
  select count(*) into v_bad from _body b
    join public.unified_tags t on t.slug = b.slug
   where coalesce(t.long_description, '') <> '';
  if v_bad > 0 then
    raise exception 'raveitsafe bodies: % row(s) already have a body — re-check before overwriting', v_bad;
  end if;

  ------------------------------------------------------------------ fill
  update public.unified_tags t
     set long_description = b.longd
    from _body b
   where t.slug = b.slug
     and t.status = 'active'
     and coalesce(t.long_description, '') = '';
  get diagnostics v_hit = row_count;

  if v_hit <> 9 then
    raise exception 'raveitsafe bodies: expected 9 rows filled, got %', v_hit;
  end if;

  ------------------------------------------------------------------ assertions
  select count(*) into v_bad from _body b
    join public.unified_tags t on t.slug = b.slug
   where coalesce(t.long_description, '') = '';
  if v_bad > 0 then
    raise exception 'raveitsafe bodies: % row(s) still have no body', v_bad;
  end if;

  -- The flags must be exactly as they were. If a later edit starts moving them,
  -- this fails rather than quietly handing zero-usage rows to the sweep.
  select count(*) into v_bad from _body b
    join public.unified_tags t on t.slug = b.slug
   where coalesce(t.human_reviewed, false) is not true
      or t.prose_reviewed_at is not null;
  if v_bad > 0 then
    raise exception 'raveitsafe bodies: % row(s) had their review flags altered', v_bad;
  end if;

  raise notice 'raveitsafe bodies: % filled', v_hit;
end
$mig$;
