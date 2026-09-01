-- Three things the fact-check found that a prose edit alone cannot fix.
--
-- 1. THE CORRECTED PAGES DO NOT EXIST. sildenafil, tadalafil, vardenafil,
--    avanafil, cialis, levitra, naloxone, estradiol, testosterone, descovy and
--    harm-reduction are all `status='deprecated'` and answer 404 on production,
--    verified by request. `deprecate_unused_tags()` prunes any active tag with
--    zero usage, and nothing had ever linked these to content — the same death
--    the substance vocabulary died before 20260907100000 revived it. Writing a
--    nitrite contraindication onto a 404 accomplishes nothing, so this is a
--    REVIVE, upserted by slug, keeping every existing id and its history.
--
--    `human_reviewed = true` is load-bearing twice, exactly as it is in that
--    migration: `deprecate_unused_tags` skips human-reviewed rows (without it
--    these are deprecated again on the next nightly run), and
--    `enforce_tag_seo_sensitivity_gate` forces `seo_indexable := false` on a
--    sensitive row that is not human-reviewed. `verification_status='reviewed'`
--    is what lets `unified_tags_public_gated_read` show a sensitive tag to an
--    anonymous reader at all.
--
--    ONE UPDATE PER SLUG, NOT A SET-BASED STATEMENT. `sync_tag_category_assignment`
--    (BEFORE UPDATE) writes tag_category_assignments and its AFTER trigger writes
--    back to unified_tags; a statement touching one tuple twice raises 27000
--    "tuple already modified". Established avoidance, per 20260907100000.
--
-- 2. THE INTERACTION CHART HAS NO NITRITE ROW. `substance_interactions` holds
--    421 pairs and not one covers poppers with an erectile-dysfunction drug —
--    the combination this readership most needs. It could not have: every row
--    is imported from TripSit, whose chart does not cover PDE5 inhibitors.
--    So these seven rows are cited to the FDA labels instead, and the component
--    is changed in the same commit to attribute per source rather than printing
--    "TripSit" under whatever it is given.
--
--    The chart's footer already says a combination it does not list is one it
--    says nothing about. That is honest, and it is exactly why this gap was
--    worth closing rather than relying on it.
--
-- 3. NO HEALTH TAG HAS EVER CARRIED A CLINICAL CITATION. Measured before
--    writing: `tag_sources` holds 8,813 rows, of which the health categories
--    have wikidata (493), wikipedia (425), saferparty.ch (59), dancesafe.org
--    (16), testfinder.info (3) and thedrugswheel.com (1). Zero from FDA,
--    DailyMed, PubMed, JAMA, The Lancet, NEJM, compendium.ch or APA.
--
--    These go in as `source_type='editorial'`, which is what
--    `get_tag_reference_links` (20260907100200) already publishes into the
--    "Elsewhere" rail, host-labelled. NOT `is_public`: that flag is reserved by
--    CHECK constraint for legal instruments carrying an official title,
--    jurisdiction and adopted year, and a drug label is not that shape. No
--    schema change and no new render surface is needed — `sourceHost()` will
--    label these dailymed.nlm.nih.gov, accessdata.fda.gov, pubmed.ncbi.nlm.nih.gov,
--    jamanetwork.com, thelancet.com, nejm.org, compendium.ch and apa.org.
--
--    `claim_summary` records WHICH claim each URL supports. The RPC deliberately
--    does not return it — only type and URL cross the boundary — so this is an
--    internal audit trail, which is the right place for it: the next person to
--    edit one of these sentences can see what it was checked against.

select set_config('app.actor', 'admin:health-tag-sources-20260828', true);

-- ── 1. Revive the pages the corrections were written for ─────────────────

do $revive$
declare
  v_slug text;
  -- Sensitive, because `is_sensitive` is what renders TagSafetyCallout and its
  -- link to /help. It does NOT age-gate: that is `is_adult`, trigger-derived
  -- from the Sexuality & Kink subtree and deliberately untouched here. A
  -- harm-reduction page behind an age wall helps nobody.
  v_sensitive text[] := array[
    'sildenafil','tadalafil','vardenafil','avanafil','cialis','levitra',
    'naloxone','estradiol','testosterone','descovy','harm-reduction'
  ];
begin
  foreach v_slug in array v_sensitive loop
    update public.unified_tags
       set status              = 'active',
           human_reviewed      = true,
           verification_status = 'reviewed',
           is_sensitive        = true,
           seo_indexable       = true,
           deprecated_at       = null,
           deprecation_reason  = null
     where slug = v_slug
       and status <> 'active';
  end loop;
end
$revive$;

-- ── 2. The nitrite rows the chart never had ──────────────────────────────

do $nitrites$
declare
  v_poppers uuid;
  v_other   uuid;
  v_slug    text;
  -- Per-drug, because the labels differ and flattening them would reintroduce
  -- the "wait 24 hours" folklore this whole audit had to correct.
  v_notes   jsonb := jsonb_build_object(
    'sildenafil', 'Absolute contraindication. The sildenafil label is the only one in this class whose contraindications name nitrites in any form, which is what poppers are. It states no safe waiting interval — the label says the interval after a dose is unknown. The widely repeated "24 hours" is clinical convention, not a labelled figure.',
    'viagra',     'Absolute contraindication. Viagra is sildenafil; its patient leaflet names poppers directly. The label states that it is unknown when nitrates can be given safely after a dose, so there is no labelled waiting time.',
    'tadalafil',  'Absolute contraindication. The label requires at least 48 hours between a dose and any nitrate — longer than the 36 hours for which the drug is marketed as effective. The Cialis label does not use the words poppers, amyl nitrite or nitrites anywhere; its contraindication is written in terms of organic nitrates and the mechanism is identical.',
    'cialis',     'Absolute contraindication. Cialis is tadalafil. At least 48 hours must pass between a dose and any nitrate, which outlasts the 36-hour effect window — "it has worn off" is not the same as "it is safe".',
    'vardenafil', 'Absolute contraindication with nitrates and nitric oxide donors, the category poppers belong to; the patient leaflet names them. The label states that a safe interval has not been determined.',
    'levitra',    'Absolute contraindication. Levitra is vardenafil. The label states that no safe interval between a dose and a nitrate has been determined.',
    'avanafil',   'Absolute contraindication. The label requires at least 12 hours between a dose and any nitrate — the shortest stated interval in the class — and quantifies the combination: with nitroglycerin, standing blood pressure fell by an average of 28/23 mmHg.'
  );
  v_urls jsonb := jsonb_build_object(
    'sildenafil', 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0b0be196-0c62-461c-94f4-9a35339b4501',
    'viagra',     'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0b0be196-0c62-461c-94f4-9a35339b4501',
    'tadalafil',  'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=bcd8f8ab-81a2-4891-83db-24a0b0e25895',
    'cialis',     'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=bcd8f8ab-81a2-4891-83db-24a0b0e25895',
    'vardenafil', 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=b3bbc16e-8305-469a-9dc3-8e698339a98b',
    'levitra',    'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=b3bbc16e-8305-469a-9dc3-8e698339a98b',
    'avanafil',   'https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=fa7d93e3-b69b-4e02-8146-89760cd8e9d6&type=display'
  );
begin
  select id into v_poppers from public.unified_tags where slug = 'poppers';
  if v_poppers is null then
    raise exception 'nitrite rows: no poppers tag';
  end if;

  foreach v_slug in array array['sildenafil','viagra','tadalafil','cialis','vardenafil','levitra','avanafil'] loop
    select id into v_other from public.unified_tags where slug = v_slug;
    continue when v_other is null;

    insert into public.substance_interactions
      (tag_a_id, tag_b_id, status, note, source, source_url, fetched_at)
    select least(v_poppers, v_other), greatest(v_poppers, v_other),
           'dangerous', v_notes ->> v_slug, 'FDA label', v_urls ->> v_slug, now()
    where not exists (
      select 1 from public.substance_interactions i
       where i.tag_a_id = least(v_poppers, v_other)
         and i.tag_b_id = greatest(v_poppers, v_other));
  end loop;
end
$nitrites$;

-- ── 3. Clinical citations ────────────────────────────────────────────────

do $cite$
declare
  r record;
  v_tag uuid;
  -- (slug, url, which claim this URL was read for)
  v_rows text[][] := array[
    -- PDE5 / nitrites
    ['poppers','https://pmc.ncbi.nlm.nih.gov/articles/PMC11765549/','UK series of 42 poppers deaths 1987-2018; ingestion far more dangerous than inhalation; one death attributed to combined alkyl nitrite and tadalafil toxicity'],
    ['poppers','https://pubmed.ncbi.nlm.nih.gov/29135704/','Poppers maculopathy: foveal ellipsoid-zone disruption, progression halts on cessation'],
    ['poppers','https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0b0be196-0c62-461c-94f4-9a35339b4501','Sildenafil label: contraindicated with nitric oxide donors, organic nitrates or organic nitrites in any form'],
    ['viagra','https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0b0be196-0c62-461c-94f4-9a35339b4501','Sildenafil label: nitrite contraindication; no safe post-dose interval stated'],
    ['viagra','https://pubmed.ncbi.nlm.nih.gov/10078539/','Sildenafil plus nitroglycerin: additional mean fall of ~23.8/14.9 mmHg vs placebo'],
    ['sildenafil','https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0b0be196-0c62-461c-94f4-9a35339b4501','Sildenafil label: nitrite and riociguat contraindication; safe interval unknown'],
    ['tadalafil','https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=bcd8f8ab-81a2-4891-83db-24a0b0e25895','Tadalafil label: at least 48 hours before nitrates; 36-hour efficacy window'],
    ['cialis','https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=bcd8f8ab-81a2-4891-83db-24a0b0e25895','Tadalafil label: 48-hour nitrate exclusion outlasts the 36-hour efficacy claim'],
    ['vardenafil','https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=b3bbc16e-8305-469a-9dc3-8e698339a98b','Vardenafil label: nitrates and nitric oxide donors contraindicated; safe interval not determined'],
    ['levitra','https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=b3bbc16e-8305-469a-9dc3-8e698339a98b','Vardenafil label: no safe interval determined'],
    ['avanafil','https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=fa7d93e3-b69b-4e02-8146-89760cd8e9d6&type=display','Avanafil label: at least 12 hours before nitrates; riociguat and vericiguat contraindicated; 28/23 mmHg standing fall with nitroglycerin'],
    ['erectile-dysfunction','https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0b0be196-0c62-461c-94f4-9a35339b4501','PDE5 inhibitor class contraindication with nitrates and nitrites'],
    ['vascular-health','https://pubmed.ncbi.nlm.nih.gov/10078539/','Haemodynamic interaction of PDE5 inhibition with nitric oxide donors'],

    -- HIV
    ['u-equals-u','https://jamanetwork.com/journals/jama/fullarticle/2533066','PARTNER: 888 couples, ~58,000 condomless acts, zero linked transmissions'],
    ['u-equals-u','https://pubmed.ncbi.nlm.nih.gov/31056293/','PARTNER2: 782 gay couples, 76,088 condomless anal sex acts, zero linked transmissions'],
    ['u-equals-u','https://pubmed.ncbi.nlm.nih.gov/30025681/','Opposites Attract: 12,447 condomless acts under suppression, zero linked transmissions'],
    ['u-equals-u','https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(23)00877-2/fulltext','Broyles et al.: 7,762 couples, no transmissions below 200 copies/mL'],
    ['hiv','https://www.thelancet.com/journals/lanhiv/article/PIIS2352-3018(23)00028-0/fulltext','Trickey et al.: 206,891 people; ~42 further years at age 40 starting ART after 2015 with CD4 >= 500'],
    ['hiv','https://pubmed.ncbi.nlm.nih.gov/11873003/','Morgan et al.: pre-ART median survival from seroconversion 9.8 years — the era the older figure describes'],
    ['antiretroviral-therapy','https://www.thelancet.com/journals/lanhiv/article/PIIS2352-3018(23)00028-0/fulltext','Life expectancy on modern ART'],
    ['prep','https://www.accessdata.fda.gov/drugsatfda_docs/appletter/2012/021752Orig1s030ltr.pdf','FDA approval of Truvada for PrEP, 16 July 2012'],
    ['prep','https://www.fda.gov/news-events/press-announcements/fda-approves-first-injectable-treatment-hiv-pre-exposure-prevention','FDA approval of cabotegravir (Apretude), first long-acting injectable PrEP'],
    ['prep','https://www.nejm.org/doi/full/10.1056/NEJMoa1506273','IPERGAY: event-driven 2-1-1 dosing, 86% relative reduction in MSM'],
    ['pep','https://pubmed.ncbi.nlm.nih.gov/40331832/','2025 nPEP guidance: first dose ideally within 24 hours, no later than 72; 28-day course'],
    ['descovy','https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/220018s000lbl.pdf','Emtricitabine/tenofovir alafenamide labelling context for PrEP indication and HBV boxed warning'],

    -- STIs
    ['syphilis','https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/600170','Benzathine penicillin does not achieve treponemicidal CSF levels; neurosyphilis requires IV therapy'],
    ['syphilis','https://www.ncbi.nlm.nih.gov/books/NBK534780/','Primary chancre: painless, indurated, highly infectious, heals spontaneously'],
    ['genital-herpes','https://www.journalofinfection.com/article/S0163-4453(25)00236-1/fulltext','HSV-1 has overtaken HSV-2 as the leading cause of first-episode genital herpes in high-income settings'],
    ['gonorrhea','https://www.thelancet.com/journals/laninf/article/PIIS1473-3099(24)00230-5/fulltext','Documented ceftriaxone-resistant Neisseria gonorrhoeae'],
    ['gonorrhea','https://pubmed.ncbi.nlm.nih.gov/15937765/','Urethral-only screening misses ~64% of gonorrhoea and ~53% of chlamydia in MSM'],
    ['chlamydia','https://academic.oup.com/cid/article/73/5/824/6144986','Doxycycline 91.9% vs azithromycin 71.9% microbiologic cure for rectal chlamydia'],
    ['hepatitis-b','https://www.ncbi.nlm.nih.gov/books/NBK493147/','Per-exposure transmission risk: HBV 23-62%, HCV ~1.8%, HIV ~0.3%'],
    ['hepatitis-a','https://www.eurosurveillance.org/content/10.2807/1560-7917.ES.2018.23.33.1700641','2016-17 European hepatitis A outbreak: 4,096 cases, 84% MSM, 92% unvaccinated'],
    ['hepatitis-c','https://www.ijidonline.com/article/S1201-9712(16)31073-6/fulltext','Sexual HCV acquisition in MSM: fisting, shared lubricant, rectal bleeding, group sex, chemsex'],
    ['mpox','https://www.nejm.org/doi/full/10.1056/NEJMoa2207323','528 cases across 16 countries; 95% suspected sexually transmitted'],
    ['shigella','https://pubmed.ncbi.nlm.nih.gov/37031199/','Genomic evidence of international spread of drug-resistant Shigella in MSM networks'],
    ['hpv','https://onlinelibrary.wiley.com/doi/10.1002/ijc.33185','Anal cancer incidence 85 per 100,000 person-years in MSM with HIV'],
    ['doxycycline','https://www.nejm.org/doi/full/10.1056/NEJMoa2211934','DoxyPEP trial: chlamydia RR 0.12, syphilis 0.13, gonorrhoea 0.45; tetracycline resistance signal'],

    -- Opioids
    ['naloxone','https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=724df050-5332-4d0a-9a5f-17bf08a547e1','Narcan label: opioid duration may exceed naloxone''s; repeat dosing and continued surveillance required'],
    ['naloxone','https://www.fda.gov/news-events/press-announcements/fda-approves-first-over-counter-naloxone-nasal-spray','FDA approval of over-the-counter naloxone nasal spray, March 2023'],
    ['fentanyl','https://www.accessdata.fda.gov/drugsatfda_docs/label/2023/016619s054lbl.pdf','Fentanyl citrate label: 100 mcg approximately equianalgesic to 10 mg morphine'],
    ['heroin','https://pmc.ncbi.nlm.nih.gov/articles/PMC12526229/','Nitazenes as adulterants across the illicit opioid supply; per-analogue potency range'],
    ['nitazenes','https://pmc.ncbi.nlm.nih.gov/articles/PMC12526229/','Nitazene potency spans sub-fentanyl to ~20x fentanyl; naloxone remains effective'],
    ['opioids','https://www.accessdata.fda.gov/drugsatfda_docs/label/2023/018708s029lbl.pdf','Boxed warning: opioids with benzodiazepines or alcohol may cause profound sedation, respiratory depression, coma and death'],
    ['tramadol','https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=2fd193e2-7aa7-4119-b540-7e28e82fbd13','Tramadol label: seizures within the recommended dose range; serotonin syndrome with serotonergic drugs'],
    ['pregabalin','https://www.fda.gov/safety/medical-product-safety-information/neurontin-gralise-horizant-gabapentin-and-lyrica-lyrica-cr-pregabalin-drug-safety-communication','FDA warning: serious breathing difficulties with gabapentinoids plus opioids or other CNS depressants'],
    ['cotton-fever','https://pubmed.ncbi.nlm.nih.gov/8215743/','The originating 1993 case report: unknown etiology, Enterobacter agglomerans the probable agent'],
    ['overdose','https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=724df050-5332-4d0a-9a5f-17bf08a547e1','Recurrent respiratory depression after naloxone reversal'],

    -- Hormones
    ['estradiol','https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=c714974b-766f-42f2-a846-b0c1f5a60560','Label names the drug substance estra-1,3,5(10)-triene-3,17-beta-diol'],
    ['estradiol','https://pubmed.ncbi.nlm.nih.gov/24424441/','17-alpha-estradiol characterised as a non-feminizing estrogen with far weaker activity'],
    ['hormone-therapy','https://doi.org/10.1001/jamanetworkopen.2025.0955','3,592 trans adults: adjusted RR 0.85 for moderate-to-severe depressive symptoms on GAHT'],
    ['hormone-therapy','https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2789423','104 trans youth: 60% lower odds of moderate/severe depression, 73% lower odds of suicidality at 12 months'],
    ['hormone-therapy','https://academic.oup.com/jcem/article/102/11/3869/4157558','Endocrine Society guideline: avoid ethinyl estradiol; counsel on fertility preservation before starting'],
    ['testosterone','https://www.fda.gov/drugs/drug-alerts-and-statements/fda-issues-class-wide-labeling-changes-testosterone-products','2025 class-wide labelling change: cardiovascular boxed warning removed, blood-pressure warning added'],
    ['testosterone','https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=f4e8d29b-8707-4d47-e053-2a95a90aecee','Boxed warning on secondary exposure to topical testosterone'],
    ['spironolactone','https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/012151s080lbl.pdf','Aldosterone antagonism and hyperkalaemia monitoring; no gender-affirming indication is approved'],
    ['fertility','https://academic.oup.com/humupd/article/31/3/183/7978977','Fertility effects of gender-affirming hormone therapy: partial and variable reversibility'],

    -- Recreational substances
    ['ghb','https://doi.org/10.1016/j.ajem.2009.11.008','226 GHB-related deaths; 40 of 51 with known ingestion were left to "sleep it off"'],
    ['ghb','https://pubmed.ncbi.nlm.nih.gov/31301370/','Euro-DEN Plus, n=609: alcohol co-ingestion raised critical-care admission from 22.4% to 55.3%'],
    ['ghb','https://www.accessdata.fda.gov/drugsatfda_docs/label/2023/021196s042lbl.pdf','Sodium oxybate label: indicated for cataplexy OR excessive daytime sleepiness in narcolepsy'],
    ['ketamine','https://pubmed.ncbi.nlm.nih.gov/22416998/','1,285 recent users: 26.6% reported urinary symptoms; 51% improved after stopping'],
    ['ketamine','https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/211243s019lbl.pdf','Esketamine label: treatment-resistant depression; effectiveness in preventing suicide not demonstrated'],
    ['lithium','https://pubmed.ncbi.nlm.nih.gov/34348413/','Nayak et al.: content analysis of 62 unverified online reports; 47% mentioned seizures; conclusion provisional'],
    ['nitrous-oxide','https://pubmed.ncbi.nlm.nih.gov/8263793/','Irreversible oxidation of enzyme-bound cobalamin inactivates methionine synthase'],
    ['nitrous-oxide','https://pubmed.ncbi.nlm.nih.gov/38406057/','Subacute combined degeneration and peripheral neuropathy from nitrous oxide use'],
    ['mdma','https://pubmed.ncbi.nlm.nih.gov/12096147/','Dilutional hyponatraemia after MDMA: 17 cases, sodium 107-128, two deaths'],
    ['mdma','https://pmc.ncbi.nlm.nih.gov/articles/PMC9177763/','Systematic review: no serotonin syndrome in any randomised trial of SSRI plus MDMA'],
    ['ssris','https://pubmed.ncbi.nlm.nih.gov/17890444/','Paroxetine markedly reduced MDMA effects despite a 30% rise in plasma MDMA — pharmacodynamic blunting'],
    ['maois','https://www.accessdata.fda.gov/drugsatfda_docs/label/2007/011909s038lbl.pdf','Phenelzine label: tyramine hypertensive crisis; serotonergic agents contraindicated'],
    ['cocaine','https://pubmed.ncbi.nlm.nih.gov/9311626/','Human carboxylesterase hCE-1 catalyses ethanol-dependent formation of cocaethylene'],
    ['methamphetamine','https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/005378s032lbl.pdf','Current label is ADHD-only; the obesity indication is gone and the brand is discontinued'],
    ['methamphetamine','https://pubmed.ncbi.nlm.nih.gov/19426289/','Published half-life ~10 hours against the label''s 4 to 5'],
    ['nbomes','https://pubmed.ncbi.nlm.nih.gov/26378133/','Analytically confirmed NBOMe poisonings including fatalities'],
    ['lsd','https://pmc.ncbi.nlm.nih.gov/articles/PMC4813425/','Nichols: deaths attributable to the direct effects of LSD are unknown'],
    ['lsd','https://pubmed.ncbi.nlm.nih.gov/1149410/','Eight massive LSD overdoses by insufflation: hyperthermia, coma, respiratory arrest, all survived'],
    ['dextromethorphan','https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=484e0918-3442-49dc-8ccf-177f1f3ee9f3','Contraindicated with MAOIs; SSRIs are a warning rather than a contraindication'],
    ['chemsex','https://pmc.ncbi.nlm.nih.gov/articles/PMC9813405/','Sexualised drug use and diagnosed HIV: pooled cross-sectional OR 4.73, association not causation'],

    -- Mental health
    ['trauma','https://www.apa.org/topics/trauma','American Psychological Association definition of psychological trauma']
  ];
begin
  for r in select v_rows[i][1] as slug, v_rows[i][2] as url, v_rows[i][3] as claim
             from generate_subscripts(v_rows, 1) i
  loop
    select id into v_tag from public.unified_tags where slug = r.slug;
    continue when v_tag is null;

    insert into public.tag_sources
      (tag_id, source_type, source_url, claim_summary, fetched_at, verified_at, is_public)
    select v_tag, 'editorial', r.url, r.claim, now(), now(), false
    where not exists (
      select 1 from public.tag_sources s
       where s.tag_id = v_tag and s.source_url = r.url);
  end loop;
end
$cite$;

do $verify$
declare v_n int;
begin
  -- The pages exist.
  select count(*) into v_n from public.unified_tags
   where slug in ('sildenafil','tadalafil','vardenafil','avanafil','cialis','levitra','naloxone','estradiol','testosterone','descovy','harm-reduction')
     and (status <> 'active' or human_reviewed is not true or verification_status not in ('reviewed','locked'));
  if v_n > 0 then
    raise exception 'revive: % tag(s) not publicly readable', v_n;
  end if;

  -- The chart has the nitrite rows, and `get_substance_interactions` only
  -- returns a pair whose OTHER side is active — so this asserts what a reader
  -- gets, not merely what the table holds.
  select count(*) into v_n
    from public.unified_tags p,
         lateral public.get_substance_interactions(p.id) i
   where p.slug = 'poppers' and i.status = 'dangerous';
  if v_n < 7 then
    raise exception 'nitrite rows: poppers page shows only % dangerous combination(s)', v_n;
  end if;

  -- Clinical citations now exist, on more than a token handful of tags.
  select count(distinct tag_id) into v_n from public.tag_sources
   where source_url ~ '(dailymed|accessdata\.fda\.gov|www\.fda\.gov|pubmed|jamanetwork|thelancet|nejm|apa\.org|academic\.oup)';
  if v_n < 25 then
    raise exception 'citations: only % tag(s) carry a clinical source', v_n;
  end if;
end
$verify$;
