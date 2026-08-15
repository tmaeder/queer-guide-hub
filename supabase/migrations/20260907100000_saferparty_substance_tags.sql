-- Substance vocabulary imported from saferparty.ch, wired into the tag ontology.
--
-- WHY THIS EXISTS
--
-- `/tags` is the public glossary and `Substances & Harm Reduction` is one of its
-- 44 category nodes — but the branch was effectively empty. Measured before this
-- migration: of the substance terms that existed at all, only Alcohol (37 uses),
-- Cannabis (3), Methamphetamine (4), Crystal Meth (2), Tobacco (1) and Chemsex
-- (12) were `status='active'`. MDMA, LSD, Cocaine, Ketamine, Heroin, GHB,
-- Poppers, Psilocybin, Mescaline, Mephedrone, Fentanyl, Tramadol, Kratom, 2C-B,
-- DMT, Caffeine, Amphetamine and ~20 more were all sitting at
-- `status='deprecated'`, because `deprecate_unused_tags()` prunes any active tag
-- with zero usage and nothing had ever linked them to content.
--
-- So this is a REVIVE, not a blind insert. Every row below is upserted by slug;
-- the ones that already exist keep their id, their assignments and their history.
--
-- `human_reviewed = true` IS LOAD-BEARING, TWICE
--
--   1. `deprecate_unused_tags()` skips human_reviewed tags. Without it, every tag
--      seeded here is deprecated again on the next nightly run — which is exactly
--      how the previous generation of these tags died.
--   2. `enforce_tag_seo_sensitivity_gate()` forces `seo_indexable := false` when
--      `is_sensitive IS TRUE AND human_reviewed IS NOT TRUE`. Since every row here
--      is deliberately `is_sensitive`, the flag is the only thing keeping these
--      pages in sitemap-tags.xml.
--
-- WHY is_sensitive = true ON ALL OF THEM
--
-- `unified_tags_public_gated_read` lets anon see a sensitive tag only when
-- `verification_status IN ('reviewed','locked')` — hence `'reviewed'` below, the
-- same pairing the intimate-kink seed uses. `is_sensitive` is what renders
-- `TagSafetyCallout`, which supplies the harm-reduction framing and the /help
-- link. It does NOT age-gate: `isAdultTag()` keys off `is_adult`, which is
-- trigger-derived from the Sexuality & Kink subtree and is deliberately not set
-- here. A harm-reduction page behind an age wall helps nobody.
--
-- THE PROSE IS OURS
--
-- saferparty.ch is "© since 2021 by saferparty" with no reuse licence, so not one
-- sentence is copied. Descriptions are original, factual, and deliberately carry
-- no dosage, no route of administration and no combination advice — the link out
-- to saferparty is where that belongs, and they maintain it.
--
-- CATEGORY ASSIGNMENTS ARE WRITTEN ROW BY ROW, ON PURPOSE
--
-- `sync_tag_category_assignment` (BEFORE UPDATE on unified_tags) writes
-- tag_category_assignments, and `unified_tags_recompute_is_adult` (AFTER on
-- tag_category_assignments) writes back to unified_tags. A set-based statement
-- that touches one unified_tags tuple twice throws 27000 "tuple already
-- modified". The established avoidance (20260803035653, 20260607142000) is: never
-- set `unified_tags.category_id` in bulk, insert into tag_category_assignments
-- directly, one row per statement.

set local statement_timeout = '600s';

do $mig$
declare
  v_cat_id uuid;
  v_tag_id uuid;
  v_class_id uuid;
  r record;
  a text;
  v_n int;
  v_skipped int := 0;
begin
  perform set_config('app.actor', 'admin:saferparty-substance-import', true);

  select id into strict v_cat_id from public.tag_categories where slug = 'substances-harm-reduction';

  ---------------------------------------------------------------------------
  -- 1. The vocabulary.
  --    `classes` are the saferparty drug-class groupings; they become `broader`
  --    edges in step 4. A row whose slug is itself a class (anabolic-steroids,
  --    new-psychoactive-substances) carries an empty class list — tag_relations
  --    CHECKs source_tag_id <> target_tag_id, so a self-edge would raise.
  ---------------------------------------------------------------------------
  create temp table _sub (
    slug text primary key,
    name text not null,
    classes text[] not null default '{}',
    descr text not null,
    aliases text[] not null default '{}',
    sp text
  ) on commit drop;

  insert into _sub (slug, name, classes, descr, aliases, sp) values
  -- ── drug classes ────────────────────────────────────────────────────────
  ('psychedelics','Psychedelics','{}',
   'Substances that alter perception, thought and mood, typically by acting on serotonin receptors. Effects depend heavily on dose, setting and the user''s state of mind, and a difficult experience is the most common adverse outcome.',
   '{"Hallucinogens","Psychedelic drugs"}', null),
  ('opioids','Opioids','{}',
   'Substances acting on the body''s opioid receptors, ranging from poppy-derived opiates to fully synthetic compounds. They carry the highest overdose risk of any drug class because they suppress breathing, and that risk rises sharply when combined with alcohol or benzodiazepines.',
   '{"Opiates","Narcotics"}', null),
  ('stimulants','Stimulants','{}',
   'Substances that increase alertness, energy and heart rate. Common harms are cardiovascular strain, overheating, sleep loss and a depleted comedown.',
   '{"Uppers"}', null),
  ('depressants','Depressants','{}',
   'Substances that slow the central nervous system, producing sedation and disinhibition. Combining two depressants — or one with an opioid — multiplies the risk of unconsciousness and respiratory failure.',
   '{"Downers","Sedatives"}', null),
  ('dissociatives','Dissociatives','{}',
   'Substances that produce a sense of detachment from the body and surroundings, mainly by blocking NMDA receptors. Loss of coordination and reduced awareness of pain and danger are the characteristic risks.',
   '{"Dissociativa","Dissociative drugs"}', null),
  ('new-psychoactive-substances','New Psychoactive Substances','{}',
   'Compounds designed to reproduce the effects of established drugs while falling outside existing drug laws. Because they are new, potency and toxicity are often poorly documented, and a substance sold under one name may be an unrelated compound.',
   '{"NPS","Research chemicals","Legal highs","Designer drugs"}', null),
  ('herbal-drugs','Herbal Drugs','{}',
   'Psychoactive substances taken as plants, fungi or minimally processed plant extracts. Natural origin says nothing about safety, and potency between batches of the same plant can vary widely.',
   '{"Plant drugs","Botanical drugs"}', null),
  ('cannabinoids','Cannabinoids','{}',
   'Compounds acting on the body''s cannabinoid receptors, whether derived from the cannabis plant or made synthetically. Synthetic cannabinoids are far more potent than plant cannabis and behave very differently.',
   '{}', null),
  ('medicines','Medicines','{}',
   'Pharmaceuticals used outside a prescription, or prescribed drugs used recreationally. Falsified tablets sold as brand-name medicines are a growing source of unexpected overdose.',
   '{"Pharmaceuticals","Prescription drugs"}', null),
  ('anabolic-steroids','Anabolic Steroids','{}',
   'Synthetic derivatives of testosterone used to increase muscle mass. Long-term use affects the heart, liver and the body''s own hormone production, and injecting equipment carries a blood-borne infection risk.',
   '{"AAS","Anabolic Androgenic Steroids","Steroids","Roids"}',
   'anabole-androgene-steroide-aas'),
  ('benzodiazepines','Benzodiazepines','{"medicines","depressants"}',
   'A family of sedative medicines prescribed for anxiety, insomnia and seizures. Tolerance and physical dependence build quickly, and abrupt withdrawal after sustained use can be medically dangerous.',
   '{"Benzos","Benzo"}', 'benzodiazepine'),

  -- ── substances ──────────────────────────────────────────────────────────
  ('2c-b','2C-B','{"psychedelics"}',
   'A synthetic phenethylamine with combined psychedelic and stimulant effects. The gap between a mild and an overwhelming dose is narrow, and it is sometimes mis-sold as MDMA.',
   '{"2C-x"}', '2c-b-2c-x'),
  ('2-mmc','2-MMC','{"new-psychoactive-substances","stimulants"}',
   'A synthetic cathinone closely related to 3-MMC, sold as a stimulant. It appeared as a replacement after 3-MMC was restricted, and its effects and risks are correspondingly less documented.',
   '{"2-Methylmethcathinone"}', '2-mmc-2-methylmethcathinon'),
  ('3-cmc-4-cmc','3-CMC / 4-CMC','{"new-psychoactive-substances","stimulants"}',
   'Two closely related synthetic cathinones sold as stimulants, often as a substitute for mephedrone. Samples sold under one name frequently contain the other.',
   '{"Clophedron","3-CMC","4-CMC"}', 'clophedron'),
  ('3-mmc','3-MMC','{"new-psychoactive-substances","stimulants"}',
   'A synthetic cathinone with stimulant and empathogenic effects, widely used in chemsex settings. Compulsive redosing is a well-documented pattern with this substance.',
   '{"3-Methylmethcathinone"}', '3-methylmethcathinon'),
  ('4-fa','4-FA','{"new-psychoactive-substances","stimulants"}',
   'A fluorinated amphetamine with effects between those of amphetamine and MDMA. It has been associated with sudden severe headaches and bleeding in the brain.',
   '{"4-Fluoroamphetamine","4-FMP"}', '4-fa'),
  ('mephedrone','Mephedrone','{"new-psychoactive-substances","stimulants"}',
   'A synthetic cathinone with stimulant and empathogenic effects, common in chemsex settings. Short duration encourages repeated redosing, which drives most of its harm.',
   '{"4-MMC","Meow Meow","M-CAT"}', 'mephedron'),
  ('6-apb','6-APB','{"new-psychoactive-substances","stimulants"}',
   'A benzofuran stimulant with empathogenic effects, sometimes sold as "Benzo Fury". Its unusually long duration and cardiovascular strain are the main concerns.',
   '{"Benzo Fury"}', '6-apb'),
  ('alcohol','Alcohol','{"depressants"}',
   'The most widely used psychoactive substance in the world, and a depressant despite its initial stimulating feel. It is the drug most often involved in dangerous combinations, because it deepens the sedation of every other depressant and opioid.',
   '{"Ethanol","Booze"}', 'alkohol'),
  ('alprazolam','Alprazolam','{"benzodiazepines","medicines","depressants"}',
   'A short-acting benzodiazepine prescribed for anxiety and panic, sold under the brand name Xanax. Counterfeit tablets are common and have been found to contain far stronger benzodiazepines or synthetic opioids.',
   '{"Xanax","Xanor"}', 'benzodiazepine'),
  ('amphetamine','Amphetamine','{"stimulants"}',
   'A stimulant sold as powder or paste, commonly called speed. Street samples are usually heavily cut, so purity — and therefore strength — varies enormously between batches.',
   '{"Speed","Amphetamines"}', 'amphetamin-speed'),
  ('buprenorphine','Buprenorphine','{"opioids","medicines"}',
   'A partial opioid agonist used both as a painkiller and as opioid substitution treatment. It binds very tightly to opioid receptors, which can trigger sudden withdrawal in someone still dependent on another opioid.',
   '{"Subutex","Temgesic"}', 'buprenorphin-subutex'),
  ('cannabis','Cannabis','{"cannabinoids","herbal-drugs"}',
   'The most widely used illegal drug, taken as dried flower, resin or edibles. Edibles take far longer to take effect than smoking, which is the usual reason people accidentally take too much.',
   '{"Marijuana","Weed"}', 'cannabis'),
  ('codeine','Codeine','{"opioids","medicines"}',
   'A mild opioid found in many cough and pain preparations, converted by the body into morphine. How strongly it acts varies genetically between individuals, so the same amount affects people very differently.',
   '{}', 'codein'),
  ('dexamphetamine','Dexamphetamine','{"stimulants","medicines"}',
   'The more active mirror-image form of amphetamine, prescribed for ADHD and narcolepsy and sold as Adderall in combination form. Recreational use outside a prescription carries the cardiovascular and sleep-loss risks of any stimulant.',
   '{"Adderall","Dexamfetamine","Dextroamphetamine"}', 'dexamphetamin-und-adderall'),
  ('dextromethorphan','Dextromethorphan','{"opioids","medicines","dissociatives"}',
   'A cough suppressant that becomes dissociative at high doses. It interacts dangerously with antidepressants, and many cough preparations contain additional ingredients that are toxic in the amounts involved.',
   '{"DXM","Bexin"}', 'dextromethorphan-oder-bexin-r'),
  ('diacetylmorphine','Diacetylmorphine','{"opioids","medicines"}',
   'The pharmaceutical name for heroin, prescribed in some countries — Switzerland among them — as a treatment for severe opioid dependence. A known, consistent dose is precisely what distinguishes it from the street supply.',
   '{"Diaphin","Pharmaceutical heroin"}', 'diacetylmorphin-diaphin'),
  ('diazepam','Diazepam','{"benzodiazepines","medicines","depressants"}',
   'A long-acting benzodiazepine sold as Valium, used for anxiety, muscle spasm and seizures. Its long duration means it accumulates with repeated use, and effects can persist well into the following day.',
   '{"Valium"}', 'diazepam-valium'),
  ('dmt','DMT','{"psychedelics","herbal-drugs"}',
   'A short-acting psychedelic found in many plants, smoked as freebase or drunk as ayahuasca. In ayahuasca form it is combined with an MAO inhibitor, which interacts dangerously with many antidepressants and other drugs.',
   '{"Changa","Ayahuasca","5-MeO-DMT"}', 'dmt-und-5-meo-dmt'),
  ('dom-doi-dob-doc','DOM / DOI / DOB / DOC','{"psychedelics","new-psychoactive-substances"}',
   'A family of long-acting amphetamine-based psychedelics. Effects can last more than a day and are slow to begin, which is why they are sometimes mistaken for a weak dose and redosed.',
   '{"DOM","DOI","DOB","DOC"}', 'dom-doi-dob'),
  ('ephedrine','Ephedrine','{"stimulants"}',
   'A stimulant derived from ephedra plants, used medically as a decongestant. It raises blood pressure and heart rate, and is sometimes used to bulk out amphetamine and cocaine.',
   '{}', 'ephedrin'),
  ('etizolam','Etizolam','{"benzodiazepines","medicines","depressants"}',
   'A benzodiazepine-like sedative not licensed as a medicine in most of Europe. It appears in counterfeit tablets sold as pharmaceutical benzodiazepines, at unpredictable strengths.',
   '{}', 'etizolam'),
  ('fentanyl','Fentanyl','{"opioids","medicines"}',
   'A synthetic opioid roughly a hundred times stronger than morphine, used clinically for severe pain. Because an active dose is measured in micrograms, contamination of other drugs with fentanyl is a leading cause of fatal overdose.',
   '{}', 'fentanyl'),
  ('flualprazolam','Flualprazolam','{"benzodiazepines","medicines","depressants"}',
   'A designer benzodiazepine never developed as a medicine, substantially stronger than alprazolam. It is a frequent contaminant of counterfeit Xanax tablets.',
   '{}', 'flualprazolam'),
  ('flunitrazepam','Flunitrazepam','{"benzodiazepines","medicines","depressants"}',
   'A potent long-acting benzodiazepine sold as Rohypnol. It causes pronounced memory gaps, and is one of the substances most associated with drug-facilitated assault.',
   '{"Rohypnol","Roofies"}', 'flunitrazepam-rohypnol'),
  ('ghb','GHB','{"depressants"}',
   'A liquid depressant used both in nightlife and in chemsex, along with its precursors GBL and BDO. The margin between the intended effect and unconsciousness is extremely small, and it is measured in millilitres — combining it with alcohol is a common cause of collapse.',
   '{"GBL","BDO","Liquid Ecstasy","Gamma-Hydroxybutyrate"}', 'ghb-gbl'),
  ('heroin','Heroin','{"opioids"}',
   'A fast-acting opioid derived from morphine. Purity varies unpredictably between batches, and contamination with synthetic opioids such as fentanyl or nitazenes has made overdose risk much harder to judge.',
   '{"Diamorphine","Smack"}', 'heroin'),
  ('ibogaine','Ibogaine','{"herbal-drugs","psychedelics"}',
   'A long-acting psychoactive alkaloid from the iboga shrub, used traditionally in West Central Africa and studied for interrupting opioid dependence. It disturbs heart rhythm and has caused deaths, so it is not a substance to take without cardiac monitoring.',
   '{"Iboga"}', 'ibogain'),
  ('ketamine','Ketamine','{"dissociatives","medicines"}',
   'A dissociative anaesthetic used in human and veterinary medicine and taken recreationally for its detached, dreamlike effects. Regular heavy use causes lasting bladder damage, and high doses produce immobilising detachment known as a k-hole.',
   '{"Special K"}', 'ketamin'),
  ('caffeine','Caffeine','{"stimulants","herbal-drugs"}',
   'The world''s most widely consumed stimulant, found in coffee, tea and energy drinks. It is also a common cutting agent in illicit stimulant powders.',
   '{}', 'koffein'),
  ('cocaine','Cocaine','{"stimulants"}',
   'A short-acting stimulant extracted from the coca plant, used as powder or as crack. Combining it with alcohol forms cocaethylene in the body, which puts additional strain on the heart.',
   '{"Crack Cocaine"}', 'kokain'),
  ('kratom','Kratom','{"herbal-drugs","opioids"}',
   'The leaves of a Southeast Asian tree, stimulating at low doses and opioid-like at higher ones. Daily use leads to dependence and an opioid-type withdrawal.',
   '{"Mitragyna speciosa"}', 'kratom'),
  ('nitrous-oxide','Nitrous Oxide','{"dissociatives"}',
   'A short-acting dissociative gas used medically as an anaesthetic and recreationally from cartridges or balloons. Regular use depletes vitamin B12 and can cause lasting nerve damage; inhaling directly from a pressurised canister risks freeze injury and suffocation.',
   '{"Laughing gas","Nitrous","Whippits","N2O"}', 'lachgas'),
  ('lorazepam','Lorazepam','{"benzodiazepines","medicines","depressants"}',
   'A medium-acting benzodiazepine sold as Temesta, prescribed for anxiety and as a sedative. As with all benzodiazepines, dependence develops quickly with regular use.',
   '{"Temesta","Ativan"}', 'lorazepam-temesta'),
  ('lsd','LSD','{"psychedelics"}',
   'One of the most potent known psychedelics, active in microgram amounts and usually sold on blotter paper. Blotters sold as LSD sometimes contain NBOMe compounds instead, which are considerably more dangerous.',
   '{"Lysergic acid diethylamide"}', 'lsd'),
  ('mda-mdea-mbdb','MDA / MDEA / MBDB','{"new-psychoactive-substances"}',
   'Three chemical relatives of MDMA with broadly similar empathogenic effects. MDA in particular lasts longer, is more stimulating and more psychedelic, and is sometimes sold as MDMA.',
   '{"MDA","MDEA","MBDB"}', 'mda-mdea-mbdb'),
  ('mdma','MDMA','{"stimulants"}',
   'An empathogenic stimulant central to dance-music culture, sold as crystal or in pressed tablets. Overheating and drinking too much water are the two classic acute risks, and tablet strength varies widely between batches.',
   '{"Ecstasy","XTC"}', 'mdma'),
  ('mescaline','Mescaline','{"psychedelics","herbal-drugs"}',
   'A psychedelic found in peyote, San Pedro and related cacti, with a long history of ceremonial use. Nausea early in the experience is common, and the effects last most of a day.',
   '{"Peyote"}', 'meskalin'),
  ('methamphetamine','Methamphetamine','{"stimulants"}',
   'A long-acting and strongly reinforcing stimulant, known as crystal meth and widely used in chemsex settings. Its duration means sessions can run for days, and the resulting sleep deprivation drives much of the psychological harm.',
   '{"Crystal Meth","Meth","Tina"}', 'methamphetamin'),
  ('methcathinone','Methcathinone','{"stimulants"}',
   'A stimulant chemically related to the cathinones found in khat. Home synthesis using permanganate has caused irreversible manganese poisoning with Parkinson-like symptoms.',
   '{"Ephedrone"}', 'methcathinon'),
  ('methylone','Methylone','{"stimulants","new-psychoactive-substances"}',
   'A synthetic cathinone with effects resembling a shorter, more stimulating MDMA. It has been sold as MDMA and under names such as Explosion and Ease.',
   '{"bk-MDMA"}', 'methylon-explosion-ease'),
  ('methylphenidate','Methylphenidate','{"stimulants","medicines"}',
   'A stimulant prescribed for ADHD, sold as Ritalin and Concerta. Crushing and snorting or injecting the tablets defeats their slow-release design and adds risks from the tablet fillers.',
   '{"Ritalin","Concerta"}', 'methylphenidat'),
  ('midazolam','Midazolam','{"benzodiazepines","medicines","depressants"}',
   'A short-acting benzodiazepine sold as Dormicum, used for sedation before medical procedures. It suppresses breathing more readily than most benzodiazepines.',
   '{"Dormicum"}', 'midazolam-dormicum'),
  ('modafinil','Modafinil','{"stimulants","medicines"}',
   'A wakefulness-promoting medicine prescribed for narcolepsy and used off-label to stay alert. It reduces the effectiveness of hormonal contraception, which is an easily missed interaction.',
   '{"Provigil","Modasomil"}', 'modafinil'),
  ('mdphp','MDPHP','{"new-psychoactive-substances","stimulants"}',
   'A synthetic cathinone known as Monkey Dust, with strong and long-lasting stimulant effects. It is associated with agitation, paranoia and compulsive redosing.',
   '{"Monkey Dust"}', 'mdphp-monkey-dust'),
  ('morphine','Morphine','{"opioids","medicines"}',
   'The reference opioid painkiller, extracted from the opium poppy. Slow-release formulations crushed for faster effect deliver the entire dose at once, which is a common route to overdose.',
   '{"Morphium"}', 'morphin-morphium'),
  ('nep-neh','NEP / NEH','{"new-psychoactive-substances","stimulants"}',
   'Two synthetic cathinones sold as stimulants, part of the wave of compounds replacing restricted cathinones. Little reliable information exists on their toxicity.',
   '{"N-Ethylpentedrone","N-Ethylhexedrone"}', 'nep-neh'),
  ('neuroleptics','Neuroleptics','{"medicines","depressants"}',
   'Antipsychotic medicines prescribed for psychosis and bipolar disorder, sometimes taken to blunt a stimulant comedown. They are not sedatives and can cause severe movement disorders and dangerous drops in blood pressure.',
   '{"Antipsychotics"}', 'neuroleptika'),
  ('nitazenes','Nitazenes','{"opioids","medicines"}',
   'A family of synthetic opioids never brought to market as medicines, some considerably stronger than fentanyl. They have appeared in falsified tablets and in samples sold as heroin, causing overdose clusters across Europe.',
   '{"Nitazene","Isotonitazene","Metonitazene"}', 'nitazene'),
  ('oxazepam','Oxazepam','{"benzodiazepines","medicines","depressants"}',
   'A slow-onset benzodiazepine sold as Seresta, often used in alcohol withdrawal. Its gradual onset makes it comparatively less sought after recreationally.',
   '{"Seresta","Anxiolit"}', 'oxazepam-seresta'),
  ('oxycodone','Oxycodone','{"opioids","medicines"}',
   'A strong opioid painkiller central to the North American overdose crisis. Counterfeit oxycodone tablets containing fentanyl or nitazenes are now widespread.',
   '{"OxyContin","Percocet"}', 'oxycodon'),
  ('poppers','Poppers','{"medicines"}',
   'Volatile alkyl nitrites inhaled for a brief head-rush and for relaxing smooth muscle, long established in gay sexual culture. They must never be combined with erectile-dysfunction drugs such as Viagra — the combination can cause a catastrophic drop in blood pressure — and swallowing them rather than inhaling is potentially fatal.',
   '{"Amyl nitrite","Alkyl nitrites","Isopropyl nitrite"}', 'poppers'),
  ('pregabalin','Pregabalin','{"medicines","depressants"}',
   'A medicine for nerve pain, epilepsy and anxiety, sold as Lyrica and increasingly used recreationally. It markedly increases the respiratory risk of opioids, and withdrawal after regular use is difficult.',
   '{"Lyrica"}', 'pregabalin'),
  ('psilocybin','Psilocybin','{"psychedelics","herbal-drugs"}',
   'The psychedelic compound in more than two hundred species of mushroom, converted in the body to psilocin. The main practical risk is misidentification: several deadly poisonous mushrooms resemble psilocybin-containing species.',
   '{"Magic Mushrooms","Psilocin","Psilocybin Mushrooms"}', 'psilocybin'),
  ('salvia-divinorum','Salvia Divinorum','{"herbal-drugs","psychedelics"}',
   'A sage from Oaxaca whose active compound produces an intense, disorienting and very short dissociative experience. Users frequently lose awareness of their surroundings entirely, so a sober sitter matters more than with most substances.',
   '{"Salvia","Ska Maria Pastora"}', 'salvia-divinorum'),
  ('synthetic-cannabinoids','Synthetic Cannabinoids','{"cannabinoids","new-psychoactive-substances"}',
   'Laboratory-made compounds sprayed onto plant material and sold as legal cannabis substitutes, under names such as Spice. They are far more potent than plant cannabis, spread unevenly across the material, and have caused seizures and deaths that cannabis does not.',
   '{"K2","Synthetic cannabis"}', 'synthetische-cannabinoide'),
  ('tobacco','Tobacco','{"stimulants","herbal-drugs"}',
   'The dried leaves of the tobacco plant, smoked or taken orally for their nicotine content. It is the most lethal drug in ordinary use, almost entirely through long-term smoking-related disease rather than acute harm.',
   '{"Nicotine","Cigarettes","Snus"}', 'tabak-nikotin'),
  ('tilidine','Tilidine','{"opioids","medicines"}',
   'An opioid painkiller formulated with naloxone to deter injection. Taken in large amounts by mouth it produces opioid effects, and dependence follows the usual opioid pattern.',
   '{"Valoron"}', 'tilidin'),
  ('tramadol','Tramadol','{"opioids","medicines"}',
   'A widely prescribed opioid painkiller that also acts on serotonin and noradrenaline. It lowers the seizure threshold and can cause serotonin syndrome when combined with antidepressants.',
   '{"Tramal","Ultram"}', 'tramadol'),
  ('viagra','Viagra','{"medicines"}',
   'Sildenafil, prescribed for erectile dysfunction and widely used recreationally. It must never be combined with poppers or any other nitrite: together they can cause a sudden, dangerous collapse in blood pressure.',
   '{"Sildenafil"}', 'viagra-r');

  ---------------------------------------------------------------------------
  -- 2. Upsert the tags.
  --    One row per statement. The BEFORE triggers rewrite name and slug, so the
  --    assertion in step 8 is what proves we landed on the slugs we intended.
  ---------------------------------------------------------------------------
  for r in select * from _sub order by slug loop
    insert into public.unified_tags (
      name, slug, entity_kind, status, description, short_description,
      is_sensitive, sensitive_topics, verification_status, human_reviewed,
      seo_indexable, last_verified_at
    ) values (
      r.name, r.slug, 'concept', 'active', r.descr, split_part(r.descr, '. ', 1) || '.',
      true, array['substance use','harm reduction'], 'reviewed', true,
      true, now()
    )
    on conflict (slug) do update set
      name              = excluded.name,
      entity_kind       = 'concept',
      status            = 'active',
      description       = excluded.description,
      short_description = excluded.short_description,
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
  -- 3. File every tag under Substances & Harm Reduction.
  --    Written straight into tag_category_assignments, one row per statement —
  --    see the 27000 note in the header.
  ---------------------------------------------------------------------------
  for r in select s.slug, t.id as tag_id
           from _sub s join public.unified_tags t on t.slug = s.slug order by s.slug loop
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    values (r.tag_id, v_cat_id, true)
    on conflict (tag_id, category_id) do update set is_primary = true;
  end loop;

  ---------------------------------------------------------------------------
  -- 4. Fold the duplicate spellings in.
  --
  --    THIS RUNS BEFORE THE ALIASES, AND THE ORDER IS LOAD-BEARING.
  --    `tag_alias_reject_shadow()` raises when an alias_slug is also the slug of
  --    a *live* tag owned by somebody else — so "Crystal Meth" cannot be filed as
  --    an alias of Methamphetamine while `crystal-meth` is still active. Merging
  --    first flips the duplicate to status='merged', which clears the guard, and
  --    merge_tag_concept writes that alias itself as part of the merge. Measured
  --    against the full alias list, exactly two rows tripped this: `marijuana`
  --    (1 assignment) and `crystal-meth` (2) — both genuine duplicates, so both
  --    are merged rather than worked around.
  --
  --    merge_tag_concept raises rather than no-ops (already merged, same id,
  --    missing tag, do-not-merge pair), so each call is guarded — that is what
  --    makes re-running this migration safe.
  --
  --    NOT MERGED, DELIBERATELY: jalapeno-poppers, mushrooms (27 uses, filed
  --    under Places & Travel), portobello-/porcini-/wild-/stuffed-/creamy-/
  --    fried-mushrooms, mushroom-soup, mushroom-sauce. Those are food, and the
  --    slug similarity to poppers and psilocybin is a coincidence. `slam` and
  --    `slamming` are chemsex injection practices, not substances, and stay.
  ---------------------------------------------------------------------------
  for r in select * from (values
      ('mdma',            'mdmaecstasy'),
      ('diazepam',        'valium'),
      ('alprazolam',      'xanax'),
      ('methamphetamine', 'crystal-meth'),
      ('methamphetamine', 'meth'),
      ('tobacco',         'nicotine'),
      ('psilocybin',      'magic-mushrooms'),
      ('psilocybin',      'psilocybin-mushrooms'),
      ('ghb',             'ghb-gbl'),
      ('amphetamine',     'speed'),
      ('amphetamine',     'amphetamines'),
      ('dexamphetamine',  'dextroamphetamine'),
      ('anabolic-steroids','steroids'),
      ('benzodiazepines', 'benzos'),
      ('cocaine',         'crack-cocaine'),
      ('cannabis',        'marijuana'),
      ('viagra',          'viagra-sildenafil')
    ) as m(canon, dup) loop
    begin
      perform public.merge_tag_concept(
        (select id from public.unified_tags where slug = r.canon),
        (select id from public.unified_tags where slug = r.dup),
        'admin:saferparty-substance-import', 'saferparty-import');
    exception when others then
      raise notice 'merge % <- % skipped: %', r.canon, r.dup, sqlerrm;
    end;
  end loop;

  -- merge_tag_concept overwrites app.actor; restore it for the trailing writes.
  perform set_config('app.actor', 'admin:saferparty-substance-import', true);

  ---------------------------------------------------------------------------
  -- 5. Ontology: substance --broader--> class, plus aliases and the citation.
  --    `run_tag_assignment_reconcile` matches on name/slug/alias, so aliases are
  --    also how street names ("Tina", "Molly", "Ecstasy") reach the right
  --    canonical tag when they appear in an entity's tags[] array.
  --
  --    The NOT EXISTS is the same shadow rule the trigger enforces, applied here
  --    so a future collision degrades to a skipped alias instead of aborting the
  --    whole import. It should never fire given the merges above; v_skipped is
  --    reported so that if it ever does, it is not silent.
  ---------------------------------------------------------------------------
  for r in select * from _sub order by slug loop
    select id into v_tag_id from public.unified_tags where slug = r.slug;

    foreach a in array r.classes loop
      select id into v_class_id from public.unified_tags where slug = a;
      if v_class_id is not null and v_class_id <> v_tag_id then
        insert into public.tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
        values (v_tag_id, v_class_id, 'broader', 1.0, 'approved')
        on conflict (source_tag_id, target_tag_id, relation_type) do nothing;
      end if;
    end loop;

    foreach a in array r.aliases loop
      insert into public.tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
      select v_tag_id, a, public.normalize_tag_slug(a), 'synonym', 'approved'
      where not exists (
        select 1 from public.unified_tags u
         where lower(u.slug) = public.normalize_tag_slug(a)
           and u.status = 'active' and u.id <> v_tag_id)
      on conflict (alias_slug) do nothing;

      if exists (select 1 from public.unified_tags u
                  where lower(u.slug) = public.normalize_tag_slug(a)
                    and u.status = 'active' and u.id <> v_tag_id) then
        v_skipped := v_skipped + 1;
        raise notice 'alias % for % skipped: shadows a live tag', a, r.slug;
      end if;
    end loop;

    -- Cite saferparty. `source_type='editorial'` is in the CHECK vocabulary;
    -- the German path is the stable one, en.saferparty.ch mirrors it.
    if r.sp is not null then
      delete from public.tag_sources
       where tag_id = v_tag_id and source_url like 'https://en.saferparty.ch/%';
      insert into public.tag_sources (tag_id, source_type, source_url, claim_summary, fetched_at)
      values (v_tag_id, 'editorial', 'https://en.saferparty.ch/substanzen/' || r.sp,
              'Drug information and safer-use guidance from saferparty.ch, the harm-reduction service of the City of Zurich.',
              now());
    end if;
  end loop;

  ---------------------------------------------------------------------------
  -- 8. Assertions. A silent partial import is the failure mode worth paying for.
  ---------------------------------------------------------------------------
  select count(*) into v_n
    from _sub s
    left join public.unified_tags t on t.slug = s.slug
   where t.id is null;
  if v_n > 0 then
    raise exception 'saferparty import: % expected slugs missing after upsert', v_n;
  end if;

  select count(*) into v_n
    from _sub s join public.unified_tags t on t.slug = s.slug
   where t.status <> 'active' or t.human_reviewed is not true
      or t.is_sensitive is not true or t.seo_indexable is not true
      or t.verification_status <> 'reviewed';
  if v_n > 0 then
    raise exception 'saferparty import: % tags did not land in the publishable state', v_n;
  end if;

  select count(*) into v_n
    from _sub s join public.unified_tags t on t.slug = s.slug
    left join public.tag_category_assignments ca
      on ca.tag_id = t.id and ca.category_id = v_cat_id
   where ca.tag_id is null;
  if v_n > 0 then
    raise exception 'saferparty import: % tags not filed under substances-harm-reduction', v_n;
  end if;

  -- Food must survive. This is the guard that would have caught a careless
  -- merge of jalapeno-poppers into poppers.
  if exists (
    select 1 from public.unified_tags
     where slug in ('jalapeno-poppers','mushrooms','mushroom-soup','portobello-mushrooms')
       and (status = 'merged' or merged_into_id is not null)
  ) then
    raise exception 'saferparty import: a food tag was merged into a substance tag';
  end if;

  raise notice 'saferparty import: % tags seeded, % aliases skipped as shadows',
    (select count(*) from _sub), v_skipped;
end
$mig$;

-- Recompute usage_count for everything touched, so the glossary index and the
-- nightly pruner both see the truth immediately rather than after the 04:20 cron.
select public.recount_all_tag_usage(500);
