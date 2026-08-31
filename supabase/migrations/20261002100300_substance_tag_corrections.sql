-- Substance tags: the last refusal artifact, one stale label fact, and one
-- claim this glossary was overstating in the direction of certainty.
--
-- LITHIUM IS THE INTERESTING ONE, because the correction makes the page LESS
-- confident and that is the right direction. The tag said combining lithium
-- with psychedelics "carries a well-documented risk of seizures and psychosis,
-- which is why almost every psychedelic pairing on the interaction chart is
-- marked dangerous." Chasing that to its source: Nayak et al.,
-- Pharmacopsychiatry 2021, is a retrospective content analysis of UNVERIFIED
-- ANECDOTES scraped from Erowid, Shroomery and Reddit — 47% of 62 lithium
-- reports mentioned seizures against 0 of 34 for lamotrigine. No denominator,
-- no toxicological confirmation, no control for reporting bias; the authors
-- themselves only "provisionally conclude" a possible risk.
--
-- That is a real signal and it is not nothing — but "well-documented" is the
-- wrong word for it, and this glossary having written it is the same failure
-- mode as everything else in this audit, only pointing the safe way. The
-- corrected text keeps the advice (do not combine) and tells the reader what
-- the evidence actually is, because a reader who later discovers the citation
-- is a Reddit analysis has no way to tell which of our other claims are firmer.
--
-- KETAMINE still carried a model refusal — "As there is no specific information
-- provided about its relation to LGBTQ+ travel or community" — on an active,
-- indexable page. Last of the three; heroin and cocaine went in the previous
-- migration.
--
-- METHAMPHETAMINE was stale on the label. The Desoxyn obesity indication no
-- longer exists in current FDA labelling (the 2024 label is ADHD-only, with
-- zero occurrences of "obesity"; the 2017 one did carry it), and the brand is
-- listed as discontinued with only generics marketed. The old prose did not
-- assert the obesity indication, so this is an enrichment rather than a repair —
-- but the half-life is worth stating precisely, because "runs for days" is the
-- thing the tag is really about: the label says 4 to 5 hours, the literature
-- ~10, and it is the literature figure that explains the sessions.
--
-- GHB said it is used medically "as a general anaesthetic". Sodium oxybate's
-- FDA indication is narrower and specific: cataplexy OR excessive daytime
-- sleepiness in narcolepsy. Both are separate approved indications — the label
-- says "or", not "and".
--
-- NBOMES vs LSD needed its hedge kept. "LSD has no documented fatal overdose"
-- is true and the natural shortening of it — "LSD cannot kill you" — is not:
-- eight people who insufflated pure LSD tartrate mistaking it for cocaine
-- developed hyperthermia, coma and respiratory arrest, and survived only with
-- supportive care. The contrast with NBOMes is real and is stated without
-- becoming a safety claim about LSD.

select set_config('app.actor', 'admin:substance-tag-fix-20260828', true);

update public.unified_tags set long_description =
'Ketamine is a dissociative anaesthetic used in human and veterinary medicine, and taken recreationally for the detached, dreamlike state it produces. It blocks NMDA receptors, which is what separates perception from the body rather than sedating in the ordinary way. In esketamine form it is also an approved treatment for treatment-resistant depression, given under supervision — the label is explicit that it has not been shown to prevent suicide.

Two harms are specific to it. High doses produce an immobilising, near-inaccessible detachment known as a k-hole, in which someone cannot protect their own airway or refuse anything. And regular heavy use damages the bladder: in a survey of 1,285 recent users, 27% reported urinary symptoms, and the condition can progress to fibrosis, hydronephrosis and kidney failure. Roughly half improved after stopping, which is the argument for treating urinary symptoms as a reason to stop rather than as a nuisance.

Combined with alcohol or GHB it brings a serious risk of vomiting while unconscious.'
where slug = 'ketamine';

update public.unified_tags
   set description =
'A mood stabiliser prescribed for bipolar disorder. Reports link combining it with psychedelics to seizures, and the pairing is treated as one to avoid — though the evidence behind that is user reports rather than clinical study.',
       long_description =
'Lithium is a mood stabiliser and one of the most effective treatments for bipolar disorder. It has a narrow therapeutic range and needs regular blood monitoring; dehydration, and drugs affecting the kidney, push levels toward toxicity.

The combination people ask about is lithium with psychedelics, which harm-reduction charts mark as dangerous. It is worth being straight about where that comes from. The main published analysis reviewed 62 accounts of lithium with LSD or psilocybin posted to Erowid, Shroomery and Reddit; 47% described seizures, against none of 34 accounts involving lamotrigine. That is a striking difference and it is also uncontrolled anecdote — no denominator, no confirmation that the substances were what people believed, and no way to correct for the fact that alarming experiences get written up. The authors describe their own conclusion as provisional.

So: avoid the combination, and know that the reason to avoid it is a strong signal from weak evidence rather than a settled clinical finding. Stopping lithium in order to take a psychedelic carries its own serious risk and is not the workaround it looks like.'
 where slug = 'lithium';

update public.unified_tags set long_description =
'GHB — gamma-hydroxybutyrate — is a depressant that occurs naturally in the body in tiny amounts and acts on GABA-B and its own receptors. It is sold as a liquid, along with its precursors GBL and BDO, which the body converts into it.

Its danger is arithmetic. The gap between a recreational dose and unconsciousness is roughly a factor of two to three, doses are measured in millilitres, and street preparations vary in concentration — so the same measured amount is not the same dose twice. Alcohol narrows the gap further: in a European emergency-department series, co-ingestion raised the rate of critical-care admission from 22% to 55%.

A collapse is a medical emergency, not sleep. In one review of deaths with known GHB ingestion, 40 of 51 people had been left to sleep it off. Call emergency services and use the recovery position.

As a prescription medicine, sodium oxybate is approved for cataplexy or excessive daytime sleepiness in narcolepsy — not, as is sometimes said, as a general anaesthetic.'
where slug = 'ghb';

update public.unified_tags set long_description =
'Methamphetamine is a central nervous system stimulant, known as crystal or tina, and strongly associated with chemsex.

Duration is what shapes the harm. The FDA label gives a half-life of four to five hours; published pharmacology puts it closer to ten, which is why a session can run across days where a shorter stimulant would not. Most of the psychological damage — paranoia, agitation, the crash — is driven by the sleep deprivation that follows rather than by a single dose.

Its medical footprint is now very small: the only indication in current US labelling is ADHD in children aged six and over, the brand Desoxyn is discontinued, and only generics remain on the market.

It is a poor combination with almost everything, and specifically with GHB — a stimulant and a depressant taken together strain the heart while masking how much of each has been taken.'
where slug = 'methamphetamine';

update public.unified_tags set long_description =
'NBOMes are a family of synthetic psychedelics — 25I-NBOMe, 25B-NBOMe, 25C-NBOMe and relatives — active at microgram doses and frequently sold on blotter paper as LSD.

The reason this substitution matters is that the two drugs have different safety profiles at the doses involved. NBOMes have a documented history of fatal poisoning, including deaths of teenagers at low blood concentrations. LSD, by contrast, has no established lethal dose and no death attributable to its direct toxicity — which is not the same as saying an overdose is harmless: people who insufflated pure LSD mistaking it for cocaine developed hyperthermia, coma and respiratory arrest, and survived because they received hospital care.

Blotter paper cannot tell you which one you have, and neither can taste. This is the clearest single argument for drug checking there is.'
where slug = 'nbomes';

do $verify$
declare v_bad int;
begin
  select count(*) into v_bad from public.unified_tags
   where slug = 'ketamine'
     and coalesce(long_description,'') ~* 'no specific information provided';
  if v_bad > 0 then
    raise exception 'substance fix: ketamine still carries the refusal artifact';
  end if;

  -- The overstatement, gone, and its replacement actually says what the
  -- evidence is rather than merely dropping the adjective.
  select count(*) into v_bad from public.unified_tags
   where slug = 'lithium'
     and (coalesce(description,'') ~* 'well-documented'
          or coalesce(long_description,'') !~* 'anecdote');
  if v_bad > 0 then
    raise exception 'substance fix: lithium claim not properly qualified';
  end if;

  -- Match the OLD CLAIM, not the phrase. A correction has to NAME a
  -- misconception in order to refute it, and this one does: the replacement
  -- above ends "...not, as is sometimes said, as a general anaesthetic". A bare
  -- `~* 'general an(a)?esthetic'` is therefore tripped by the corrected text
  -- itself, so the migration could never pass -- it failed `db push` on
  -- 2026-08-28 and, because push stops at the first failure, held back every
  -- later migration while the edge functions deployed regardless.
  -- The old string was "...including as a general anesthetic and to treat
  -- conditions like cataplexy and narcolepsy", which the affirmative form below
  -- matches and the refutation does not.
  select count(*) into v_bad from public.unified_tags
   where slug = 'ghb'
     and coalesce(long_description,'') ~* 'including as a general an(a)?esthetic';
  if v_bad > 0 then
    raise exception 'substance fix: ghb still claims a general-anaesthetic indication';
  end if;
end
$verify$;
