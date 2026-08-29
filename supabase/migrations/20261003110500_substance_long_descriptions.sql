-- Bodies for the 46 substance tags that had a lead paragraph and nothing else.
--
-- WHY
--
-- The saferparty import (20260907100000) gave every substance a one-paragraph
-- `description`. 46 of them never got a `long_description`, so /tags/:slug
-- rendered the lead and then stopped — the "About" section was a single
-- sentence on pages the glossary otherwise treats as reference entries.
--
-- WHAT THESE ARE NOT
--
-- The boundary from 20260907100000 holds: no dosage figures, no
-- route-of-administration instructions, no "how to take it". Naming a
-- combination as dangerous is in scope — the existing descriptions already do
-- it, and `substance_interactions` is a whole surface built for it — but
-- nothing here tells anyone how to use anything.
--
-- FILL-IF-EMPTY, NEVER OVERWRITE
--
-- Each update is guarded on the column still being empty. If a human writes a
-- better body before this lands, or after it, that body survives — the same
-- discipline the enrichment engines use everywhere else in this repo. It also
-- makes the migration safe to re-run.
--
-- NO SEARCH CHURN
--
-- `trg_search_documents_tag` is column-scoped to name, short_description,
-- description, category, slug, image_url, entity_kind, merged_into_id,
-- deprecated_at and status. `long_description` is not in that list, so these 46
-- updates cause zero reindexing — which is why this can be one batch rather
-- than a capped nightly job.
--
-- THE PROSE IS OURS. Grounding from the eve&rave Substanzhandbuch (CC BY-NC-SA,
-- not reproduced) and from the existing saferparty-derived leads, which are
-- extended rather than restated.

set local statement_timeout = '600s';

do $mig$
declare
  v_n int;
  r   record;
begin
  perform set_config('app.actor', 'admin:substanzhandbuch-long-descriptions', true);

  create temp table _ld (slug text primary key, body text not null) on commit drop;

  insert into _ld (slug, body) values

  -- ── cathinones and the substituted-stimulant wave ──────────────────────
  ('2-mmc',
   '2-MMC belongs to the synthetic cathinones, the family that also contains mephedrone and 3-MMC. It appeared on the market as a legal replacement once its better-known relatives were controlled, which is the pattern this whole group follows: a compound is restricted, a neighbouring molecule takes its place, and the new one has been studied even less than the last.

That is the main thing worth knowing about it. Very little is documented — no meaningful human research, no long-term data, and effect reports drawn from a small number of users comparing it to substances they know better. Assuming it behaves like 3-MMC because it is chemically adjacent is exactly the reasoning that has gone wrong repeatedly in this family.

What it does share with the rest of the group is a short duration that invites repeat use, and a stimulant load on the heart that accumulates across a session. Samples sold under one cathinone name routinely contain another.'),

  ('3-cmc-4-cmc',
   '3-CMC / 4-CMC are chlorinated synthetic cathinones that entered the market as replacements for mephedrone after it was controlled. They are frequently sold interchangeably, and a sample sold as one commonly contains the other or a mixture.

That substitution is the practical risk rather than a technicality. The two are not identical in strength, so material bought as a familiar substance can behave differently from batch to batch with nothing visible to explain it. They have also been found sold as mephedrone itself and as generic "research chemical" powder.

Like the rest of the cathinones they are relatively short-acting, which drives repeated use across an evening, and the cardiovascular strain and sleep loss accumulate with each repeat. Long-term effects are essentially undocumented.'),

  ('3-mmc',
   '3-MMC is a synthetic cathinone chemically next door to mephedrone, and it became widely used in chemsex settings after mephedrone was controlled in much of Europe.

The pattern that defines it is compulsive redosing. Effects are relatively short, and the drop-off arrives while the user is still awake, still in the same setting and still holding more — so sessions extend far beyond what was planned. Most of the harm associated with 3-MMC comes from that cycle rather than from any single amount: sleep deprivation over days, dehydration, and a mounting load on the heart.

It is also serotonergic, which makes it dangerous alongside MAO inhibitors, SSRIs and tramadol, and it lowers the seizure threshold. Availability has repeatedly been used as an argument that it must be relatively safe; several countries have since restricted it over heart problems and dependence.'),

  ('methcathinone',
   'Methcathinone is a stimulant related to cathinone, the active compound in khat, and closer in effect to amphetamine than to the newer synthetic cathinones.

Its distinguishing hazard is not the drug itself but how it is often made. Home synthesis routes using potassium permanganate leave manganese in the product, and manganese poisoning is cumulative and irreversible. People who have used permanganate-route methcathinone regularly have developed a permanent movement disorder resembling Parkinson''s disease — unsteady gait, slurred speech, a fixed expression — that does not improve after stopping.

There is no way to identify contaminated material by look or effect. That risk sits entirely in the supply chain, which is what makes methcathinone unusual even among poorly documented stimulants.'),

  ('methylone',
   'Methylone is a synthetic cathinone that appeared early in the substituted-cathinone wave and is closely related to MDMA in structure. Users generally describe it as shorter, more stimulating and considerably less warm than MDMA.

Its history is mostly one of mis-selling. It has been sold as MDMA in pills and crystal, and marketed under trade names such as Explosion and Ease during periods when it was uncontrolled. Someone expecting MDMA and receiving methylone gets a shorter experience and often takes more to compensate, which is where the trouble starts.

It carries the usual cathinone profile: cardiovascular strain, overheating, sleep loss and a strong pull to redose. Being serotonergic, it also carries serotonin-syndrome risk alongside antidepressants and MAO inhibitors.'),

  ('mdphp',
   'MDPHP is a synthetic cathinone that circulates under the name Monkey Dust, and it sits at the harsher end of the group.

Effects are strong and long-lasting, and the reports that follow it are consistent: agitation, paranoia, and an unusually powerful compulsion to redose. It has been associated with episodes of confusion and aggression severe enough to bring people into contact with emergency services and police, and with prolonged sleeplessness that compounds the psychological effects.

Very little formal research exists. What is known comes from clinical case reports and from drug-checking services, which is a poor evidence base for a substance producing effects at this intensity.'),

  ('nep-neh',
   'NEP / NEH are synthetic cathinones from the same replacement cycle that produced 3-MMC and the CMC compounds: restrict one molecule, and a neighbouring one appears in its place.

There is very little reliable information on either. Toxicity is largely undocumented, long-term effects are unknown, and the user reports that exist are few and describe them by comparison to better-known stimulants rather than on their own terms.

They behave broadly like the rest of the group — stimulant effects of relatively short duration, with the redosing pattern and cardiovascular load that follows from it. As with the whole family, a sample sold under one of these names may well contain another cathinone entirely.'),

  ('4-fa',
   '4-FA is a fluorinated amphetamine whose effects sit between amphetamine and MDMA — more euphoric and sociable than plain speed, less so than MDMA.

It carries a specific and unusual hazard. 4-FA has been linked to sudden severe headaches and to bleeding in the brain, in users with no prior history and at amounts that were not exceptional. The Netherlands, where it had become widely used, controlled it after a cluster of such cases. A sudden intense headache during or after use is a reason to seek medical help rather than wait it out.

That aside, it puts the usual stimulant load on the heart and blood pressure. It is serotonergic, so it carries serotonin-syndrome risk with antidepressants and MAO inhibitors.'),

  ('6-apb',
   '6-APB is a benzofuran compound related to MDMA in effect, sold for a period under the name Benzo Fury while it was uncontrolled in the UK.

Its distinguishing feature is duration. The experience runs considerably longer than MDMA — long enough that people who dose by analogy find themselves still strongly affected many hours after they expected to be finished, with the cardiovascular strain continuing throughout. That extended load on the heart is the main documented concern, along with a difficult and protracted comedown.

Onset is also slow, which is the classic setup for taking more before the first amount has arrived.'),

  ('ephedrine',
   'Ephedrine comes from ephedra plants and has a long medical history as a decongestant and asthma treatment. It is a comparatively weak stimulant on its own.

In this context it appears in two roles. It is used deliberately for its stimulant effect, particularly where stronger drugs are unavailable, and it turns up as an adulterant bulking out amphetamine and cocaine. Someone taking a stimulant that is largely ephedrine gets more cardiovascular effect than psychoactive effect, which encourages taking more.

It raises blood pressure and heart rate reliably and does so with little of the euphoria that would otherwise signal that a lot has been taken. That combination makes it a poor thing to take casually, particularly for anyone with a heart condition or high blood pressure.'),

  ('dexamphetamine',
   'Dexamphetamine is the more active of the two mirror-image forms of amphetamine, and it is a medicine before it is anything else — prescribed for ADHD and narcolepsy, and one of the components of Adderall.

Taken as prescribed and monitored, it has a well-characterised safety profile. Used outside that, it carries the stimulant risks in full: raised heart rate and blood pressure, appetite suppression, and sleep loss that compounds over consecutive days into irritability, low mood and, at the extreme, paranoia.

Two things are easy to miss. Prescribed stimulants bought informally are a common target for counterfeiting, so a tablet that looks pharmaceutical may not be. And someone with a genuine prescription has a tolerance that makes their normal amount a substantial dose for anyone else.'),

  ('methylphenidate',
   'Methylphenidate is prescribed for ADHD under names including Ritalin and Concerta. It is a stimulant, though it works somewhat differently from the amphetamines.

The specific risk here is what people do to the tablets. Many formulations are designed to release slowly over a working day; crushing them to snort or inject delivers the entire daily amount at once, which is both a much larger dose than intended and a far sharper one. The tablets also contain binders and fillers meant to pass through the gut — inhaling or injecting those causes damage of its own, including to the lungs and blood vessels.

Otherwise it carries the usual stimulant profile: cardiovascular strain, appetite and sleep suppression, and a flat, depleted comedown after heavy use.'),

  ('modafinil',
   'Modafinil is prescribed for narcolepsy and shift-work sleep disorder, and is widely used off-label by people wanting to stay alert. It promotes wakefulness without much of the euphoria or the crash of conventional stimulants, which is why it is often described as mild.

The interaction people most often miss is with hormonal contraception: modafinil reduces its effectiveness, and that effect persists for some weeks after stopping. Anyone relying on the pill, patch or implant needs another method during and after use.

It is not free of the usual costs either. Sleep displaced is not sleep avoided, and consecutive days of use produce the same accumulated deficit as any other stimulant. Headache, anxiety and irritability are common, and rare but serious skin reactions are the reason it remains a prescription medicine.'),

  -- ── psychedelics ───────────────────────────────────────────────────────
  ('psychedelics',
   'Psychedelics act mainly on serotonin receptors and produce changes in perception, thought, emotion and the sense of self. The class covers LSD, psilocybin, mescaline, DMT and the many synthetic phenethylamines and tryptamines.

What distinguishes them practically is how much the outcome depends on things other than the substance. The same amount can produce an experience someone describes as among the most valuable of their life, or one they find frightening for hours, depending on their state of mind and the environment. Preparation is not fussiness here; it is most of what can actually be controlled.

Physically they are comparatively low in toxicity, and the adverse outcome that actually occurs is psychological — an overwhelming experience, and occasionally lasting difficulty afterwards. A personal or family history of psychosis is a genuine contraindication. Tolerance also builds steeply after a single use, so repeating within a few days does little except waste the material.'),

  ('dom-doi-dob-doc',
   'DOM / DOI / DOB / DOC are amphetamine-based psychedelics, and what sets them apart from the rest of the class is time.

Onset is slow — long enough that someone unfamiliar with them concludes nothing is happening and takes more. Because the effects then last well over a day, that second amount arrives on top of a first that has barely begun, and the result is an experience that cannot be ended and that runs through a night and into the following day. This is the single most common way these compounds cause harm, and it is entirely a dosing-by-analogy problem.

They are also active in very small amounts, which makes accurate measurement difficult, and they have been sold on blotter as LSD. Being amphetamine-derived they carry more cardiovascular load than the classical psychedelics, including vasoconstriction at higher amounts.'),

  ('2c-t-x',
   '2C-T-X refers to the sulphur-containing branch of the 2C family — 2C-T-2, 2C-T-7 and their relatives — which behave noticeably differently from the better-known 2C-B.

Two features recur. Onset is slow and duration is long, which produces the same redosing trap as the DOx compounds: nothing seems to be happening, more is taken, and both arrive together. And nausea and general physical discomfort are pronounced with several members of the group, often for the first hours.

Some compounds in this branch also inhibit monoamine oxidase, which makes combinations that would be merely unwise with other psychedelics genuinely dangerous — particularly with MDMA, stimulants and anything serotonergic. Fatalities have been recorded, several involving combinations.'),

  ('5-meo-xxt',
   '5-MeO-xxT covers the 5-methoxy tryptamines, including 5-MeO-MiPT and 5-MeO-DiPT — a group distinct from the more familiar tryptamines in both character and risk.

Effects tend to arrive abruptly rather than building, and are described as bodily and emotionally overwhelming rather than visual. That sudden onset gives little time to adjust, and the experience can be disorienting in a way that makes the surroundings matter more than usual.

The critical point is the interaction. This group is dangerous with MAO inhibitors — including the MAOI component of ayahuasca and pharmahuasca preparations — and combinations have been fatal. Anyone taking an MAOI, or anything containing one, should treat this entire group as off limits rather than as a dosing question.'),

  ('mda-mdea-mbdb',
   'MDA / MDEA / MBDB are close chemical relatives of MDMA with broadly similar empathogenic effects, and they are regularly encountered by people who believe they have taken MDMA.

MDA is the one worth knowing in detail. It lasts considerably longer than MDMA, is more stimulating and noticeably more psychedelic, with visual effects MDMA does not produce. Someone expecting an MDMA-shaped evening gets something longer and more intense, and the extended duration means more cardiovascular strain and more accumulated overheating risk.

All three carry the serotonergic risks of MDMA — dangerous with MAO inhibitors, blunted by SSRIs — and the same overheating hazard in hot, crowded environments. Pills sold as ecstasy have contained any of them, sometimes alongside MDMA rather than instead of it.'),

  ('amt',
   'AMT — alpha-methyltryptamine — is a long-acting psychedelic with pronounced stimulant properties, and it sits awkwardly between drug classes.

The important fact about it is that AMT inhibits monoamine oxidase. That means it carries the interaction profile of an MAOI in addition to its own: combinations with MDMA, stimulants, tramadol, dextromethorphan and serotonergic antidepressants become genuinely dangerous rather than merely unpredictable, and the risk of serotonin syndrome is real. Anyone treating it as "a psychedelic with some speed to it" has misread what they are holding.

Duration is long — well over half a day — and the stimulant component makes sleep impossible for a considerable time after the psychedelic effects have faded. Nausea early on is common.'),

  ('ibogaine',
   'Ibogaine is an alkaloid from the iboga shrub, used ceremonially in West Central Africa and studied since the 1960s for its apparent ability to interrupt opioid dependence.

That research interest is genuine and so is the risk that comes with it. Ibogaine disrupts the heart''s electrical rhythm, and deaths have occurred during treatment sessions — often in people with underlying heart problems that had not been identified, and often in unregulated clinics operating where the substance is not controlled. The dependence-interruption use case means it is frequently taken by people whose health has already been affected by long-term drug use, which is precisely the population most vulnerable to a cardiac event.

It is also extremely long-acting, with effects and after-effects running over days. It is not a substance to take without cardiac screening and monitoring, and not one to take alone under any circumstances.'),

  -- ── dissociatives ──────────────────────────────────────────────────────
  ('dissociatives',
   'Dissociatives produce a sense of detachment — from the body, from the surroundings, and from the sense that events are really happening. Most work by blocking NMDA receptors, and the class covers ketamine, DXM, nitrous oxide, MXE and PCP.

The characteristic risks follow from what the experience is. Coordination degrades badly, pain and physical danger stop registering, and people injure themselves without noticing. Anything involving water is disproportionately dangerous, because falling asleep or losing coordination in a bath or near open water has drowned people.

The other recurring hazard is vomiting while sedated. Dissociatives can produce nausea and deep unconsciousness at the same time, and someone lying on their back in that state can choke. That is why the recovery position matters here specifically, and why using alone is a poor idea.

Combining them with any other depressant compounds the sedation and the effect on breathing.'),

  ('mxe',
   'MXE — methoxetamine — was sold widely as a legal substitute for ketamine, and marketed as being gentler on the bladder. That claim was never established.

Its practical difference from ketamine is timing. MXE comes on more slowly and lasts substantially longer, so someone dosing from ketamine experience concludes it has not worked and takes more. Because the total duration is measured in hours rather than under one, the result is a much deeper and much longer dissociation than intended, sometimes to the point of complete immobility.

It has been associated with cases of prolonged confusion, agitation and loss of coordination severe enough to require hospital care, and with fatalities in combination with depressants. Long-term effects, including on the bladder, are not well characterised.'),

  ('dextromethorphan',
   'Dextromethorphan is an ordinary cough suppressant found in pharmacies everywhere, and a dissociative at amounts far above the ones on the packet.

The most serious risk is not the substance but what it is packaged with. Combination cough and cold preparations contain paracetamol, antihistamines, decongestants or all three, and at the amounts involved in recreational use those ingredients cause liver failure, dangerous heart rhythms and anticholinergic delirium. This has killed people who had no intention of taking anything but DXM.

The second is interaction. DXM is serotonergic, so combining it with SSRIs, MAO inhibitors, tramadol or MDMA risks serotonin syndrome. And how strongly it acts varies substantially between individuals for genetic reasons, so a comparison with someone else''s experience is not a reliable guide.'),

  ('diphenhydramine',
   'Diphenhydramine is a sedating antihistamine sold over the counter for allergies and sleep. At high amounts it becomes a deliriant, and the state it produces has nothing in common with a psychedelic experience.

The distinction matters. Deliriant hallucinations are seamless and are not recognised as hallucinations — people hold conversations with figures who are not present, act on things that are not happening, and retain no insight that they have taken anything. Reports are overwhelmingly negative, and the danger comes from behaviour during that state rather than from the drug''s direct toxicity.

It is also genuinely toxic in overdose, affecting heart rhythm, and its wide availability makes it easy to take a lot of. Anticholinergic effects — racing heart, dry hot skin, confusion, urinary retention — are the recognisable pattern, and it is one of the poisonings that does have a specific medical antidote.'),

  -- ── opioids ────────────────────────────────────────────────────────────
  ('diacetylmorphine',
   'Diacetylmorphine is the pharmaceutical name for heroin. In Switzerland and a handful of other countries it is prescribed under medical supervision as a treatment for severe opioid dependence that has not responded to methadone or buprenorphine.

The difference between the prescribed and the illicit form is not the molecule. It is that the amount is known and consistent, the material is not contaminated, and it is used in a setting where an overdose would be seen. Those three variables account for most opioid deaths, and removing them is what the programmes are for. The evidence associated with them — reduced mortality, reduced infection, less acquisitive crime — is why they persist despite remaining politically contentious.

As an opioid it carries the class risks in full: respiratory depression, dependence, and a tolerance that collapses during any break in use.'),

  ('buprenorphine',
   'Buprenorphine is a partial opioid agonist used both as a painkiller and, more commonly, as opioid substitution treatment under names including Subutex and Suboxone.

Being a partial agonist is what makes it useful. Its effect on breathing plateaus rather than deepening indefinitely with more, which makes fatal overdose on buprenorphine alone considerably harder than with a full agonist — though not impossible, and the ceiling does not protect against combinations with other depressants.

The property people run into unexpectedly is how tightly it binds. Buprenorphine displaces other opioids from their receptors while producing less effect than they did, so taking it while another opioid is still active can precipitate sudden, severe withdrawal within minutes. Starting it requires waiting until withdrawal has already begun. For the same reason naloxone works poorly against it, and reversing a buprenorphine overdose needs higher and repeated dosing.'),

  ('tilidine',
   'Tilidine is an opioid painkiller widely prescribed in Germany and Austria, and it is formulated together with naloxone specifically to make injection unrewarding.

That formulation shapes how it is used and misused. Swallowed, the naloxone is largely broken down by the liver before it reaches circulation, so the opioid effect comes through; injected or taken nasally, the naloxone acts and blocks it. The design works, and the consequence is that tilidine is mostly taken orally and in large amounts.

Fatal overdose on tilidine alone is comparatively unlikely because of the naloxone, which makes the real risks dependence and combination. Taken with alcohol or a benzodiazepine it produces the same additive respiratory depression as any opioid, and the naloxone offers no protection against that. It also carries serotonergic activity, so it appears in serotonin-syndrome warnings alongside antidepressants.'),

  ('nitazenes',
   'Nitazenes are synthetic opioids developed in the 1950s and never brought to market as medicines. Several are considerably more potent than fentanyl.

They matter because of where they appear rather than because anyone seeks them out. Nitazenes have been found in falsified tablets sold as oxycodone or benzodiazepines, in samples sold as heroin, and in material sold as entirely unrelated drugs. Clusters of overdoses across Europe have been traced to them, frequently among people who had no idea they had taken an opioid at all.

Because an active amount is very small, the difference between batches is enormous and nothing about the appearance of a tablet or powder indicates their presence. Naloxone does work, but the potency means repeated doses are often required and the reversal may not hold — which makes calling emergency services essential rather than optional.'),

  -- ── benzodiazepines and other depressants ──────────────────────────────
  ('depressants',
   'Depressants slow activity in the central nervous system. The class covers alcohol, benzodiazepines, GHB and its precursors, barbiturates, and — by mechanism if not by classification — the opioids.

The single most important fact about them is that they add up. Two depressants together suppress breathing considerably more than either alone, and the great majority of fatal overdoses involve a combination rather than a large amount of any one substance. Alcohol is the most commonly forgotten half of such a combination, because it is often not counted as a drug at all.

The second is that withdrawal from the GABA-acting members of this class — alcohol, benzodiazepines, GHB — can be fatal, through seizures and delirium tremens. That inverts the usual intuition: with most drugs stopping abruptly is unpleasant but safe, and here it is the continuing use that is survivable and the abrupt stop that is not.

They also disinhibit, which is why redosing decisions made while already affected are so often worse than the ones made sober.'),

  ('alprazolam',
   'Alprazolam is a short-acting benzodiazepine prescribed for anxiety and panic, and known almost universally by the brand name Xanax.

Two properties make it more troublesome than most of the class. It acts quickly and wears off quickly, which produces rebound anxiety as it leaves and a strong pull to take more; and it is markedly disinhibiting, so decisions made while affected — including about how much more to take — are unreliable. Memory gaps covering the period of use are common.

The supply is the other problem. Counterfeit Xanax tablets are widespread and visually indistinguishable from genuine ones, and have been found to contain designer benzodiazepines several times stronger, or synthetic opioids. Someone taking what they believe is a familiar tablet can receive something quite different.

As with the whole class, dependence develops quickly with regular use and stopping abruptly can be dangerous.'),

  ('diazepam',
   'Diazepam is the long-acting benzodiazepine most people mean when they say Valium, prescribed for anxiety, muscle spasm and seizures, and used as the reference point against which other benzodiazepines are compared.

Its length of action cuts both ways. It makes withdrawal easier to manage, which is why it is often the drug people are switched to when tapering off a shorter-acting benzodiazepine. But it also means repeated use accumulates: effects persist well into the following day, sedation and impaired coordination continue long after the person feels finished, and driving remains unsafe far longer than expected.

The class risks apply in full — additive respiratory depression with alcohol, opioids or GHB, quick development of dependence, and a withdrawal that can produce seizures and delirium tremens if stopped abruptly.'),

  ('lorazepam',
   'Lorazepam is a medium-acting benzodiazepine prescribed for anxiety and as a pre-operative sedative, sold as Temesta in much of Europe and Tavor in Germany.

It sits between the short and long-acting members of the class in duration, and shares their profile: sedation, muscle relaxation, reduced anxiety, disinhibition and impaired memory formation while it is active. Dependence develops quickly with regular use — a matter of weeks rather than months — and tolerance to the sedative effect builds faster than tolerance to the effect on breathing.

That last point is what makes escalating use dangerous. Someone taking more because it no longer sedates them as it used to is not proportionately protected against respiratory depression, particularly in combination with alcohol or an opioid. Stopping abruptly after sustained use risks seizures.'),

  ('midazolam',
   'Midazolam is a short-acting benzodiazepine used in hospitals for sedation before procedures, sold as Dormicum. It is also the benzodiazepine most often reached for when a psychedelic experience has to be brought under control medically.

It suppresses breathing more readily than most of the class, which is why it is normally given where breathing can be monitored. Outside that setting the same property makes it less forgiving than its relatives, particularly alongside alcohol, opioids or GHB.

Its other notable effect is on memory: midazolam reliably prevents new memories forming while it is active, which is exactly what it is used for clinically and which means someone can be awake, responsive and later have no recollection of the period at all. That has obvious implications for consent, and it is one of the substances relevant to drug-facilitated assault.'),

  ('oxazepam',
   'Oxazepam is a benzodiazepine with an unusually gradual onset, sold as Seresta and commonly used to manage alcohol withdrawal.

That slow onset is why it is comparatively little sought after recreationally: there is no rush, and the effect arrives too gently to reward taking it for one. It is also why it is useful clinically — it is easier to titrate and produces less of the disinhibition that makes shorter-acting benzodiazepines difficult.

It is metabolised simply, without the liver steps most benzodiazepines require, which makes it one of the safer choices for people with impaired liver function or in older age. None of that removes the class risks: dependence with sustained use, additive respiratory depression with other depressants, and a withdrawal that needs tapering rather than an abrupt stop.'),

  ('etizolam',
   'Etizolam is a thienodiazepine — closely related to the benzodiazepines and acting the same way — prescribed as a medicine in Japan, India and Italy but not licensed across most of Europe.

Its significance here is as a counterfeit ingredient. Etizolam has repeatedly been found in tablets pressed and sold as pharmaceutical benzodiazepines, particularly as alprazolam and diazepam. Strength varies enormously between batches because the tablets are made without any quality control, so two visually identical tablets from the same source can differ substantially.

It is more potent than diazepam and shorter-acting, so someone dosing by tablet count based on prescription experience can take considerably more than intended. The class risks — respiratory depression alongside other depressants, rapid dependence, dangerous withdrawal — all apply.'),

  ('flualprazolam',
   'Flualprazolam is a designer benzodiazepine that was never developed as a medicine and has no legitimate clinical use. It is substantially more potent than alprazolam.

It exists almost entirely as a counterfeit ingredient. Flualprazolam has been found repeatedly in tablets pressed to look like Xanax, and its potency means a tablet containing it can deliver several times the effect the buyer expected. It has been implicated in deaths across Europe and North America, frequently in combination with opioids.

Because it is long-acting as well as potent, the sedation continues well beyond the point at which someone believes they have recovered. Nothing about a tablet''s appearance distinguishes it from genuine medication, which is the whole problem: this is not a substance people choose, it is one they are sold.'),

  ('flunitrazepam',
   'Flunitrazepam is a potent long-acting benzodiazepine, sold as Rohypnol and prescribed in some countries as a hypnotic.

It is best known for its association with drug-facilitated assault, and that reputation is grounded in a real property: it reliably prevents memory formation while active, so someone can be awake and apparently functional and afterwards have no recollection of hours. Manufacturers added a blue dye to the tablets to make covert administration harder, though that only affects the branded product.

Two things are worth stating plainly. Alcohol is by a wide margin the substance most often involved in drug-facilitated assault, and focusing on flunitrazepam alone misdirects attention. And responsibility for an assault lies with the person who committed it, never with what the victim did or did not drink.

Clinically it carries the class risks in an amplified form: strong respiratory depression alongside other depressants, quick dependence, and a difficult withdrawal.'),

  ('pregabalin',
   'Pregabalin is prescribed for nerve pain, epilepsy and generalised anxiety under the name Lyrica, and has become widely used recreationally.

Its most serious property is what it does alongside opioids. Pregabalin markedly increases opioid respiratory depression, and its rise in recreational use has been tracked by a corresponding rise in its appearance in opioid-related deaths. That interaction is frequently underestimated because pregabalin is a prescription medicine for anxiety rather than a drug with a dangerous reputation.

Tolerance builds quickly and withdrawal after sustained use is genuinely difficult — anxiety, insomnia, sweating and agitation lasting weeks — which is often what keeps people taking it. It is also absorbed erratically at higher amounts, so the relationship between how much is taken and how strong the effect is becomes unpredictable.'),

  -- ── medicines and classes ──────────────────────────────────────────────
  ('medicines',
   'This covers pharmaceuticals used outside a prescription, and prescribed drugs taken for effects other than the ones they were prescribed for. It is a large share of all drug use and it is often not thought of as drug use at all.

Two assumptions cause most of the harm. The first is that a medicine is inherently safer than an illegal drug — pharmaceutical opioids, benzodiazepines and stimulants cause a substantial share of overdose deaths, and their being licensed says nothing about how they behave in amounts or combinations nobody intended. The second is that a tablet that looks pharmaceutical is pharmaceutical. Falsified tablets are now a leading source of unexpected overdose, and have been found containing designer benzodiazepines, nitazenes and fentanyl.

The other thing medicines bring is interactions. Prescribed antidepressants, antipsychotics and MAO inhibitors interact substantially with recreational drugs, and someone who does not count their own prescription as part of the equation is the person most likely to be caught by it.'),

  ('cannabinoids',
   'Cannabinoids act on the body''s cannabinoid receptors. The term covers the compounds in the cannabis plant, chiefly THC and CBD, the ones the body produces itself, and the large family of synthetic compounds designed in laboratories.

Grouping them by receptor obscures how differently they behave. Plant cannabis contains a mixture in which THC''s effects are moderated by other compounds; synthetic cannabinoids are typically full agonists many times more potent, with no such moderation and a genuinely different risk profile. Deaths are essentially unknown with plant cannabis and documented with synthetics.

That distinction has become harder to rely on. Synthetic cannabinoids have been sprayed onto low-potency CBD flower and sold as ordinary cannabis, and rapid tests intended to check THC content do not detect them. An unexpectedly fast and strong onset from material sold as mild is the warning sign.'),

  ('herbal-drugs',
   'Herbal drugs are psychoactive substances taken as plants, fungi or minimally processed extracts — cannabis, psilocybin mushrooms, kratom, salvia, iboga, khat, the nightshades.

The assumption they attract is that growing in nature implies safety, and it is simply false. Some of the most dangerous substances covered anywhere in this glossary are plants: the deliriant nightshades have killed people through complete loss of contact with reality, and are freely available in hedgerows.

The practical difficulty specific to this group is consistency. Potency varies between species, between individual plants, between parts of the same plant and between seasons, so an amount that was right last time may be several times stronger or weaker now. With fungi there is the added problem of identification, where lethal look-alikes exist and an app is not an adequate check.

Plant material can also be contaminated with pesticides or, in the case of CBD flower, deliberately sprayed with synthetic cannabinoids.'),

  ('new-psychoactive-substances',
   'New psychoactive substances are compounds designed to reproduce the effects of established drugs while sitting outside existing drug laws. Hundreds have appeared, and the cycle is self-perpetuating: a compound is controlled, a neighbouring molecule replaces it.

The defining problem is absence of information. There is usually no human research, no established active amount, no toxicity data and no long-term follow-up — only anecdotal reports from a small number of people. Small changes to a molecule can produce large and unexpected changes in effect, so reasoning from a chemical relative is unreliable.

Two practical consequences follow. Many are active in very small amounts, which puts accurate measurement beyond ordinary scales. And a substance sold under one name frequently contains another entirely, so even a careful user may not know what they have taken.

Harms may also emerge only years later. A compound with no immediately obvious problems is not a compound shown to be safe.'),

  ('stimulants',
   'Stimulants increase alertness, energy, confidence and heart rate. The class runs from caffeine through amphetamine, cocaine and methamphetamine to the synthetic cathinones.

The harms cluster in four places. Cardiovascular strain — raised heart rate and blood pressure, and at higher amounts arrhythmia and coronary spasm. Overheating, particularly when combined with dancing in hot rooms, which is a recurring cause of serious harm. Sleep loss, which accumulates across consecutive days into irritability, low mood, paranoia and occasionally frank psychosis. And the comedown, a depleted flat state that follows heavy use and is much of what drives people to take more.

The redosing pattern is worth naming on its own. Stimulants shorten the interval at which the next decision gets made and impair the judgement making it, so sessions extend well past what was planned. Deciding a stopping time in advance is one of the few things that reliably helps.

There is no antidote for stimulant overdose; care is supportive.'),

  ('ssris',
   'SSRIs are the most widely prescribed class of antidepressants, and their presence changes how other drugs behave — which matters because the people taking them frequently do not think of themselves as taking a drug that interacts.

Two effects dominate. Combining an SSRI with other serotonergic substances — MDMA, tramadol, dextromethorphan, MAO inhibitors, several stimulants — risks serotonin syndrome, which ranges from unpleasant to fatal. And in the other direction, SSRIs substantially blunt MDMA and reduce the effects of classical psychedelics, sometimes to the point where they seem not to have worked at all.

That second effect causes its own harm. Someone who feels nothing and takes considerably more has stacked a large amount of a serotonergic drug on top of an antidepressant, which is the situation the first effect describes.

Stopping an antidepressant to accommodate drug use is a medical decision, not a scheduling one — discontinuation has its own risks and needs a doctor.'),

  ('maois',
   'MAO inhibitors block the enzyme that clears monoamines from the body, and they are the single most dangerous class of interaction in this field. They are prescribed for depression and Parkinson''s disease, and they are also the active component that makes ayahuasca work.

Because the enzyme they block is what normally breaks down many other substances, combinations the body would ordinarily manage can become life-threatening. Serotonin syndrome and hypertensive crisis are both documented outcomes, and deaths have occurred with MDMA, stimulants, tramadol, dextromethorphan and several tryptamines. Irreversible MAOIs continue to have this effect for weeks after the last dose, so waiting a day is not sufficient.

The interaction also extends to ordinary food. Aged cheese, cured meat, fermented products and some wines and beers contain tyramine, which an MAOI prevents the body from clearing, and the resulting blood-pressure spike can be dangerous on its own.

Anyone taking an MAOI, in any form, should treat combination as a medical question rather than a dosing one.'),

  ('neuroleptics',
   'Neuroleptics — antipsychotics — are prescribed for psychosis, bipolar disorder and, at lower amounts, sleep and agitation. They appear in this context in two ways, and both are worth understanding.

The first is that people take them to blunt a stimulant comedown or to end a difficult psychedelic experience. They are not sedatives and do not work well for this. They can cause severe movement disorders, sharp drops in blood pressure, and in rare cases neuroleptic malignant syndrome, which is a medical emergency. A benzodiazepine is what medical staff generally reach for instead.

The second is that being on prescribed antipsychotic treatment substantially blunts psychedelics and stimulants, both during treatment and for weeks after it ends. That creates a delayed trap: a large amount taken to overcome an apparent lack of effect becomes a genuine overdose once the antipsychotic has cleared.

They also lower blood pressure additively with other depressants.');

  ---------------------------------------------------------------------------
  -- Fill-if-empty. Never overwrites a body someone else wrote.
  ---------------------------------------------------------------------------
  for r in select * from _ld order by slug loop
    update public.unified_tags
       set long_description = r.body,
           last_verified_at = now(),
           updated_at       = now()
     where slug = r.slug
       and coalesce(long_description, '') = '';
  end loop;

  ---------------------------------------------------------------------------
  -- Assertions.
  ---------------------------------------------------------------------------
  select count(*) into v_n
    from _ld l left join public.unified_tags t on t.slug = l.slug
   where t.id is null;
  if v_n > 0 then
    raise exception 'long descriptions: % target slug(s) do not exist', v_n;
  end if;

  select count(*) into v_n
    from _ld l join public.unified_tags t on t.slug = l.slug
   where coalesce(t.long_description, '') = '';
  if v_n > 0 then
    raise exception 'long descriptions: % tag(s) still have an empty body', v_n;
  end if;

  -- The wrong-entity guard, category-wide, as in every migration in this set.
  -- Negative form -- see the note in 20261003110000.
  select count(*) into v_n
    from public.unified_tags
   where category = 'Substances & Harm Reduction' and status = 'active'
     and coalesce(long_description, '') ~* '(Portuguese Communist|Marxist.Leninist|an outbuilding|separate building|family name|Saint Louis Art Museum|pumping house|house music)';
  if v_n > 0 then
    raise exception 'long descriptions: % active tag(s) still carry a known-wrong subject', v_n;
  end if;

  -- No body may carry the source's wrong ambulance number.
  select count(*) into v_n from _ld where body like '%114%';
  if v_n > 0 then
    raise exception 'long descriptions: % body(ies) contain "114"', v_n;
  end if;

  raise notice 'long descriptions: % bodies written', (select count(*) from _ld);
end
$mig$;
