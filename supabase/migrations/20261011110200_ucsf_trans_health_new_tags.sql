-- Eight trans-health concepts with no row at all.
--
-- Third of the UCSF pass (source, date and usage limits: 20261011110000). The two
-- earlier migrations repaired wrong rows and revived culled ones. These eight are
-- absent — not deprecated, not thin: no row, checked by slug, prefix and alias.
--
-- WHY THESE EIGHT. Each is either a UCSF chapter with nothing on our side, or the
-- word a reader would actually search for when the clinical term is not the one
-- they know. The selection is deliberately NOT "one tag per chapter": cardiovascular
-- disease, diabetes and the individual cancer-screening chapters are general
-- medicine that happens to be written for trans patients, and a travel and
-- community glossary has no business restating them.
--
-- `silicone-injection` IS THE ONE THAT MATTERS MOST, and it is the reason this
-- migration exists at all. UCSF devotes a chapter to it because it is widespread
-- and it kills people: injected volumes of 1-3 litres or more, administered outside
-- any medical setting, of material whose composition is frequently unknown —
-- the chapter lists aircraft lubricant, tire sealant, window caulk, mineral oil,
-- methylacrylates and petroleum jelly among substances found. Prevalence estimates
-- run from 20% to over 50% of some populations of trans women, 40% in Lima and 68%
-- across several large Thai cities. This platform sends trans women to those
-- cities. It carries a substances-and-harm-reduction section of 144 tags and a
-- marketplace that sells drug-checking kits, and it had nothing on this.
--
-- The prose gives the reasons people do it — UCSF names poor self-image,
-- misinformation about silicone, discomfort in public, and low insurance access,
-- plus speed of result, sex-work economics, and feminisation without hormones for
-- people who want to keep erectile function. That is not padding: a harm-reduction
-- entry that treats the practice as simply irrational is one nobody at risk will
-- read. It is `is_sensitive`, which under `enforce_tag_seo_sensitivity_gate()`
-- requires `human_reviewed` to stay indexable and `verification_status='reviewed'`
-- to clear `unified_tags_public_gated_read` for a signed-out reader.
--
-- `gatekeeping` and `informed-consent-model` are a deliberate pair. They are the
-- two models a trans person actually encounters when seeking care, they are the
-- vocabulary of that experience rather than of the clinic, and neither existed.
-- `informed-consent-model` is a SEPARATE tag from the existing `informed-consent`,
-- which sits in Consent & Negotiation and is about kink: same words, unrelated
-- concepts, and merging them would route someone reading about negotiating a scene
-- into a page about hormone prescribing.
--
-- NOT INCLUDED, on purpose: a pelvic-pain-on-testosterone tag. UCSF has the
-- chapter, but a glossary entry on a pain differential is clinical advice with no
-- community-vocabulary component, and the chapter is marked PENDING REVISION.
-- Absence is the right answer there.
--
-- Standard shape from 20261004100100: explicit slug (never derived), category via
-- `category_id` with `category` named alongside so the column-scoped search trigger
-- fires, `human_reviewed` so `deprecate_unused_tags()` cannot cull a brand-new
-- zero-usage tag on its first night. Relations are only created where the target
-- already exists — nothing here mints a stub.

select set_config('app.actor', 'admin:ucsf-transcare-20260829', true);

do $mig$
declare
  r         record;
  v_tag_id  uuid;
  v_cat_id  uuid;
  v_rel_id  uuid;
  a         text;
begin
  for r in
    select * from (values
      ('hysterectomy', 'trans-health', 'Hysterectomy', false, null::text[],
       'Surgical removal of the uterus, sometimes with the ovaries or fallopian tubes.',
       'Hysterectomy is the surgical removal of the uterus, sometimes together with the fallopian tubes or ovaries. WPATH considers it medically necessary gender-affirming care for trans men who want it.',
'Hysterectomy removes the uterus. It may be done with salpingectomy (removal of the fallopian tubes), oophorectomy (removal of the ovaries), or neither — and that choice matters, because removing the ovaries ends the body''s own oestrogen production and makes ongoing hormone therapy necessary rather than optional.

WPATH treats it as a medically necessary component of gender-affirming surgical care for those trans men who seek it. In the US National Transgender Discrimination Survey 21% of trans men had had one and a further 58% wanted one at some point.

People''s reasons differ and are not only about dysphoria: in one study of 134 trans men, 58% cited organs being incongruent with their gender identity, 47% further physical masculinisation, 43% making a change of legal documents easier, and 37% avoiding future gynaecological appointments.

It is usually required before phalloplasty with urethral lengthening. It ends fertility permanently, so it is worth settling any question of biological children beforehand. It does not on its own remove the need for cervical screening if the cervix is left in place.'),

      ('silicone-injection', 'substances-harm-reduction', 'Silicone Injection', true,
       array['health','harm reduction'],
       'Unlicensed injection of silicone or other fillers for body contouring — a major cause of serious harm.',
       'Silicone injection means the unlicensed injection of silicone or other soft-tissue fillers to change body contour. The material is frequently not medical grade and the volumes are enormous. It is one of the most dangerous things done in pursuit of a feminine body shape.',
'"Silicone injections" in a trans context rarely means medical silicone. It refers to soft-tissue fillers injected outside any clinical setting, usually by someone unlicensed, and the composition is often unknown. Substances found have included aircraft lubricant, tire sealant, window caulk, mineral oil, methylacrylates and petroleum jelly.

Scale is the core problem. A licensed practitioner using medical-grade material injects under 0.1 ml at a time. Unsupervised injection commonly involves one to three litres or more, without sterile technique and without the technique used to avoid pushing material into a blood vessel. Group sessions, known as pumping parties, are where much of it happens.

It is not rare. Estimates run from 20% to more than half of some populations of trans women, with 40% reported in Lima and 68% across several large Thai cities.

The reasons are worth stating plainly, because they are not stupidity. It works immediately, where hormones take years and surgery may be unavailable or unaffordable. It feminises without hormones, which some people want in order to keep erectile function. UCSF''s own account names poor self-image, misinformation about what silicone is, discomfort in public space, and lack of insurance as the four drivers, alongside peer recommendation — the results show long before the harms do.

The harms are severe and often delayed by years: the material migrates away from where it was placed and cannot be reliably removed, it causes chronic inflammation, disfigurement, ulceration and infection, and it can enter the bloodstream and cause pulmonary embolism, which is fatal. Presenting these as a distant risk understates them.

If you have had injections, say so to any doctor who treats you, particularly before surgery or imaging — it changes what is safe to do. Licensed facial fillers, fat grafting and implants are regulated procedures and are a different thing entirely from this.'),

      ('bone-health', 'trans-health', 'Bone Health', false, null::text[],
       'Bone density and osteoporosis risk, which hormone therapy directly affects.',
       'Bone health matters in trans care because sex hormones govern bone density. Stopping hormones after the gonads are removed, rather than the hormones themselves, is what creates real risk.',
'Bone density depends on sex hormones, so it is one of the few areas where gender-affirming care needs long-term attention rather than a one-off decision.

The situation that carries genuine risk is a gap in hormone therapy after orchiectomy, hysterectomy with oophorectomy, or any other removal of the gonads. With neither the body''s own hormones nor replacement, bone loss can be rapid. Consistency matters more than which hormone.

Screening guidance is imperfect here, and honestly so: UCSF notes that osteoporosis screening for non-trans people is itself age- and sex-based with no consensus even for non-trans men, so adapting it is not straightforward. Risk factors are the general ones — older age, low body mass, smoking, heavy drinking, long-term corticosteroids, vitamin D deficiency, immobility, hypogonadism, HIV — plus, for trans women, factors that may predate transition.

The practical points are unremarkable: do not let hormone therapy lapse after gonad removal, and make sure whoever assesses your bone health knows your hormone history rather than guessing from an entry on a form.'),

      ('gatekeeping', 'trans-health', 'Gatekeeping', false, null::text[],
       'Requiring approvals, assessments or waiting periods before trans people can access care.',
       'Gatekeeping is the practice of requiring trans people to pass assessments, obtain letters or wait out fixed periods before being given care they have asked for. It is contrasted with the informed consent model.',
'Gatekeeping describes a model of care in which a trans person must satisfy someone else before receiving treatment: psychiatric assessment, one or more supporting letters, a documented period of living in the desired gender role, or a minimum time in therapy before hormones or surgery are approved.

The original reasoning was diagnostic caution. The criticisms are that requirements are applied inconsistently, that they can reward telling clinicians a tidy story rather than the truth, that they have historically pushed people towards a narrow and binary account of themselves in order to qualify, and that non-binary people fit those criteria worst of all. Waiting lists of years are common in some public systems.

Some assessment is uncontroversial — surgery involves consent and capacity like any other surgery. The dispute is about how much, applied to whom, and who decides.

Used as a word, it is a criticism. Clinicians working this way would generally describe it as assessment, and the two descriptions are of the same appointment.'),

      ('informed-consent-model', 'trans-health', 'Informed Consent Model', false, null::text[],
       'Prescribing hormones on the patient''s own informed consent, without requiring a mental health assessment.',
       'The informed consent model provides hormone therapy on the basis of the patient''s own consent — the clinician explains effects, risks and what is irreversible, and the patient decides. No psychiatric assessment or referral letter is required.',
'Under an informed consent model, a clinician explains what hormone therapy does, what it does not do, which effects are permanent, what is known about the risks and what remains uncertain — and then the patient decides. There is no requirement for a mental health assessment or a supporting letter.

It rests on the same principle as any other medical decision: an adult who understands a treatment may consent to it. What it removes is the extra step demanded of trans people and almost nobody else.

It is not the absence of medical care. Baseline and follow-up blood tests, dose adjustment and monitoring all continue, and a clinician can still decline where consent or capacity is genuinely in doubt. What is removed is the requirement to be assessed as trans by a third party first.

Many community clinics work this way, and it is increasingly common in general practice. Availability varies enormously between countries and between providers in the same city — worth checking before travelling for care.

Distinct from informed consent in the kink sense, which is about negotiating a scene.'),

      ('wpath-standards-of-care', 'trans-health', 'WPATH Standards of Care', false, null::text[],
       'The international clinical guidance for transgender health, published by WPATH.',
       'The Standards of Care are the international clinical guidance for transgender health, published by the World Professional Association for Transgender Health. They are what most providers and many insurers cite.',
'The Standards of Care (SOC) are published by the World Professional Association for Transgender Health and are the most widely cited clinical guidance in this field. Version 8 was published in 2022, superseding version 7 from 2011.

They matter outside the clinic because of what gets built on them. Insurers cite them when deciding what to cover, surgeons cite them when setting requirements for a referral letter, and courts and legislatures cite them in both directions.

Successive versions have moved away from fixed prerequisites and towards shared decision-making, and SOC 8 recognises non-binary people far more fully than earlier editions. They are guidance, not law, and a given clinic may apply them strictly, loosely, or alongside its own rules.

They are also not the only guidance in use — the Endocrine Society publishes its own clinical practice guideline, and UCSF''s Guidelines for the Primary and Gender-Affirming Care of Transgender and Gender Nonbinary People is a widely used primary-care reference.'),

      ('gender-affirming-care-coverage', 'trans-health', 'Gender-Affirming Care Coverage', false, null::text[],
       'Whether and how an insurer or health system pays for gender-affirming care.',
       'Coverage is whether an insurer or health system pays for gender-affirming care. Blanket exclusions written decades ago still shape what is refused today, and what is covered varies by country, plan and procedure.',
'Whether gender-affirming care is paid for is frequently the thing that decides whether it happens.

Insurance policies written from the 1980s onward routinely carried broad exclusions for "transsexualism", "sex change treatments" or "gender identity disorders", and those clauses were often read as widely as possible — at times to mean that a trans person could not claim for unrelated care at all. Many have since been withdrawn or made unlawful, but the drafting still echoes in how claims get refused.

Coverage is fragmented rather than simply present or absent. It varies by country and, in the United States, by state and by individual plan. Hormones are commonly covered where surgery is not. Procedures classed as cosmetic — facial surgery, hair removal, voice work — are refused far more often than genital surgery, though that is shifting. A refusal is frequently a coding or documentation dispute rather than a final answer, and appeals succeed often enough to be worth making.

For travel this is worth checking twice: care obtained abroad is usually not covered by a domestic plan, and travel insurance may exclude anything related to a planned procedure.'),

      ('trans-competent-provider', 'support-services', 'Trans-Competent Provider', false, null::text[],
       'A clinician or service with real experience of treating trans people.',
       'A trans-competent provider is one with actual experience of trans patients — able to treat you without you having to teach them, and without your gender becoming the subject of every appointment.',
'Trans-competent describes a provider who has genuinely treated trans patients before. In practice that means using the right name and pronouns without being reminded, understanding how hormone therapy affects test results and reference ranges, knowing which anatomy you actually have rather than assuming from a record, and being able to treat a sore throat without turning the appointment into a discussion of your gender.

It is not the same as trans-friendly. Goodwill is welcome and common; competence is specific and much less common, and the gap between the two is where most bad appointments happen.

Signals worth looking for: an intake form that asks for chosen name and pronouns and for organs present rather than a single sex field, staff who use them consistently, and a provider who can say plainly what they have and have not treated before. Community recommendation remains the most reliable route, which is why lists of trans-competent providers circulate the way they do.

When travelling, finding this in advance is much easier than finding it in an emergency.')
    ) as t(slug, cat_slug, nm, sensitive, topics, short_d, desc_d, long_d)
  loop
    select id into strict v_cat_id from public.tag_categories where slug = r.cat_slug;

    -- `category` (the TEXT mirror) is written EXPLICITLY, not left to the trigger.
    -- `sync_tag_category_assignment` is guarded on `new.category_id is distinct
    -- from old.category_id`, so it does not fire on INSERT: measured on prod in a
    -- rolled-back transaction, a fresh row came out with category_id set and
    -- `category` NULL. That column is what `search_documents_index_tags` emits as
    -- the search facet, so the tag would have been filed correctly on its page and
    -- uncategorised in search — the two surfaces read different columns.
    insert into public.unified_tags (
      name, slug, entity_kind, status, description, short_description, long_description,
      is_sensitive, sensitive_topics, verification_status, human_reviewed,
      seo_indexable, category_id, category, last_verified_at
    ) values (
      r.nm, r.slug, 'concept', 'active', r.desc_d, r.short_d, r.long_d,
      r.sensitive, r.topics, 'reviewed', true, true, v_cat_id,
      (select name from public.tag_categories where id = v_cat_id), now()
    )
    on conflict (slug) do update set
      name                = excluded.name,
      description         = excluded.description,
      short_description   = excluded.short_description,
      long_description    = excluded.long_description,
      is_sensitive        = excluded.is_sensitive,
      sensitive_topics    = excluded.sensitive_topics,
      category_id         = excluded.category_id,
      category            = (select name from public.tag_categories where id = excluded.category_id),
      status              = 'active',
      verification_status = 'reviewed',
      human_reviewed      = true,
      seo_indexable       = true,
      merged_into_id      = null,
      deprecated_at       = null,
      deprecation_reason  = null,
      last_verified_at    = now(),
      updated_at          = now();

    select id into strict v_tag_id from public.unified_tags where slug = r.slug;

    -- One junction row per statement: two in one statement raises 27000 through
    -- the is_adult recompute writing back to unified_tags.
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    values (v_tag_id, v_cat_id, true)
    on conflict (tag_id, category_id) do update set is_primary = true;
  end loop;

  -- Broader relations, only where the target is already live.
  for r in
    select * from (values
      ('hysterectomy',                   'gender-affirming-surgery'),
      ('hysterectomy',                   'bottom-surgery'),
      ('bone-health',                    'hormone-therapy'),
      ('gatekeeping',                    'gender-affirming-care'),
      ('informed-consent-model',         'gender-affirming-care'),
      ('wpath-standards-of-care',        'gender-affirming-care'),
      ('gender-affirming-care-coverage', 'gender-affirming-care'),
      ('trans-competent-provider',       'gender-affirming-care')
    ) as t(child, parent)
  loop
    select id into v_tag_id from public.unified_tags where slug = r.child;
    select id into v_rel_id from public.unified_tags where slug = r.parent and status = 'active';
    if v_tag_id is not null and v_rel_id is not null and v_tag_id <> v_rel_id then
      insert into public.tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
      values (v_tag_id, v_rel_id, 'broader', 1.0, 'approved')
      on conflict (source_tag_id, target_tag_id, relation_type) do nothing;
    end if;
  end loop;

  -- Aliases, each skipped if it would shadow a live tag. "pumping party" is the
  -- community term for the group sessions and is the phrase someone is far more
  -- likely to have heard than "silicone injection".
  select id into strict v_tag_id from public.unified_tags where slug = 'silicone-injection';
  foreach a in array array['pumping party','free silicone','soft tissue filler'] loop
    insert into public.tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
    select v_tag_id, a, public.normalize_tag_slug(a), 'synonym', 'approved'
    where not exists (
      select 1 from public.unified_tags u
       where lower(u.slug) = public.normalize_tag_slug(a) and u.status = 'active' and u.id <> v_tag_id)
    on conflict (alias_slug) do nothing;
  end loop;

  select id into strict v_tag_id from public.unified_tags where slug = 'wpath-standards-of-care';
  foreach a in array array['WPATH','Standards of Care','SOC 8'] loop
    insert into public.tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
    select v_tag_id, a, public.normalize_tag_slug(a), 'synonym', 'approved'
    where not exists (
      select 1 from public.unified_tags u
       where lower(u.slug) = public.normalize_tag_slug(a) and u.status = 'active' and u.id <> v_tag_id)
    on conflict (alias_slug) do nothing;
  end loop;
end
$mig$;

do $verify$
declare v_n int; v_bad text;
begin
  select count(*) into v_n from public.unified_tags
   where slug in ('hysterectomy','silicone-injection','bone-health','gatekeeping',
                  'informed-consent-model','wpath-standards-of-care',
                  'gender-affirming-care-coverage','trans-competent-provider')
     and status = 'active' and human_reviewed
     and verification_status in ('reviewed','locked')
     and category_id is not null;
  if v_n <> 8 then
    raise exception 'ucsf new tags: expected 8 live reviewed filed tags, found %', v_n;
  end if;

  -- Filed on the junction as well as the denorm column: `denorm_category_missing`
  -- is a zero-invariant in the tag-hygiene CI gate and the two surfaces are read
  -- by different consumers (page reads the junction, search facet reads the text).
  select string_agg(t.slug, ', ') into v_bad
    from public.unified_tags t
   where t.slug in ('hysterectomy','silicone-injection','bone-health','gatekeeping',
                    'informed-consent-model','wpath-standards-of-care',
                    'gender-affirming-care-coverage','trans-competent-provider')
     and not exists (select 1 from public.tag_category_assignments a
                      where a.tag_id = t.id and a.is_primary);
  if v_bad is not null then
    raise exception 'ucsf new tags: no primary junction row for: %', v_bad;
  end if;

  -- All THREE filing surfaces agree. The text mirror is the one that silently
  -- stays NULL on INSERT (the sync trigger only fires when category_id CHANGES),
  -- and it is the one the search facet reads — so a tag can be filed correctly on
  -- its own page and uncategorised in search. Asserted rather than trusted.
  select string_agg(t.slug || ' (category=' || coalesce(t.category,'NULL') || ')', ', ') into v_bad
    from public.unified_tags t
    join public.tag_categories c on c.id = t.category_id
   where t.slug in ('hysterectomy','silicone-injection','bone-health','gatekeeping',
                    'informed-consent-model','wpath-standards-of-care',
                    'gender-affirming-care-coverage','trans-competent-provider')
     and t.category is distinct from c.name;
  if v_bad is not null then
    raise exception 'ucsf new tags: category text mirror disagrees with category_id: %', v_bad;
  end if;

  -- The harm-reduction entry is the reason for this migration. If any of these
  -- three facts is edited out, the page stops doing the job it was written for.
  select count(*) into v_n from public.unified_tags
   where slug = 'silicone-injection'
     and coalesce(long_description,'') ~* 'embolism'
     and coalesce(long_description,'') ~* 'migrat'
     and coalesce(long_description,'') ~* 'pumping part';
  if v_n <> 1 then
    raise exception 'silicone-injection: prose must keep embolism risk, migration, and the pumping-party term';
  end if;

  -- and must stay reachable by a signed-out reader despite being sensitive
  select count(*) into v_n from public.unified_tags
   where slug = 'silicone-injection' and is_sensitive and human_reviewed
     and verification_status in ('reviewed','locked') and seo_indexable;
  if v_n <> 1 then
    raise exception 'silicone-injection: sensitive tag is not publicly readable';
  end if;

  -- The two consent senses stay separate rows.
  select count(*) into v_n from public.unified_tags
   where slug in ('informed-consent','informed-consent-model');
  if v_n <> 2 then
    raise exception 'informed-consent and informed-consent-model must remain distinct rows';
  end if;

  -- Nothing new landed in an adult category.
  select string_agg(t.slug, ', ') into v_bad
    from public.unified_tags t where t.is_adult
     and t.slug in ('hysterectomy','silicone-injection','bone-health','gatekeeping',
                    'informed-consent-model','wpath-standards-of-care',
                    'gender-affirming-care-coverage','trans-competent-provider');
  if v_bad is not null then
    raise exception 'ucsf new tags: unexpectedly adult-gated: %', v_bad;
  end if;
end
$verify$;
