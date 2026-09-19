-- Anatomy and reproductive-health prose that writes part of the audience out.
--
-- FOLLOW-UP TO #3807, AND IT CLOSES AN INCONSISTENCY THAT PASS CREATED. The
-- glossary pass de-gendered three rows -- `penis`, `vagina` and `uncircumcised`
-- -- under the crotch-rope/breast-bondage rule (correct entity, prose that
-- excludes) and left eleven siblings untouched, because those sat in the
-- part-1 file where the working rule was "description is the evidence, only the
-- summary is rewritten". Applying a rule to three of fourteen rows is not
-- under-reaching, it is drift.
--
-- FOUND BY THE PROD E2E, NOT BY A TEST. Fetching the live pages after the merge
-- showed /tags/clitoris leading with "a vital female sex organ" and
-- /tags/ovaries with "a gonad in the female reproductive system" -- while
-- /tags/penis, repaired hours earlier, read "Trans women, non-binary people and
-- intersex people have penises too". The inconsistency is only visible when you
-- look at the rendered pages side by side.
--
-- The selection regex (`\m(male|female|men|women|man|woman)\M` over the pass's
-- own slugs) returned 17 rows. It NARROWS WHAT A HUMAN READS AND DOES NOT
-- DECIDE: five of the seventeen are correct as written and are asserted to
-- SURVIVE at the bottom of this file --
--   ceterosexual  "neither exclusively male nor female"  <- that IS the definition
--   feminism      "women's rights and gender justice"    <- that IS the subject
--   hymen         "people who are assigned female at birth" <- already the
--                 correct inclusive phrasing; rewriting it would be churn
--   penis         already carries the inclusive sentence from #3807
--   breasts       no gendered claim at all
--
-- THE SHARPEST ROW IS NOT AN ANATOMY ROW. `sex-worker` closed with:
--   "Sex workers are typically female, but there are some male and transgender
--    sex workers."
-- On a platform whose community includes sex workers, that sentence others trans
-- sex workers as an afterthought to a demographic claim it does not source. It
-- is removed and the surviving sentences are kept BYTE-IDENTICAL -- a `replace()`
-- of one exact sentence, which cannot author prose, so every other clause
-- survives by construction rather than by retyping.
--
-- `erectile-dysfunction` is the only INDEXABLE row in the set (usage 8) and said
-- "in males" twice. ED happens to anyone with a penis; trans women on oestrogen
-- and people on anti-androgens are among the most likely to meet it, which is
-- exactly the reader this glossary exists for.
--
-- Three rows additionally shed ZOOLOGY that is not about people: `sperm` ran
-- through red algae, fungi, ferns and gymnosperms; `perineum` opened "in
-- placental mammals"; `vagina` opened "In mammals and other animals". That is
-- the register the corpus already strips elsewhere (the `bunny`/`meerkat`
-- treatment), and here it sits on top of the gendering rather than beside it.
--
-- `fallopian-tubes` loses a bolted-on closing sentence -- "which can be
-- particularly relevant for individuals in the LGBTQ+ community exploring family
-- planning options" -- that asserts relevance instead of saying anything. The
-- replacement states the fact that makes it relevant (this is where an ectopic
-- pregnancy happens, and where tubal ligation acts).
--
-- Nothing here changes an identifier, a category, a status or an index flag.
-- Every row is ACTIVE and renders, so prose is REPLACED, never nulled -- the
-- darkroom rule. Every UPDATE is content-guarded on the exact phrase it removes,
-- so a concurrent repair no-ops instead of being clobbered.
--
-- Guarded by src/lib/__tests__/glossaryAnatomyDegender.test.ts.

begin;

select set_config('app.actor', 'migration:99991789823744_glossary_anatomy_degender', true);

-- ---------------------------------------------------------- indexable, usage 8
update unified_tags set
  description = 'Persistent difficulty getting or keeping an erection firm enough for the sex you want to have. Common, treatable, and not limited to any one group — anti-androgens, oestrogen, SSRIs, blood-pressure medication, alcohol, diabetes and anxiety are all ordinary causes. Occasional difficulty is not ED.'
where slug = 'erectile-dysfunction' and description ilike '%sexual dysfunction in males%';

-- -------------------------------------------------------------------- anatomy
update unified_tags set
  description = 'The primary organ of sexual pleasure in people with a vulva. Most of it is internal: the visible glans is the tip of a much larger structure of erectile tissue that extends back into the body, and it carries a denser concentration of nerve endings than anywhere else in human anatomy.'
where slug = 'clitoris' and description ilike '%vital female sex organ%';

update unified_tags set
  description = 'The pair of organs that produce eggs and the hormones of the menstrual cycle. An egg released at ovulation travels down the fallopian tube toward the uterus. They keep working whether or not someone identifies with the body they are in.'
where slug = 'ovaries' and description ilike '%gonad in the female reproductive system%';

update unified_tags set
  description = 'The pair of tubes connecting the ovaries to the uterus. Fertilisation, when it happens, usually happens here — which is also why an ectopic pregnancy is most often tubal, and what tubal ligation interrupts.'
where slug = 'fallopian-tubes' and description ilike '%components of the female reproductive system%';

update unified_tags set
  description = 'The retractable fold of skin covering the glans of the penis. It is mobile and stretchable, attached to the glans by a band of tissue called the frenulum, and keeps the glans in a moist environment. Circumcision removes it.'
where slug = 'foreskin' and description ilike '%In male human anatomy%';

update unified_tags set
  description = 'The area between the anus and the genitals — between the anus and the scrotum, or between the anus and the vulva. It is sensitive, and it is the area a trans person may hear discussed in the context of gender-affirming surgery.'
where slug = 'perineum' and description ilike '%placental mammals%';

update unified_tags set
  description = 'The period during which an embryo or foetus develops in the uterus. Trans men, non-binary people and intersex people get pregnant; assuming otherwise is how people end up without care that fits them.'
where slug = 'pregnancy' and description ilike '%inside a woman''s uterus%';

update unified_tags set
  description = 'A pair of glands behind the bladder that produce most of the fluid in semen.'
where slug = 'seminal-vesicles' and description ilike '%of male mammals%';

update unified_tags set
  description = 'The reproductive cell carried in semen. Production is suppressed by oestrogen and anti-androgens, which is why fertility preservation is discussed before starting gender-affirming hormones.'
where slug = 'sperm' and description ilike '%the male reproductive cell%';

update unified_tags set
  description = 'One of the pair of organs that produce sperm and testosterone, held in the scrotum.'
where slug = 'testicle' and description ilike '%Male reproductive organ%';

update unified_tags set
  description = 'The elastic, muscular internal canal running from the vulva to the cervix. It allows for penetrative sex and for birth, and channels menstrual flow. A vagina says nothing about the gender of the person whose body it is.'
where slug = 'vagina' and description ilike '%In mammals and other animals%';

update unified_tags set
  description = 'Having an intact foreskin — the state the body is in without circumcision, not a deviation from it. People have personal, religious and cultural reasons either way.'
where slug = 'uncircumcised' and description ilike '%natural variation in male anatomy%';

-- --------------- sex-worker: one exact sentence removed, the rest byte-identical
-- A replace() cannot author prose, so every other clause survives by
-- construction. The removed sentence made a demographic claim it did not source
-- and appended trans sex workers to it as an exception.
update unified_tags set
  description = btrim(replace(
    description,
    ' Sex workers are typically female, but there are some male and transgender sex workers.',
    ''))
where slug = 'sex-worker' and description ilike '%typically female, but there are some male and transgender%';

-- ============================ postconditions ============================
do $verify$
declare v_bad int; v_n int; v_miss text;
begin
  -- 1. every repaired row reached the state, and still publishes something
  select count(*) into v_n from unified_tags
  where slug in ('erectile-dysfunction','clitoris','ovaries','fallopian-tubes','foreskin','perineum',
                 'pregnancy','seminal-vesicles','sperm','testicle','vagina','uncircumcised','sex-worker')
    and status = 'active' and tag_has_prose(description, short_description);
  if v_n <> 13 then raise exception 'expected 13 repaired rows active with prose, found %', v_n; end if;

  -- 2. none of the excluding phrases survives anywhere in the corpus
  select count(*) into v_bad from unified_tags
  where coalesce(description,'') ~* '(sexual dysfunction in males|vital female sex organ|gonad in the female reproductive system|components of the female reproductive system|In male human anatomy|the perineum in placental mammals|inside a woman''s uterus|of male mammals|is the male reproductive cell|^Male reproductive organ|In mammals and other animals, the vagina|natural variation in male anatomy|typically female, but there are some male and transgender)';
  if v_bad <> 0 then
    select string_agg(slug, ', ') into v_miss from unified_tags
      where coalesce(description,'') ~* '(sexual dysfunction in males|vital female sex organ|gonad in the female reproductive system|In male human anatomy|inside a woman''s uterus|typically female, but there are some male and transgender)';
    raise exception 'excluding prose survives on: %', coalesce(v_miss, '(regex-only match)');
  end if;

  -- 3. THE CONTROLS. Five rows matched the same selection regex and are correct
  --    as written; a sweep that took them too would satisfy check 2 as well.
  select count(*) into v_bad from unified_tags
  where (slug = 'ceterosexual' and description not ilike '%neither exclusively male nor female%')
     or (slug = 'feminism'     and description not ilike '%women''s rights%')
     or (slug = 'hymen'        and description not ilike '%assigned female at birth%')
     or (slug = 'penis'        and description not ilike '%Trans women, non-binary people and intersex people%')
     or (slug = 'breasts'      and description not ilike '%A sexual focus on breasts%');
  if v_bad <> 0 then raise exception '% control rows were swept that should have survived', v_bad; end if;

  -- 4. sex-worker kept its other sentences (the replace() must not have eaten them)
  select count(*) into v_bad from unified_tags
  where slug = 'sex-worker'
    and (description not ilike '%engages in sexual services in exchange for money or goods%'
      or description not ilike '%prostitution, exotic dancing, and pornography%');
  if v_bad <> 0 then raise exception 'sex-worker lost the sentences that were meant to survive'; end if;

  -- 5. nothing here changed status, indexability or an identifier
  select count(*) into v_bad from unified_tags
  where slug in ('erectile-dysfunction','clitoris','ovaries','fallopian-tubes','foreskin','perineum',
                 'pregnancy','seminal-vesicles','sperm','testicle','vagina','uncircumcised','sex-worker')
    and status <> 'active';
  if v_bad <> 0 then raise exception '% repaired rows are no longer active', v_bad; end if;
  select count(*) into v_n from unified_tags where slug = 'erectile-dysfunction' and seo_indexable;
  if v_n <> 1 then raise exception 'erectile-dysfunction lost its indexability'; end if;
end
$verify$;

commit;
