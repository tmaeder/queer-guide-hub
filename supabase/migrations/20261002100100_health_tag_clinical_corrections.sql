-- Clinical claims in the tag glossary, checked against the labels and the
-- literature, and corrected where they were wrong, stale or overstated.
--
-- WHAT THIS IS NOT. It is not a rewrite of the harm-reduction voice. The
-- hand-written `description` on the substance tags is good and mostly survives
-- untouched. What is replaced is (a) auto-generated `long_description` prose
-- that is factually wrong, and (b) three specific `description` claims that a
-- source contradicts.
--
-- ── Corrections where the stored claim was WRONG ──────────────────────────
--
-- ESTRADIOL described 17-ALPHA-estradiol — the weak endogenous C17 epimer,
-- explicitly characterised in the literature as non-feminizing — on a page
-- about gender-affirming care. Clinical estradiol is the 17-BETA isomer; the
-- FDA label names the drug substance "estra-1,3,5(10)-triene-3, 17β-diol".
-- The old text's "approximately 100-fold lower estrogenic potency" is NOT
-- reproduced: the multiplier is assay-dependent (~4-5x weaker by receptor
-- binding, >200-fold weaker as in vivo hormonal activity), so the corrected
-- text states the direction and declines to invent a constant.
--
-- PAXIL described *Paxillus*, a genus of poisonous mushrooms. Paroxetine is an
-- SSRI. Same title-collision mechanism as the journal chimeras repaired in the
-- previous migration.
--
-- DESCOVY was described as a treatment for chronic hepatitis B. It is not
-- indicated for hepatitis B. The confusion is traceable: its label carries a
-- BOXED WARNING about post-treatment HBV exacerbation, because the drug is
-- active against HBV without being approved to treat it. The corrected text
-- says exactly that, because the boxed warning is the clinically useful fact.
--
-- NALOXONE said effects "last 30 to 90 minutes". That is the SERUM HALF-LIFE
-- (label: "30 to 81 minutes (mean 64 +/- 12 minutes)"), not a duration of
-- action, and no FDA label states a 30-90 minute duration. Worse, the sentence
-- reads as reassurance when the labelled fact points the other way: NARCAN's
-- own Warnings section says the duration of most opioids MAY EXCEED that of
-- naloxone, so breathing can stop again after an apparent recovery. That is now
-- what the entry leads with, because it is the part that changes what a
-- bystander does after the person wakes up.
--
-- TESTOSTERONE asserted that low testosterone "can lead to frailty, anxiety,
-- and depression". That is an association presented as causation, controlled
-- trials generally fail to show an antidepressant effect, and it is the exact
-- framing used to market testosterone. It is also about cis men with
-- hypogonadism, which is not what this tag is used for here.
--
-- COTTON FEVER asserted Pantoea agglomerans endotoxin as the cause. It is the
-- leading of three competing hypotheses, resting on a single 1993 case report
-- whose own wording is "unknown etiology ... with most probability"; the
-- endotoxin theory's known weakness is that the bacteraemia is usually absent
-- in affected patients. Stated as a hypothesis now, with the corollary that
-- actually matters: the presentation is indistinguishable from sepsis and
-- endocarditis, so self-diagnosis is the danger.
--
-- ── Corrections where the stored claim was OVERSTATED ─────────────────────
--
-- SYPHILIS said "Antibiotics cure it at every stage". Penicillin does eradicate
-- the infection at any stage and halt progression, but it does not reverse
-- damage already done — established cardiovascular and neurological injury is
-- permanent — and benzathine penicillin does not reach treponemicidal levels in
-- CSF, so neurosyphilis needs IV therapy. "Cured at every stage" invites a
-- reader to treat late diagnosis as equivalent to early diagnosis.
--
-- GENITAL HERPES said the infection is "typically caused by HSV type 2". That
-- is now out of date for the population this site serves: in high-income
-- countries HSV-1, usually acquired through oral sex, has overtaken HSV-2 as
-- the leading cause of FIRST-EPISODE genital herpes, while HSV-2 still causes
-- most RECURRENT disease. The distinction is not pedantic — HSV-1 genital
-- infection recurs far less often, which is the prognosis a newly diagnosed
-- person is actually asking about.
--
-- HIV stated "the average survival time after infection is estimated to be 9 to
-- 11 years" with no time frame. That is a PRE-ART figure (Morgan, AIDS 2002,
-- median 9.8 years) presented as if it described HIV now. It is kept and dated,
-- rather than deleted, because removing it leaves the page silent on what
-- untreated infection does — and paired with the current figure: in a
-- 206,891-person cohort analysis (Trickey, Lancet HIV 2023) a 40-year-old
-- starting treatment after 2015 with CD4 >= 500 had about 42 years remaining.
--
-- ── The nitrite gap ───────────────────────────────────────────────────────
--
-- Six PDE5 tags carried an auto-generated paragraph and NOT ONE of them
-- mentioned nitrates. Three of them said the drug was "not directly related to
-- LGBTQ+ travel or community" — on a platform whose readers use poppers. The
-- contraindication is absolute and label-stated on all four molecules.
--
-- TWO THINGS THE COMMON RETELLING GETS WRONG, both checked on the labels:
--
--   1. "Wait 24 hours after Viagra before nitrates" is NOT in the label. The
--      sildenafil label says the opposite — "it is unknown when nitrates ... can
--      be safely administered" after a dose. The vardenafil label says the
--      interval "has not been determined." Only tadalafil (>= 48 hours) and
--      avanafil (>= 12 hours) state one. So the entries give an interval only
--      for the two drugs whose labels give an interval, and say plainly that
--      the other two do not.
--   2. Tadalafil's nitrate exclusion window (48 h) OUTLASTS its 36-hour
--      efficacy window. "Works for 36 hours" is widely repeated and is a
--      dangerous thing to stand next to a safety claim.
--
-- Also deliberately NOT claimed: that there is a body of published deaths from
-- poppers plus PDE5 inhibitors. There is not. The evidence is pharmacodynamic
-- (sildenafil plus nitroglycerin: an extra ~24 mmHg systolic fall), regulatory,
-- and one forensically attributed death in a UK series of 42 poppers deaths.
-- The entries say the interaction is mechanistically established and
-- contraindicated, which is true, rather than implying a body count that is not.
--
-- riociguat/vericiguat are added because they are a hard contraindication in
-- three of the four labels and are routinely omitted from popular summaries.

select set_config('app.actor', 'admin:health-tag-clinical-fix-20260828', true);

-- ── HIV ───────────────────────────────────────────────────────────────────

update public.unified_tags set long_description =
'HIV is a retrovirus that infects immune cells and, untreated, destroys them faster than the body replaces them, until infections and cancers it would normally control take hold. That late stage is what AIDS names.

Before effective treatment existed, median survival from infection was around ten years. That figure describes the era before antiretroviral therapy and nothing about the present. People diagnosed early and treated today have a life expectancy close to the general population''s: in a cohort study of 206,891 people, a 40-year-old starting treatment after 2015 with a CD4 count of at least 500 had roughly 42 years ahead. Late diagnosis is what still costs years, which is the whole argument for testing.

Sustained treatment also ends sexual transmission entirely — see U=U.'
where slug = 'hiv';

update public.unified_tags set long_description =
'Undetectable equals untransmittable is a statement about evidence, not a slogan.

Three prospective studies followed serodifferent couples having sex without condoms while the partner with HIV was on treatment with a viral load under 200 copies per millilitre. PARTNER (JAMA, 2016) recorded about 58,000 condomless acts across 888 couples. PARTNER2 (The Lancet, 2019) recorded 76,088 condomless anal sex acts across 782 gay couples. Opposites Attract (Lancet HIV, 2018) recorded 12,447 more. Across all three, the number of HIV transmissions linked to the partner on treatment was zero.

Two details are worth keeping straight. "Undetectable" in this evidence means a sustained viral load under 200 copies per millilitre, not literally zero. And the finding is about sex — it does not describe shared injecting equipment, and while treatment greatly reduces transmission in pregnancy and breastfeeding, it does not reduce it to zero there.'
where slug = 'u-equals-u';

-- ── STIs ──────────────────────────────────────────────────────────────────

update public.unified_tags
   set description =
'A bacterial infection that begins with a painless sore, easy to miss and itself highly infectious. A rash can follow weeks later. Penicillin eradicates the infection at any stage — but it does not undo damage already done, and untreated syphilis can cause permanent injury to the nervous system, heart and eyes. That is why early treatment matters, not just treatment.',
       long_description =
'Syphilis is caused by the bacterium Treponema pallidum. The first sign is usually a single firm, painless ulcer appearing around three weeks after exposure — the range is 10 to 90 days — which teems with bacteria and heals by itself in a few weeks while the infection continues. Because it does not hurt and is often internal, it is frequently never noticed at all.

Penicillin cures the infection at every stage. What it cannot do is reverse damage: established cardiovascular syphilis and neurosyphilis can leave permanent injury even after the bacteria are gone. Neurosyphilis also needs intravenous penicillin, because the standard long-acting intramuscular injection does not reach the central nervous system reliably.

Blood tests can still be negative when the first sore appears; they usually turn positive within two to three weeks of it, and a negative result is only conclusive at around twelve weeks.'
 where slug = 'syphilis';

update public.unified_tags
   set description =
'A common infection caused by herpes simplex virus, often with mild symptoms or none. When symptoms appear they can include painful blisters and flu-like illness, and outbreaks generally become milder over time. Which virus type you have matters for what happens next: HSV-1 genital infection recurs far less often than HSV-2.',
       long_description =
'Genital herpes is caused by either type of herpes simplex virus. HSV-2 has historically been the main cause and still accounts for most recurrent genital herpes. But in high-income countries HSV-1 — usually acquired through oral sex — has overtaken it as the leading cause of newly diagnosed first episodes, most markedly among young adults and men who have sex with men. The reason is demographic rather than behavioural: fewer people now acquire oral HSV-1 in childhood, so more reach their first sexual experiences without antibodies to it.

The distinction is the one a newly diagnosed person is actually asking about. Genital HSV-1 recurs considerably less often than genital HSV-2, so the type changes the prognosis even though the first episode can look the same.

Testing is done by swabbing a lesion, which means it is done when there is something to swab.'
 where slug = 'genital-herpes';

update public.unified_tags set long_description =
'Gonorrhoea is caused by Neisseria gonorrhoeae and infects the urethra, rectum and throat. Most rectal and throat infections cause nothing noticeable — in one cohort of men who have sex with men, 92% of throat infections were symptomless, and testing only the urethra would have missed roughly two-thirds of gonorrhoea infections. That is the argument for testing at every site of exposure rather than waiting for a symptom.

Ceftriaxone by injection is the treatment, on its own; the older practice of adding azithromycin has been dropped. The dose differs by country, so the number a clinic gives you may not match one you read elsewhere.

Resistance is the real concern. Strains resistant to ceftriaxone are documented internationally, which is why completing treatment and returning for a test of cure when asked are not formalities.'
where slug = 'gonorrhea';

update public.unified_tags set long_description =
'Hepatitis B is a virus that inflames the liver, sometimes briefly and sometimes for life. It passes through blood and through sex, and it is far more infectious by those routes than HIV: a single needlestick from a highly infectious source transmits hepatitis B in roughly a quarter to two-thirds of cases, hepatitis C in about 2%, and HIV in about 0.3%. It also survives outside the body for a week or more.

A safe vaccine has existed for decades and gives close to complete protection. It is part of routine childhood immunisation in many countries, which means many adults are already covered and do not know it — a blood test settles it.

Blood tests usually detect infection from about four weeks, with a practical window running to around three months.'
where slug = 'hepatitis-b';

update public.unified_tags set long_description =
'Hepatitis C damages the liver and spreads through blood. Sexual transmission is concentrated in specific circumstances rather than general — the associations documented among men who have sex with men are condomless receptive anal sex, fisting and shared fisting lubricant, rectal bleeding, group sex, and chemsex including injecting.

It commonly causes nothing at all for years, which is why it is found by testing rather than by feeling ill.

Modern direct-acting antivirals cure more than 95% of infections with eight to twelve weeks of tablets. Cure is not immunity: reinfection after clearance is common where the original exposure continues, so being cured once is not a reason to stop testing.

Antibody tests are generally reliable by about twelve weeks; after a recent high-risk exposure the right test is an RNA test, which detects the virus within one to two weeks.'
where slug = 'hepatitis-c';

-- ── Opioids and overdose ──────────────────────────────────────────────────

update public.unified_tags
   set description =
'A synthetic opioid roughly fifty to a hundred times more potent than morphine, used clinically for severe pain. Because an active dose is measured in micrograms, contamination of other drugs with fentanyl is a leading cause of fatal overdose.',
       long_description =
'Fentanyl is a synthetic opioid used medically for severe pain and as an anaesthetic. The FDA label puts 100 micrograms of injected fentanyl at roughly the analgesic equivalent of 10 milligrams of morphine; potency ratios quoted elsewhere range from fifty to a hundred times, because the ratio depends on route and on what is being measured.

The number matters less than its consequence: an active dose is measured in micrograms, so a quantity too small to see or to mix evenly is the difference between a dose and a death. That is why fentanyl contamination of powders sold as something else drives overdose deaths, and why test strips and drug checking exist.

It acts on mu-opioid receptors and suppresses breathing, like any opioid. Naloxone reverses it.'
 where slug = 'fentanyl';

update public.unified_tags set long_description =
'Naloxone is an opioid antagonist. It displaces opioids from their receptors and restores breathing, and it does nothing at all to someone who has not taken opioids — which is why giving it when unsure is the correct call.

Given intravenously it works within about two minutes; intramuscular, subcutaneous and nasal routes are slightly slower.

The fact worth knowing is not how fast it works but how long it lasts. Its effect can wear off before the opioid does, and the labels warn that breathing can fail again after an apparent recovery. Naloxone is therefore not the end of an overdose — call emergency services, stay with the person, and give further doses if breathing deteriorates again. Nasal doses can be repeated every two to three minutes, alternating nostrils.

It is supplied as an injection, an auto-injector and a nasal spray. In the United States the 4 mg nasal spray has been available without prescription since March 2023.'
where slug = 'naloxone';

update public.unified_tags set long_description =
'Cotton fever is an abrupt fever with chills, shaking and a racing heart, beginning within minutes to an hour of injecting and typically settling within a day. It is named for the cotton used to filter a solution.

The leading explanation is that it is a reaction to endotoxin from Pantoea agglomerans, a bacterium found on cotton — but this is a hypothesis, not an established cause. It rests largely on a single 1993 case report whose own conclusion was that the syndrome has unknown origin and that this organism is the probable agent, and its known weakness is that the bacteraemia it predicts is usually absent in affected patients. Two other explanations remain in the literature.

The practical point does not depend on which is right. Cotton fever is indistinguishable at the bedside from sepsis and from infective endocarditis, both of which kill. Deciding for yourself that a fever after injecting is "just cotton fever" is the actual danger.'
where slug = 'cotton-fever';

-- ── Hormones ──────────────────────────────────────────────────────────────

update public.unified_tags set long_description =
'The estradiol used in medicine — and in feminizing hormone therapy — is 17-beta-estradiol, the body''s principal estrogen. It is taken as tablets, transdermal patches, gel, or injected esters such as estradiol valerate or cypionate. Transdermal delivery avoids first-pass metabolism in the liver and carries the lowest clotting risk, which is why it is generally preferred for anyone with a history of thrombosis. Ethinylestradiol, the synthetic estrogen in many contraceptive pills, is specifically avoided: it is disproportionately clot-promoting and cannot be tracked by ordinary estradiol blood tests.

A different molecule is easily confused with it. 17-alpha-estradiol is the naturally occurring C17 epimer, described in the research literature as non-feminizing because its estrogenic activity is far weaker. It is not what anyone means by estradiol in this context.

One label caveat, because readers do look labels up: estradiol products carry a boxed warning drawn from studies of postmenopausal cisgender women, and it does not transfer straightforwardly to feminizing therapy in trans women.'
where slug = 'estradiol';

update public.unified_tags
   set description =
'Gender-affirming hormone therapy uses estrogen or testosterone, usually with a blocker, to bring someone''s body into line with their gender. Also widely called HRT, though clinical guidelines use the gender-affirming term. It is associated with substantial improvements in depression and quality of life.',
       long_description =
'Gender-affirming hormone therapy is the standard clinical term; "hormone replacement therapy" is borrowed from menopausal medicine and implies replacing a deficiency, but remains in common community use and is not wrong to say.

Feminizing therapy uses 17-beta-estradiol, usually with an anti-androgen — spironolactone in much of the United States, cyproterone acetate in much of Europe, or a GnRH analogue. Masculinizing therapy uses testosterone, by injection, gel or patch. Every one of these drugs is used off-label: no regulator has approved a gender-affirming indication for any of them, which is normal in this field and is not a statement about whether they work.

The mental-health evidence is consistent and observational. A study of 3,592 trans adults found a 15% lower rate of moderate-to-severe depressive symptoms on hormone therapy; a prospective study of 104 young people found 60% lower odds of moderate or severe depression and 73% lower odds of suicidality at twelve months. These are cohort studies, so they show a strong and repeated association rather than proof of cause.

Effects on fertility are real and only partly reversible, which is why guidelines ask that preservation be discussed before treatment starts.'
 where slug = 'hormone-therapy';

update public.unified_tags
   set description =
'The principal androgen, responsible for the development of male reproductive tissue and secondary sex characteristics, and the hormone used in masculinizing gender-affirming therapy. A controlled substance in many countries.',
       long_description =
'Testosterone is the main androgen in humans and is present, at different levels, in everyone. In masculinizing hormone therapy it is given by injection, transdermal gel or patch, or subcutaneous pellet. It is a Schedule III controlled substance in the United States, which is why prescriptions and travel with it are more regulated than for most medicines.

Topical gels carry a boxed warning that does not apply to injections: testosterone transfers by skin contact, and children exposed to it secondhand have been virilised. Cover the application site.

Low testosterone in cisgender men is associated with low mood, fatigue and reduced muscle mass, but the causal claim often made from that association does not hold up — controlled trials generally do not show testosterone acting as an antidepressant, and it is not a treatment for depression. In 2025 the FDA removed the boxed warning about cardiovascular outcomes from testosterone labels following the TRAVERSE trial, while adding a class-wide warning that testosterone raises blood pressure. That trial studied older cisgender men with hypogonadism and is not evidence about masculinizing therapy in trans men.'
 where slug = 'testosterone';

-- ── Erectile-dysfunction drugs and the nitrite contraindication ───────────

update public.unified_tags
   set description =
'Sildenafil, sold as Viagra, treats erectile dysfunction and pulmonary hypertension. It must never be taken with poppers or any other nitrite, or with riociguat: the combination can collapse blood pressure. The label does not state a safe waiting interval after a dose — it says the interval is unknown.',
       long_description =
'Sildenafil blocks the enzyme PDE5, which lets the signalling molecule cGMP accumulate and relax the smooth muscle of the blood vessels supplying the penis.

Nitrates and nitrites work on the same pathway from the other end: they donate nitric oxide, which drives cGMP production. Taken together the two remove both the accelerator''s limit and the brake, and the resulting fall in blood pressure is not self-limiting — fainting, heart attack and stroke are the documented consequences. In a controlled study, adding sildenafil to nitroglycerin produced an extra fall of roughly 24 mmHg systolic.

The sildenafil label is the only one of the four in this class whose contraindications name nitrites explicitly, in any form — which is what poppers are. It also names guanylate cyclase stimulators such as riociguat.

There is no label-stated waiting time. The label says it is unknown when nitrates can be given safely after a dose. The 24-hour figure repeated everywhere is a clinical convention derived from the drug''s half-life, not something the manufacturer or the regulator has stated.'
 where slug = 'sildenafil';

update public.unified_tags
   set description =
'Tadalafil, sold as Cialis, treats erectile dysfunction. It must never be combined with poppers or any other nitrite, or with riociguat. Its label requires at least 48 hours between a dose and any nitrate — longer than the 36 hours for which it is marketed as working.',
       long_description =
'Tadalafil is a PDE5 inhibitor and lasts far longer than the others in its class. Its label states that it improved erectile function compared with placebo up to 36 hours after a dose — meaning that is the longest interval at which superiority was demonstrated, not a promise of 36 hours of steady effect.

The safety window is longer than the effect window, and this is the detail most often lost. The label requires at least 48 hours to pass after the last dose before nitrates are even considered. Someone who reasons that the drug has "worn off" after 36 hours and takes poppers is inside the contraindicated period.

One more gap worth knowing: the Cialis label does not use the word poppers, and does not mention amyl nitrite or nitrites anywhere. Its contraindication is written in terms of organic nitrates. That is a documentation gap, not a safety difference — the mechanism is identical, and the drug is contraindicated with riociguat for the same reason.'
 where slug = 'tadalafil';

update public.unified_tags
   set description =
'Vardenafil, sold as Levitra, treats erectile dysfunction. It must never be combined with poppers or any other nitrite. Its label states that no safe interval between a dose and a nitrate has been determined.',
       long_description =
'Vardenafil is a PDE5 inhibitor. Its label contraindicates nitrates and nitric oxide donors — the category that includes the alkyl nitrites sold as poppers, which its patient leaflet names directly.

Like sildenafil, and unlike tadalafil and avanafil, it gives no safe waiting time: the label says a suitable interval has not been determined. It separately notes that no additional blood-pressure change was detected when a dose preceded nitroglycerin by 24 hours, which is an observation from a study rather than a dosing instruction, and is regularly misquoted as one.

Note that the original Levitra label predates the standard format and contains no mention of riociguat. The class contraindication with guanylate cyclase stimulators still applies; the absence is an artefact of the document''s age.'
 where slug = 'vardenafil';

update public.unified_tags
   set description =
'Avanafil, sold as Stendra in the US and Spedra in Europe, treats erectile dysfunction and acts faster than others in its class. It must never be combined with poppers or any other nitrite, or with riociguat or vericiguat. Its label requires at least 12 hours between a dose and any nitrate.',
       long_description =
'Avanafil is the most recent PDE5 inhibitor, approved in the United States in 2012 and in the European Union in 2013. It is more selective and takes effect faster than the older drugs in the class.

It is contraindicated with organic nitrates in any form, and its patient leaflet names poppers directly, listing amyl and butyl nitrite. Its label is also the only one in the class to name vericiguat alongside riociguat among the guanylate cyclase stimulators it must not be combined with.

Its label states the shortest interval in the class: at least 12 hours should pass after a dose before nitrates are considered. The label also quantifies what the combination does — with nitroglycerin, blood pressure fell by an average of 28/23 mmHg on standing.'
 where slug = 'avanafil';

update public.unified_tags
   set description =
'Brand name for tadalafil, an erectile-dysfunction medication. It must never be combined with poppers or any other nitrite: the label requires at least 48 hours between a dose and any nitrate, which is longer than the 36 hours it is marketed as lasting.',
       long_description = null
 where slug = 'cialis';

update public.unified_tags
   set description =
'Brand name for vardenafil, an erectile-dysfunction medication. It must never be combined with poppers or any other nitrite. Its label states that no safe interval between a dose and a nitrate has been determined.',
       long_description = null
 where slug = 'levitra';

-- ── Remaining wrong-entity and refusal rows ──────────────────────────────

update public.unified_tags set long_description =
'Paroxetine, sold as Paxil and Seroxat, is a selective serotonin reuptake inhibitor prescribed for depression, anxiety disorders, obsessive-compulsive disorder and PTSD.

Two things about it are worth knowing in this context. It is among the antidepressants most associated with sexual side effects, including delayed or absent orgasm and reduced desire — a common and rarely volunteered reason people stop taking it, and something a prescriber can often work around. And it has a short half-life, so stopping abruptly tends to produce discontinuation symptoms; it is tapered rather than stopped.

Like other serotonergic drugs it carries a risk of serotonin syndrome when combined with MDMA, tramadol, dextromethorphan or MAOIs, and it blunts the effects of MDMA.'
where slug = 'paxil';

update public.unified_tags
   set description =
'Descovy is emtricitabine with tenofovir alafenamide, used to treat HIV and as daily PrEP. Its PrEP approval excludes people at risk through receptive vaginal sex, because that was not studied. It is not a hepatitis B treatment, though it is active against the virus.',
       long_description =
'Descovy combines emtricitabine and tenofovir alafenamide. It is used as part of HIV treatment and, since 2019, as pre-exposure prophylaxis. Its PrEP indication deliberately excludes people at risk of HIV through receptive vaginal sex: that group was not enrolled in the trial, so there is no efficacy data rather than negative data.

It is not approved to treat hepatitis B. Both of its components are nevertheless active against hepatitis B, and its label carries a boxed warning about exactly that — someone with hepatitis B who stops taking it can suffer a severe flare. Anyone starting it is tested for hepatitis B first, and stopping is a decision for a prescriber.

Compared with the older tenofovir disoproxil in Truvada, it is easier on kidney and bone markers and tends to raise lipids.'
 where slug = 'descovy';

update public.unified_tags set long_description =
'Heroin is diacetylmorphine, a fast-acting opioid made from morphine. It binds mu-opioid receptors and, in overdose, kills by suppressing breathing.

The dominant risk today is not the drug but what is sold as it. Purity varies unpredictably between batches, and adulteration with synthetic opioids — fentanyl, and increasingly nitazenes, some of which are many times stronger again — means a quantity that was tolerable last week can be fatal this week. Nothing about appearance, taste or price reliably indicates this.

That is what the practical advice follows from: do not use alone, avoid combining with alcohol, benzodiazepines or pregabalin, all of which multiply respiratory depression, and keep naloxone within reach. Naloxone reverses all of these opioids, including nitazenes.

Dependence is physical, and tolerance falls quickly during any break — after prison, hospital or detox, the dose that was normal before is the one most likely to kill.'
where slug = 'heroin';

update public.unified_tags set long_description =
'Cocaine is a stimulant extracted from the coca plant, used as a powder or, as crack, smoked. It blocks the reuptake of dopamine, noradrenaline and serotonin, and it is short-acting, which is what drives repeated redosing.

Its cardiovascular effects are the ones that put people in hospital: it constricts arteries and raises heart rate and blood pressure, and chest pain after using it is a reason to seek help rather than wait.

Combined with alcohol, the body forms cocaethylene, a compound that lasts longer than cocaine itself and places additional strain on the heart — the two together are more cardiotoxic than either alone. Combined with opioids, the stimulant can mask how much opioid has been taken and wears off first, which is a documented route to respiratory arrest.'
where slug = 'cocaine';

-- KETAMINE was listed in this migration's verification block but never given a
-- correction, which is why the migration raised
-- `clinical fix: 1 row(s) still carry a refusal or wrong-entity artifact` and
-- rolled back in full on 2026-08-28 -- taking every later migration with it,
-- since `db push` stops at the first failure while the edge functions had
-- already deployed. The row's `description` was already accurate (it names the
-- bladder damage and the k-hole); only `long_description` carried the refusal
-- artifact, and its closing sentence -- "As there is no specific information
-- provided about its relation to LGBTQ+ travel or community" -- is the model
-- declining to answer, preserved as if it were content.
--
-- The replacement asserts nothing the row did not already assert, plus the
-- airway mechanism, which is the reason the dissociation matters rather than
-- being merely unpleasant. No figures are invented: ketamine-induced uropathy
-- has no clean dose threshold to quote, so the text states the direction and
-- declines a number, as the estradiol correction above does.
update public.unified_tags set long_description =
'Ketamine is a dissociative anaesthetic, used in human and veterinary medicine and taken recreationally for the detached, dreamlike state it produces. It works mainly by blocking NMDA receptors, which is a different mechanism from the depressants it is often taken alongside.

The harm from regular heavy use is urological. Ketamine damages the lining of the bladder, causing urinary urgency, frequency and pain, and over time a shrunken bladder that holds less. The damage can persist after use stops and in some cases does not fully reverse. There is no established safe threshold to quote, but the risk tracks how heavily and how often it is used, and urinary symptoms are the signal to stop and see a clinician rather than wait.

The acute risk is the airway. Ketamine depresses breathing less than most anaesthetics, so the danger is not usually respiratory arrest — it is that high doses immobilise, a state known as a k-hole, while the drug also commonly causes vomiting. Someone who cannot move cannot clear their own airway or roll over. That is why it should not be combined with alcohol, GHB or benzodiazepines, which add sedation on top, and why being with someone who stays alert matters more here than with most drugs.

The same immobility is why it carries a particular risk in sexual settings: a person in a k-hole cannot meaningfully consent, withdraw consent, or call for help.'
where slug = 'ketamine';

do $verify$
declare v_bad int; v_missing int;
begin
  -- Every refusal artifact and wrong-entity string this migration exists to
  -- remove. Matching the OLD strings, not "did an update run".
  select count(*) into v_bad from public.unified_tags
   where coalesce(long_description,'')||' '||coalesce(description,'') ~*
     '(not a topic related to LGBTQ|not supported or promoted by our|no specific information provided about its relation|not directly related to LGBTQ|not mentioned in the provided sources|Paxillus|17.{0,3}Estradiol is a minor and weak|chronic hepatitis B and as part of)'
     and slug in ('heroin','cocaine','ketamine','paxil','estradiol','descovy','cialis','levitra','sildenafil','tadalafil','vardenafil','avanafil');
  if v_bad > 0 then
    raise exception 'clinical fix: % row(s) still carry a refusal or wrong-entity artifact', v_bad;
  end if;

  -- The overstated claims, gone.
  select count(*) into v_bad from public.unified_tags
   where (slug = 'syphilis'      and coalesce(description,'') ~* 'cure it at every stage')
      or (slug = 'genital-herpes' and coalesce(long_description,'') ~* 'typically caused by HSV type 2')
      or (slug = 'hiv'            and coalesce(long_description,'') ~* 'average survival time after infection is estimated')
      or (slug = 'naloxone'       and coalesce(long_description,'') ~* 'last 30 to 90 minutes')
      or (slug = 'testosterone'   and coalesce(long_description,'') ~* 'can lead to (various health issues, including )?frailty');
  if v_bad > 0 then
    raise exception 'clinical fix: % overstated claim(s) survived', v_bad;
  end if;

  -- THE POINT OF THE PDE5 HALF: every one of these must now name the
  -- contraindication. A tag in this class that does not mention nitrites is the
  -- exact state this migration exists to end, so it fails the migration rather
  -- than being left to a reviewer to notice.
  select count(*) into v_missing from public.unified_tags
   where slug in ('sildenafil','tadalafil','vardenafil','avanafil','cialis','levitra','viagra')
     and coalesce(description,'')||' '||coalesce(long_description,'') !~* '(nitrite|nitrate)';
  if v_missing > 0 then
    raise exception 'clinical fix: % PDE5 tag(s) still do not mention nitrites', v_missing;
  end if;
end
$verify$;
