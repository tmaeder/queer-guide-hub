-- Interaction-matrix gaps and myth/fact rows from the Substanzhandbuch.
--
-- POPPERS WAS NOT IN THE MATRIX AT ALL — AND ANOTHER MIGRATION FIXED THE WORST
-- PART OF THAT WHILE THIS WAS BEING WRITTEN
--
-- `substance_interactions` carried 421 pairs over 31 substances, imported from
-- TripSit (20260909172500). `poppers` was not one of the 31 — and poppers with
-- an erectile-dysfunction drug is the single most safety-critical combination
-- for this platform's audience. It is named in the `poppers` tag's own
-- description and in the existing chemsex myth/fact rows, and the one surface
-- built to answer "can I combine these two?" could not express it.
--
-- 20261002100200_health_tag_sources_and_pde5_revival reached main first and
-- covered exactly that half, having found the same gap from the sexual-health
-- side rather than the substance side. Its rows are written per drug from the
-- FDA labels and are better evidence than anything drafted here, so this file
-- no longer writes them — see the note at the poppers block below. The sentence
-- above describes the state this work started from, not the state at merge.
--
-- What is still uncovered, and is what this file is now for: the rest of the
-- poppers node (GHB, alcohol, benzodiazepines, cocaine, methamphetamine, MDMA),
-- and the substances absent from the matrix entirely — methamphetamine (central
-- to chemsex), the individual opioids (heroin, morphine, oxycodone, fentanyl,
-- kratom), the individual benzodiazepines (only the class was present), 3-MMC
-- and synthetic cannabinoids. A reader on /tags/heroin still sees no
-- combinations at all.
--
-- EXISTING ROWS ARE NEVER MODIFIED
--
-- Every insert is ON CONFLICT DO NOTHING on the (tag_a_id, tag_b_id) unique
-- index, so a pair TripSit already covers keeps TripSit's verdict and note. A
-- disagreement between sources is left as a disagreement for a human rather
-- than silently resolved by whichever migration ran last. `source` and
-- `source_url` are NOT NULL columns precisely so a second source can be added
-- without guessing later where each row came from.
--
-- CANONICAL ORDER IS COMPUTED, NOT ASSUMED
--
-- The table CHECKs tag_a_id < tag_b_id so that one unordered pair cannot be
-- stored twice with contradicting verdicts. The pairs below are written in
-- whatever order reads naturally and normalised with least()/greatest() on
-- insert — writing them by hand in uuid order would be unreadable and would
-- silently break the moment a tag id changed.
--
-- SEVERITY IS THE SOURCE'S CLAIM, MAPPED TO OUR KEYS
--
-- The handbook's Mischkonsum fields use "Lebensgefahr", "abzuraten",
-- "Verstärkung". Those map onto the existing six-key vocabulary:
-- life-threatening respiratory depression or circulatory collapse ->
-- 'dangerous'; explicitly advised against -> 'unsafe'; amplification needing
-- care -> 'caution'. No new status keys are introduced.
--
-- WHY THE MYTH ROWS ARE HERE
--
-- `tag_myth_facts` (24 rows, all from the Darklands "Kink Responsibly"
-- booklet) already renders at /tags/:slug#myths via TagMythFacts. The
-- handbook's most useful contribution is where it contradicts something people
-- confidently believe — that naloxone is a universal fix, that a benzodiazepine
-- ends a trip, that stopping alcohol abruptly is merely unpleasant, that
-- natural means safer. Those are the rows below. Every one is attributed and
-- written in our own words; the handbook is CC BY-NC-SA and is not reproduced.
--
-- Idempotency: the myth rows have no natural key, so this deletes its own
-- source's rows before inserting rather than relying on ON CONFLICT.

set local statement_timeout = '600s';

do $mig$
declare
  v_a       uuid;
  v_b       uuid;
  v_tag_id  uuid;
  v_before  int;
  v_after   int;
  v_n       int;
  r         record;
begin
  perform set_config('app.actor', 'admin:substanzhandbuch-interactions', true);

  select count(*) into v_before from public.substance_interactions;

  ---------------------------------------------------------------------------
  -- 1. Interaction pairs the handbook names explicitly.
  ---------------------------------------------------------------------------
  for r in
    select * from (values

    -- ── poppers: everything except the PDE5 pairs ─────────────────────────
    -- The poppers x erectile-dysfunction rows are deliberately NOT here.
    -- 20261002100200 writes them from the FDA labels, per drug — sildenafil's
    -- label naming nitrites in any form, tadalafil's 48-hour interval, and
    -- avanafil's measured 28/23 mmHg fall — stamped source='FDA label'. Leaving
    -- a weaker hand-written duplicate to lose an ON CONFLICT race would put the
    -- worse row's fate down to migration ordering, so it was removed instead.
    ('poppers','ghb','dangerous',
     'Both lower blood pressure sharply. GHB also sedates, so someone whose circulation is failing may be unable to respond or call for help.'),
    ('poppers','alcohol','caution',
     'Additive drop in blood pressure with added dizziness. Fainting is the usual outcome, and the injury from falling is the common harm.'),
    ('poppers','benzodiazepines','caution',
     'Additive sedation and lowered blood pressure.'),
    ('poppers','cocaine','caution',
     'Opposing effects on the blood vessels — one constricts, the other dilates — which puts extra strain on the heart.'),
    ('poppers','methamphetamine','caution',
     'Common together in chemsex. Strong disinhibition, and the stimulant masks how much of everything else has been taken.'),
    ('poppers','mdma','caution',
     'Additive cardiovascular effects and increased heart strain.'),

    -- ── methamphetamine ───────────────────────────────────────────────────
    ('methamphetamine','maois','dangerous',
     'Hypertensive crisis and serotonin syndrome, either of which can be fatal. At least two weeks must pass after an irreversible MAO inhibitor.'),
    ('methamphetamine','ssris','unsafe',
     'Serotonin syndrome risk, and the stimulant effect can be altered unpredictably.'),
    ('methamphetamine','alcohol','unsafe',
     'The stimulant masks how drunk someone is, so alcohol poisoning can develop unnoticed. Additional strain on heart, liver and kidneys, and heavier dehydration.'),
    ('methamphetamine','cocaine','unsafe',
     'Two strong stimulants together: cardiac strain, coronary spasm and a marked rise in blood pressure.'),
    ('methamphetamine','amphetamine','unsafe',
     'Overstimulation with no added effect worth having; cardiovascular load and sleep loss both compound.'),
    ('methamphetamine','mdma','unsafe',
     'Markedly increased seizure risk on top of additive serotonergic and cardiovascular strain.'),
    ('methamphetamine','opioids','dangerous',
     'Each masks the other. When the stimulant fades first, an opioid overdose can surface abruptly in someone who now appears simply to be asleep.'),
    ('methamphetamine','ghb','unsafe',
     'The stimulant hides how sedated someone is, which is how a GHB overdose is walked into.'),
    ('methamphetamine','tramadol','dangerous',
     'Serotonin syndrome, and both lower the seizure threshold.'),

    -- ── individual opioids with depressants ───────────────────────────────
    ('heroin','benzodiazepines','dangerous',
     'Additive respiratory depression — among the most common combinations in fatal overdose. Benzodiazepines also disinhibit, which makes uncontrolled redosing more likely.'),
    ('heroin','alcohol','dangerous',
     'Additive respiratory depression and unconsciousness; vomiting while unconscious adds an aspiration risk.'),
    ('heroin','ghb','dangerous',
     'Two depressants acting on breathing at once. Respiratory arrest is the expected mechanism.'),
    ('heroin','pregabalin','dangerous',
     'Pregabalin substantially increases opioid respiratory depression and is implicated in a growing share of opioid deaths.'),
    ('morphine','benzodiazepines','dangerous',
     'Additive respiratory depression, with disinhibited redosing on top.'),
    ('morphine','alcohol','dangerous',
     'Additive respiratory depression and sedation.'),
    ('oxycodone','benzodiazepines','dangerous',
     'Additive respiratory depression — a very frequent combination in prescription-opioid deaths.'),
    ('oxycodone','alcohol','dangerous',
     'Additive respiratory depression. Alcohol can also disrupt a sustained-release formulation, delivering the whole amount at once.'),
    ('oxycodone','ghb','dangerous',
     'Two depressants acting on breathing simultaneously.'),
    ('fentanyl','benzodiazepines','dangerous',
     'Fentanyl already suppresses breathing at very small amounts; adding a benzodiazepine is a leading pattern in fatal overdose.'),
    ('fentanyl','alcohol','dangerous',
     'Additive respiratory depression at amounts of fentanyl that are already difficult to measure.'),
    ('kratom','alcohol','unsafe',
     'Kratom has opioid-like effects on breathing; with alcohol these add up, and most serious kratom harm involves a combination.'),
    ('kratom','opioids','unsafe',
     'Additive respiratory depression. Naloxone works only partially against kratom''s partial agonists, so reversal is less reliable.'),
    ('kratom','benzodiazepines','unsafe',
     'Additive sedation and respiratory depression.'),

    -- ── individual benzodiazepines (only the class was present) ───────────
    ('alprazolam','alcohol','dangerous',
     'Additive respiratory depression, blood-pressure drop and memory loss. Documented in fatalities across all age groups.'),
    ('alprazolam','ghb','dangerous',
     'Both act on the GABA system; together they suppress breathing far more than either alone.'),
    ('alprazolam','opioids','dangerous',
     'Additive respiratory depression, plus disinhibited redosing of the opioid.'),
    ('diazepam','alcohol','dangerous',
     'Additive respiratory depression and sedation; diazepam''s long duration means the risk persists well into the next day.'),
    ('diazepam','ghb','dangerous',
     'Both act on the GABA system; breathing is the function that fails first.'),
    ('diazepam','opioids','dangerous',
     'Additive respiratory depression.'),
    ('lorazepam','alcohol','dangerous',
     'Additive respiratory depression and sedation.'),
    ('lorazepam','ghb','dangerous',
     'Both act on the GABA system; additive suppression of breathing.'),
    ('lorazepam','opioids','dangerous',
     'Additive respiratory depression.'),
    ('midazolam','alcohol','dangerous',
     'Midazolam suppresses breathing more readily than most benzodiazepines; with alcohol this is a frequent cause of respiratory arrest.'),
    ('midazolam','ghb','dangerous',
     'Both act on the GABA system, and midazolam is the more potent respiratory depressant of the benzodiazepines.'),
    ('midazolam','opioids','dangerous',
     'Additive respiratory depression from a benzodiazepine already noted for it.'),

    -- ── cathinones and serotonergic drugs ─────────────────────────────────
    ('3-mmc','maois','dangerous',
     'Serotonin syndrome, potentially fatal. At least two weeks must pass after an irreversible MAO inhibitor.'),
    ('3-mmc','ssris','unsafe',
     'Serotonin syndrome risk; the handbook treats recent SSRI use as a reason not to take it at all.'),
    ('3-mmc','tramadol','dangerous',
     'Serotonin syndrome, and both lower the seizure threshold.'),
    ('3-mmc','alcohol','caution',
     'Increased seizure risk, and alcohol worsens the dehydration this substance already causes.'),
    ('mephedrone','maois','dangerous',
     'Serotonin syndrome, potentially fatal.'),
    ('mephedrone','tramadol','dangerous',
     'Serotonin syndrome, with an added seizure risk from both.'),

    -- ── synthetic cannabinoids ────────────────────────────────────────────
    ('synthetic-cannabinoids','opioids','dangerous',
     'Potency is unpredictable batch to batch and the combination carries a markedly raised fatality rate.'),
    ('synthetic-cannabinoids','alcohol','unsafe',
     'Additive sedation on top of a substance whose strength cannot be judged from the material itself.')

    ) as t(slug_a, slug_b, status, note)
  loop
    select id into v_a from public.unified_tags where slug = r.slug_a and status = 'active';
    select id into v_b from public.unified_tags where slug = r.slug_b and status = 'active';
    continue when v_a is null or v_b is null or v_a = v_b;

    insert into public.substance_interactions
      (tag_a_id, tag_b_id, status, note, source, source_url)
    values
      (least(v_a, v_b), greatest(v_a, v_b), r.status, r.note,
       'eve&rave Substanzhandbuch',
       'https://www.eve-rave.ch/das-substanzhandbuch/')
    on conflict (tag_a_id, tag_b_id) do nothing;
  end loop;

  select count(*) into v_after from public.substance_interactions;

  ---------------------------------------------------------------------------
  -- 2. Myth / fact rows. Delete-then-insert by source, since the table has no
  --    natural key to conflict on.
  ---------------------------------------------------------------------------
  delete from public.tag_myth_facts where source = 'eve&rave Substanzhandbuch';

  for r in
    select * from (values

    ('naloxone', 'myth', 0,
     'Once naloxone has been given, the overdose is over.',
     'Naloxone wears off faster than most opioids. Someone can wake up, seem fine, and slide back into overdose as it fades — so it may need repeating, and emergency services are still needed every time.'),
    ('naloxone', 'myth', 1,
     'Naloxone works the same against every opioid.',
     'It works poorly against partial agonists such as buprenorphine, and against the opioid-like alkaloids in kratom. Higher and repeated dosing may be needed, and reversal is less reliable.'),
    ('naloxone', 'fact', 2,
     'Giving naloxone to someone who has not taken opioids does no harm.',
     'It has no effect of its own and no recreational effect. If you are unsure whether an unresponsive person has taken opioids, using it is the safer choice.'),

    ('bad-trip', 'myth', 0,
     'A benzodiazepine ends a bad trip.',
     'It reliably reduces the fear; the perceptual effects generally continue. Expecting the trip to stop is how people end up taking more and stacking a sedative on top of a psychedelic.'),
    ('trip-killer', 'myth', 0,
     'A trip killer switches the experience off.',
     'The name oversells it. What these drugs do is remove the anxiety, so the experience carries on while mattering less. They also disinhibit and impair memory, and carry their own dependence risk.'),

    ('withdrawal', 'myth', 0,
     'Stopping abruptly is unpleasant but basically safe.',
     'True for most drugs and false for the ones people least expect. Withdrawal from alcohol, benzodiazepines and GHB can kill through seizures and delirium tremens. Opioid withdrawal is far more feared and far less likely to be fatal.'),
    ('delirium-tremens', 'fact', 0,
     'Alcohol is the substance whose withdrawal is most likely to kill you.',
     'Not heroin. Physical dependence on alcohol or benzodiazepines needs a planned, supervised reduction — "just quit" is actively dangerous advice for someone in that position.'),

    ('drug-tolerance', 'fact', 0,
     'Tolerance falls faster than people expect, and that is what kills.',
     'After detox, illness, prison or a quiet few weeks, a previously routine amount can be a fatal overdose. Returning to use after a break is one of the most common patterns in overdose deaths.'),

    ('natural-and-synthetic-drugs', 'myth', 0,
     'Natural drugs are safer than synthetic ones.',
     'Some of the most dangerous substances in this field are plants growing in hedgerows. Origin says nothing about risk, and plant material varies far more in strength than manufactured material does.'),

    ('nitrous-oxide', 'fact', 0,
     'Gold cartridges are carbon dioxide, not nitrous oxide.',
     'Mixing them up is a real and specific hazard. Only food-grade nitrous cartridges are the intended thing, and inhaling directly from a pressurised canister risks freeze injury regardless.'),
    ('nitrous-oxide', 'myth', 1,
     'Nitrous is harmless because it wears off in a minute.',
     'Repeated use depletes vitamin B12 and can cause lasting nerve damage. The acute risk is oxygen deprivation, which is why it is only ever done sitting or lying down.'),

    ('cpr', 'myth', 0,
     'Check for a pulse before starting compressions.',
     'No longer recommended — it is unreliable under stress and wastes the time that matters most. If someone is unresponsive and not breathing normally, start compressions.'),
    ('seizure', 'myth', 0,
     'Put something in their mouth so they cannot swallow their tongue.',
     'Nobody can swallow their tongue. The attempt breaks teeth and fingers. Clear hard objects away, cushion the head, note the time, and do not restrain the convulsions.'),

    ('mdma', 'myth', 0,
     'If you are overheating, drink lots of water.',
     'Drinking large amounts of plain water is itself dangerous on MDMA and has killed people. Small sips and actively cooling down — shade, air, less dancing — are what help.'),
    ('lsd', 'fact', 0,
     'Blotters are more often under-dosed than over-dosed.',
     'Drug-checking data consistently finds this. Nothing about a blotter''s appearance indicates its strength, and a bitter or stinging taste is a warning sign for NBOMe compounds rather than LSD.'),
    ('lsd', 'myth', 1,
     'Two doses give twice the effect.',
     'The dose-response is not linear, unlike alcohol. Redosing because onset feels slow is a common route to a much harder experience than intended.'),

    ('psilocybin', 'myth', 0,
     'An identification app is good enough for picking mushrooms.',
     'It is not. Lethal look-alikes exist, and identification needs someone qualified. Keeping one specimen aside matters too — in a poisoning it lets specialists identify what was eaten and choose treatment.'),
    ('salvia-divinorum', 'fact', 0,
     'Salvia can act more strongly with repeated use, not less.',
     'It does not build tolerance the way other psychedelics do, and repeated use may require reducing the amount rather than increasing it — the inverse of the usual expectation.'),

    ('cannabis', 'fact', 0,
     'CBD flower has been sold sprayed with synthetic cannabinoids.',
     'An unexpectedly fast, strong onset from something sold as low-potency material is the warning sign. Rapid tests only detect the CBD, so they miss this.'),
    ('dextromethorphan', 'myth', 0,
     'DXM is an opioid.',
     'It is structurally related to opioids but acts as a dissociative. The practical consequence is that its dangerous interactions are serotonergic — antidepressants and MAO inhibitors — not the ones people expect from an opioid.'),

    ('poppers', 'fact', 0,
     'Poppers and erection drugs must never be combined.',
     'Both lower blood pressure. Together the drop can be sudden enough to cause collapse, and an erectile-dysfunction drug taken hours earlier is still active.'),
    ('poppers', 'myth', 1,
     'Swallowing poppers is just a stronger way of taking them.',
     'They are caustic and swallowing them can drastically reduce the blood''s ability to carry oxygen. It is a medical emergency, not a stronger dose.'),

    ('methamphetamine', 'myth', 0,
     'Nazi Germany issued methamphetamine-laced "tank chocolate".',
     'The Panzerschokolade story is a myth. Methamphetamine was distributed in the Wehrmacht, but the laced-chocolate version comes from a single confectioner marketing meth pralines commercially.')

    ) as t(slug, kind, sort, claim, truth)
  loop
    select id into v_tag_id from public.unified_tags where slug = r.slug;
    continue when v_tag_id is null;
    insert into public.tag_myth_facts (tag_id, kind, claim, truth, sort, source, source_url)
    values (v_tag_id, r.kind, r.claim, r.truth, r.sort,
            'eve&rave Substanzhandbuch',
            'https://www.eve-rave.ch/das-substanzhandbuch/');
  end loop;

  ---------------------------------------------------------------------------
  -- 3. Assertions.
  ---------------------------------------------------------------------------

  -- The point of the migration: poppers must now be expressible.
  select count(*) into v_n
    from public.substance_interactions i
    join public.unified_tags t on t.id in (i.tag_a_id, i.tag_b_id)
   where t.slug = 'poppers';
  if v_n = 0 then
    raise exception 'interactions: poppers still has no rows in the matrix';
  end if;

  -- Cross-migration integration check. This file no longer writes the pair —
  -- 20261002100200 does, from the FDA label — so this asserts that the two
  -- migrations together leave the platform's most safety-critical combination
  -- present and marked dangerous. If that migration is ever reverted or its
  -- slugs change, this fails here rather than the pair silently disappearing.
  if not exists (
    select 1 from public.substance_interactions i
     join public.unified_tags a on a.id = i.tag_a_id
     join public.unified_tags b on b.id = i.tag_b_id
    where (a.slug, b.slug) in (('poppers','viagra'), ('viagra','poppers'))
      and i.status = 'dangerous'
  ) then
    raise exception 'interactions: the poppers + erection-drug pair is missing or not marked dangerous';
  end if;

  -- The canonical-order CHECK would have raised already, but assert the
  -- invariant explicitly: no unordered pair may appear twice.
  select count(*) into v_n from (
    select least(tag_a_id, tag_b_id) a, greatest(tag_a_id, tag_b_id) b
      from public.substance_interactions
     group by 1, 2 having count(*) > 1
  ) d;
  if v_n > 0 then
    raise exception 'interactions: % unordered pair(s) stored twice', v_n;
  end if;

  -- Nothing may have overwritten a TripSit verdict.
  select count(*) into v_n
    from public.substance_interactions
   where source = 'tripsit'
     and source_url is distinct from 'https://combo.tripsit.me/';
  if v_n > 0 then
    raise exception 'interactions: % tripsit row(s) were modified', v_n;
  end if;

  -- Every myth row must be attributed and non-empty.
  select count(*) into v_n
    from public.tag_myth_facts
   where source = 'eve&rave Substanzhandbuch'
     and (coalesce(claim, '') = '' or coalesce(truth, '') = '' or source_url is null);
  if v_n > 0 then
    raise exception 'interactions: % myth/fact row(s) incomplete', v_n;
  end if;

  select count(*) into v_n
    from public.tag_myth_facts where source = 'eve&rave Substanzhandbuch';
  if v_n < 20 then
    raise exception 'interactions: only % myth/fact row(s) landed, expected at least 20', v_n;
  end if;

  raise notice 'interactions: % pairs added (% -> %), % myth/fact rows',
    v_after - v_before, v_before, v_after, v_n;
end
$mig$;
