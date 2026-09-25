-- The singular anatomy rows kept the prose 99991789823744 removed from the
-- plural ones, and a later merge pointed the repaired pages AT them.
--
-- 99991789823744 de-gendered the PLURAL rows (`breasts`, `ovaries`, `vagina`,
-- `perineum`, `sperm`, `foreskin`, `fallopian-tubes`). A singular/plural
-- normalisation pass then merged plural -> singular. Measured on prod:
-- /tags/breasts now 301s to /tags/breast, and /tags/breast opens "typically
-- present in FEMALE-BODIED INDIVIDUALS" -- so the redirect serves readers the
-- exact register the earlier pass existed to remove. The repair was applied to
-- one row while its twin kept the defect, and the merge published the twin.
--
-- Found by running the glossary e2e against prod: its `breasts` control failed
-- with the singular row's prose in the diff. The spec caught a data regression
-- it was not written for, which is the argument for asserting on what a READER
-- is served rather than on the row a migration touched.
--
-- 16 active rows carry it. `wolffian` is the only INDEXABLE one and is left
-- alone deliberately (see below); the rest are deindexed, so this is a
-- site-search and on-page defect rather than a crawler one.
--
-- WHAT IS REPAIRED, in three labelled groups, because the licence differs.
--
-- A -- GENDERED PROSE ON A BODY PART. The platform's own standard: a body part
--      is described by what it IS and what it DOES, not by who is assumed to
--      have it. `styleguide_terms` rates "biologically female / natal sex" at
--      severity `never`, and `clitoris` already reads "the primary organ of
--      sexual pleasure in people with a vulva" -- correct, and the model the
--      rest of this cohort is brought to.
--        uterus, vulva, scrotum, prostate-gland, epididymis, ejaculatory-duct,
--        vas-deferens, erectile-tissue, menstrual-cycle,
--        pelvic-inflammatory-disease-pid
--
-- B -- A SUMMARY THAT CONTRADICTS ITS OWN BODY. The three hormone rows already
--      carry trans-aware bodies -- estradiol's names feminizing hormone
--      therapy, testosterone's says "present, at different levels, in
--      EVERYONE" -- over summaries reading "major female sex hormone" and
--      "principal male". The row argues with itself on the page, the `nudist`
--      shape. Only the summary is rewritten; the bodies are already right and
--      rewriting them would be the LLM rewrite both auto-apply paths were
--      retired for.
--        estradiol, estrogens, testosterone
--
-- C -- THREE SUBJECTS ON ONE ROW, and it is the row the redirect lands on.
--      `breast`: description is anatomy, short_description is "Feeding infants
--      with breast milk", long_description is 700 characters about
--      BREASTFEEDING and the WHO's six-month recommendation. Breastfeeding is
--      its own concept; on a row named `breast` that body is the wrong subject,
--      so it is NULLED rather than rewritten (the `doe`/`fae`/`flock` treatment
--      of 60000301100100). Nulling is safe and ASSERTED below:
--      `enforce_tag_thin_page_gate` reads tag_has_prose(description,
--      short_description) only, and the row keeps both.
--
-- TWO CATEGORY ERRORS come along, because they are the same rows and the same
-- class as 99991789846890: `vas-deferens` was filed under FETISHES and
-- `erectile-tissue` under SEX & KINK. Anatomy is not a kink. Moved by writing
-- `category_id` ALONE and letting both triggers reconcile (20261006110000) --
-- this is the UPDATE path, where they fire.
--
-- `glans` ALSO PUBLISHED A MOLLUSC GENUS. Its short_description read "Genus of
-- molluscs or genital structure" and its body opened by explaining that the
-- term means both. That is the namesake chimera, and on a sexual-health
-- glossary the mollusc is not a second sense worth carrying -- the row is
-- filed Body & Reproductive Health and `glans` there has exactly one reading.
-- Body nulled, summary and description rewritten.
--
-- DELIBERATELY NOT TOUCHED, each for its own reason rather than for lack of
-- time:
--   wolffian, male-femininity, bio-king-faux-king -- these are ABOUT gendered
--     concepts, so the gendered words are the subject, not an assumption about
--     the reader. `wolffian` is also the only indexable row in the cohort, and
--     a row whose defect is unproven is exactly where under-reaching is the
--     correct error.
--   the plural rows -- already correct since 99991789823744; asserted as
--     controls so a sweep cannot quietly re-gender them.
--   `ovaries` -- 404s on prod with `ovary` live, i.e. a merge that left no
--     redirect trail. That is a REDIRECT defect, not a prose one, and it wants
--     the pass that owns the singularisation.
--
-- Guarded by src/lib/__tests__/glossarySingularAnatomy.test.ts.

begin;

select set_config('app.actor', 'migration:99991790359756_glossary_singular_anatomy_degender', true);

-- ── A. gendered prose on a body part ────────────────────────────────────────
update unified_tags t set
  description = v.descr,
  short_description = v.summ
from (values
  ('uterus',
   'The organ where a pregnancy develops. Hormone-responsive, muscular, and shed and rebuilt across the menstrual cycle; present in many people regardless of gender, and absent or surgically removed in others.',
   'The organ where a pregnancy develops.'),
  ('vulva',
   'The external genitals: mons pubis, labia majora and minora, the clitoris, the vestibule, and the openings of the urethra and vagina. Often confused with the vagina, which is the internal canal.',
   'The external genitals, distinct from the vagina.'),
  ('scrotum',
   'The sac of skin holding the testicles, which it raises and lowers to keep them slightly below body temperature. Sensitive to touch, and a common site of play as well as of self-examination for lumps.',
   'The sac of skin holding the testicles.'),
  ('prostate-gland',
   'A gland sitting below the bladder and in front of the rectum, wrapping the urethra. It adds fluid to semen and is reachable through the anterior wall of the rectum, which is why it features in receptive anal play.',
   'A gland below the bladder, reachable through the rectum.'),
  ('epididymis',
   'A tightly coiled tube behind each testicle, roughly 6 to 7 cm long, where sperm mature and are stored before ejaculation. Infection here (epididymitis) causes one-sided swelling and pain.',
   'The coiled tube behind each testicle where sperm mature.'),
  ('ejaculatory-duct',
   'The paired ducts formed where each vas deferens meets a seminal vesicle. They run through the prostate and open into the urethra, carrying sperm and seminal fluid during ejaculation.',
   'The paired ducts carrying semen into the urethra.'),
  ('vas-deferens',
   'The tube carrying sperm from the epididymis toward the urethra. It is the tube cut or sealed in a vasectomy, which is why the name is more familiar than most internal anatomy.',
   'The tube carrying sperm from the epididymis; cut in a vasectomy.'),
  ('erectile-tissue',
   'Spongy tissue threaded with vascular spaces that fill with blood and stiffen during arousal. It is what makes the penis and the clitoris erect, and it behaves the same way in both.',
   'Spongy tissue that fills with blood and stiffens during arousal.'),
  ('menstrual-cycle',
   'The roughly monthly hormonal cycle that releases an egg and builds and sheds the uterine lining. Length and symptoms vary widely between people, and testosterone therapy usually stops it.',
   'The monthly hormonal cycle that releases an egg and sheds the uterine lining.'),
  ('pelvic-inflammatory-disease-pid',
   'An infection of the upper reproductive tract -- uterus, fallopian tubes and ovaries -- usually from untreated chlamydia or gonorrhoea. It can be silent, and untreated it is a leading preventable cause of infertility and ectopic pregnancy.',
   'Infection of the upper reproductive tract, usually from an untreated STI.')
) as v(slug, descr, summ)
where t.slug = v.slug and t.status = 'active';

-- ── B. summary contradicting its own, already trans-aware, body ─────────────
update unified_tags t set short_description = v.summ, description = v.descr
from (values
  ('estradiol',
   'The body''s principal estrogen, and the estrogen used in feminizing hormone therapy. Taken as tablets, patches, gel or injected esters; transdermal delivery avoids first-pass metabolism.',
   'The principal estrogen, and the one used in feminizing hormone therapy.'),
  ('estrogens',
   'A class of sex hormones -- estrone, estradiol and estriol -- that drive the development of breast tissue and other secondary sex characteristics. Present in everyone at differing levels, and given as therapy.',
   'A class of sex hormones, present in everyone at differing levels.'),
  ('testosterone',
   'The principal androgen, present at differing levels in everyone, and the hormone used in masculinizing gender-affirming therapy. Given by injection, gel, patch or pellet; a controlled substance in many countries.',
   'The principal androgen, and the hormone used in masculinizing therapy.')
) as v(slug, descr, summ)
where t.slug = v.slug and t.status = 'active';

-- ── C. three subjects on one row; the breastfeeding body is the wrong one ───
update unified_tags set
  description = 'Chest tissue: mammary glands, fat and connective tissue. Size and shape vary widely, growth can be driven by estrogen including in hormone therapy, and chest surgery may reduce, remove or reconstruct it.',
  short_description = 'Chest tissue of mammary glands, fat and connective tissue.',
  long_description = null
where slug = 'breast'
  and status = 'active'
  and short_description ilike '%Feeding infants%';

-- `glans` published a mollusc genus alongside the anatomy.
update unified_tags set
  description = 'The sensitive tip of the penis or of the clitoris -- the same structure in both, densely supplied with nerve endings. Covered by the foreskin or the clitoral hood unless that has been removed.',
  short_description = 'The sensitive tip of the penis or clitoris.',
  long_description = null
where slug = 'glans'
  and status = 'active'
  and (short_description ilike '%molluscs%' or long_description ilike '%molluscs%');

-- ── two category errors: anatomy filed as kink ──────────────────────────────
update unified_tags t set category_id = c.id
from tag_categories c, (values
  ('vas-deferens',    'physical-reproductive'),
  ('erectile-tissue', 'physical-reproductive')
) as v(slug, cat)
where t.slug = v.slug and c.slug = v.cat
  and t.category_id is distinct from c.id;

-- ============================ postconditions ============================
do $verify$
declare v_bad int; v_n int;
begin
  -- 1. no row this file touched still carries the gendered register.
  select count(*) into v_bad from unified_tags
   where status = 'active'
     and slug in ('uterus','vulva','scrotum','prostate-gland','epididymis',
                  'ejaculatory-duct','vas-deferens','erectile-tissue',
                  'menstrual-cycle','pelvic-inflammatory-disease-pid',
                  'estradiol','estrogens','testosterone','breast','glans')
     and (coalesce(description,'')       ~* '(female-bodied|female mammals|the female (genitalia|reproductive)|male (mammals|reproductive)|principal male|primary (female|male) sex hormone)'
       or coalesce(short_description,'') ~* '(female-bodied|male reproductive|female reproductive|primary (female|male) sex hormone)');
  if v_bad <> 0 then
    raise exception '% rows still publish the gendered register', v_bad;
  end if;

  -- 2. the wrong SUBJECTS are gone: breastfeeding off `breast`, molluscs off
  --    `glans`. Checked across every prose field, not only the one they sat in.
  select count(*) into v_bad from unified_tags
   where (slug = 'breast' and (coalesce(long_description,'') ilike '%Breastfeeding is the process%'
                            or coalesce(short_description,'') ilike '%Feeding infants%'))
      or (slug = 'glans'  and (coalesce(long_description,'')  ilike '%mollusc%'
                            or coalesce(short_description,'') ilike '%mollusc%'
                            or coalesce(description,'')       ilike '%mollusc%'));
  if v_bad <> 0 then
    raise exception '% rows still publish the wrong subject', v_bad;
  end if;

  -- 3. nulling a body may not make a page unpublishable. Calls the REAL
  --    predicate rather than restating it (75000101100000).
  select count(*) into v_bad from unified_tags
   where slug in ('breast','glans') and status = 'active'
     and not tag_has_prose(description, short_description);
  if v_bad <> 0 then
    raise exception '% rows became unpublishable', v_bad;
  end if;

  -- 4. the two category moves agree across ALL THREE representations, which is
  --    the result; asserting category_id alone is the vacuous form.
  select count(*) into v_n from (values
    ('vas-deferens','physical-reproductive'), ('erectile-tissue','physical-reproductive')
  ) as v(slug, cat)
  join unified_tags t on t.slug = v.slug
  join tag_categories c on c.slug = v.cat
  where t.category_id = c.id and t.category = c.name
    and exists (select 1 from tag_category_assignments a
                where a.tag_id = t.id and a.category_id = c.id and a.is_primary);
  if v_n <> 2 then
    raise exception 'expected 2 rows agreeing across category_id / text / junction, found %', v_n;
  end if;

  -- 5. CONTROLS. The plural rows 99991789823744 already fixed must still be
  --    fixed -- a sweep that re-gendered them would satisfy every check above.
  --    `clitoris` is the model this cohort was brought to and must be intact.
  select count(*) into v_bad from unified_tags
   where (slug = 'clitoris' and coalesce(description,'') not ilike '%people with a vulva%')
      or (slug in ('sperm','foreskin','vagina','perineum')
          and coalesce(description,'') ~* '(female-bodied|the male reproductive cell|In male human anatomy)');
  if v_bad <> 0 then
    raise exception '% already-repaired rows regressed', v_bad;
  end if;

  -- 6. the rows deliberately left alone are still here and still untouched --
  --    `wolffian` is ABOUT gendered structures and is the cohort's only
  --    indexable row, so a sweep that took it would be over-reaching.
  select count(*) into v_bad from unified_tags
   where slug = 'wolffian' and status = 'active'
     and coalesce(description,'') not ilike '%Wolffian%';
  if v_bad <> 0 then
    raise exception 'wolffian was swept and should not have been';
  end if;
end
$verify$;

commit;
