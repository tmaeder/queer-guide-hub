-- The trans-health vocabulary: re-file what is misfiled, revive what was culled.
--
-- Second of the UCSF pass (see 20261013110000 for the source, its 2016 date, and
-- the limits on how it may be used). This one covers the two structural faults
-- behind the empty category rather than individual wrong descriptions.
--
-- FAULT 1 — THE CATEGORY BUILT FOR THIS TOPIC IS EMPTY. `trans-health`
-- ("Trans Health & Gender-Affirming Care", a taxonomy-v3 stop on the Health line)
-- held THREE active tags on 2026-08-29 — gender-affirming-care, gender-transition,
-- hormone-therapy — while `Fetishes` held 470. Its actual vocabulary was scattered
-- across Sexual Health, Mental Health, Slang & Language and, least defensibly,
-- **Orientation**: `puberty-blockers`, `transdermal-testosterone` and
-- `gender-marker` were all filed as sexual orientation, as were `transsexual` and
-- `genderqueer`, which are gender identity terms.
--
-- FAULT 2 — THE CANONICAL VOCABULARY WAS AUTO-CULLED, NOT RETIRED. `vaginoplasty`,
-- `phalloplasty`, `metoidioplasty`, `orchiectomy`, `feminizing-hormone-therapy`,
-- `masculinizing-hormone-therapy`, `spironolactone` and the rest are `deprecated`,
-- every one stamped either "data-quality audit 2026-06-05: orphan tag (no entity
-- assignments…)" or "auto: zero usage". They were removed for not being attached to
-- a venue. That is the wrong test for a glossary — `/tags/:slug` is a destination
-- page — and deprecated tags leave `search_documents` entirely (measured: 2
-- deprecated rows indexed against 3,767 active). The effect was that the platform
-- had no findable entry for any gender-affirming surgery.
--
-- REVIVING IS NOT ENOUGH ON ITS OWN, and the prose had to be read rather than
-- assumed. The plan for this migration said the culled rows carried "accurate
-- prose" and simply needed reactivating. Reading all thirteen showed that is true
-- for the hormone tags and false for the surgical ones:
--
--   * `vaginoplasty` described pelvic organ prolapse, congenital defects, injury
--     and removal of malignant growths — an entire description of NON-trans
--     vaginoplasty that never once mentioned gender affirmation.
--   * `phalloplasty` closed on "this term is sometimes used to describe penis
--     enlargement procedures", again centring the non-trans use.
--   * `metoidioplasty` used "female-to-male", dated framing this glossary does not
--     use elsewhere.
--   * `orchiectomy` led on "castration" and "chemical castration".
--   * `bottom-surgery` was hedging filler ("a personal and significant decision
--     that should be made with careful consideration").
--
-- Those five are rewritten from the UCSF surgical chapters. The rest keep their
-- existing text, which is accurate — this migration does not rewrite prose for the
-- sake of it.
--
-- ONE ROW IS DELIBERATELY LEFT DEPRECATED: `chest-reconstruction-surgery`. Its own
-- prose opens "Chest reconstruction surgery, also known as top surgery" — it is a
-- straight duplicate of `top-surgery`, which is already active, better described
-- and actually used. Reviving it would publish two glossary pages for one concept.
-- It also has an EMPTY `description` (short and long are populated, the middle one
-- is not), so activating it with seo_indexable would have broken the
-- `indexable_without_description` zero-invariant in the tag-hygiene CI gate — found
-- by checking the revive list against that metric rather than by the gate failing
-- after merge. Retiring the duplicate is the right answer either way.
--
-- Still definition-and-consequences only: what the procedure is, what it is made
-- from, and that it is usually staged. No operative technique, no complication
-- rates, no aftercare protocol — the source is nine years old and this is not a
-- clinical reference. Each links out.
--
-- Mechanics are identical to 20261013110000 and were proven there: one tag per
-- iteration; `category_id` AND `category` named together in one statement so the
-- column-scoped `trg_search_documents_tag` actually fires; then the stale
-- adult-category junction delete; then the seo_indexable restore. `human_reviewed`
-- is what stops `deprecate_unused_tags()` re-culling every one of these tonight,
-- since they all still have usage_count = 0.
--
-- A SENSITIVE TAG IS STILL INDEXED ONCE A HUMAN HAS REVIEWED IT. Seven of these
-- carry `is_sensitive` — feminizing and masculinizing hormone therapy, hormone and
-- puberty blockers, metoidioplasty, orchiectomy, spironolactone — i.e. precisely
-- the core of the vocabulary. An earlier draft of the seo_indexable statement
-- excluded sensitive rows, which would have revived exactly those seven and left
-- them deindexed: published but unfindable, which is most of the way back to the
-- problem this migration exists to fix. `enforce_tag_seo_sensitivity_gate()` only
-- forces `seo_indexable := false` on a sensitive row that is NOT human-reviewed,
-- and `doxy-pep` (20261004100100) is the standing precedent for sensitive +
-- reviewed + indexable. `is_adult` remains excluded, which is a different rule and
-- correctly stays.
--
-- Three of those seven also carry a WRONG sensitive topic: `sti` is stamped on
-- feminizing-hormone-therapy, masculinizing-hormone-therapy and orchiectomy, none
-- of which have anything to do with sexually transmitted infections. That array
-- feeds `TagSafetyCallout`, so the live effect is an STI warning on a hormone
-- therapy page. Cleaned below; the genuine topics are kept.

select set_config('app.actor', 'admin:ucsf-transcare-20260829', true);

do $mig$
declare
  r        record;
  v_tag_id uuid;
  v_cat_id uuid;
  v_missing text[] := '{}';
begin
  for r in
    select * from (values
      -- === rewritten: prose centred the non-trans use or used dated framing ===
      ('vaginoplasty', 'trans-health', 'Vaginoplasty',
       'Surgical construction of a vagina, most commonly by penile inversion.',
       'Vaginoplasty is the surgical construction of a vagina. In gender-affirming care the usual technique is penile inversion, which builds the vaginal lining from penile skin and the labia from scrotal skin.',
'Vaginoplasty constructs a vagina. The most common gender-affirming technique is some variation of penile inversion: a vaginal canal is created between the rectum and the urethra, lined with penile skin, with the labia majora formed from scrotal skin and the clitoris from part of the glans. An orchiectomy is performed as part of the procedure.

The prostate is deliberately left in place — removing it risks incontinence and urethral stricture, and it carries erogenous sensation. That also means prostate health remains relevant afterwards.

Typical depth is around 15 cm. Where there is not enough genital skin — after circumcision, for example — a graft from the hip, lower abdomen or inner thigh may be used. Genital hair removal is generally required beforehand.

Dilation is a long-term commitment after this surgery, not a short recovery task. Techniques other than penile inversion exist, including intestinal (sigmoid) vaginoplasty and shallow-depth or zero-depth options for people who do not want a canal.'),

      ('phalloplasty', 'trans-health', 'Phalloplasty',
       'Surgical construction of a penis using a skin flap, usually from the forearm or thigh.',
       'Phalloplasty is the surgical construction of a penis using a flap of skin taken from elsewhere on the body — most often the forearm or the thigh. It is normally staged across several operations.',
'Phalloplasty in gender-affirming care builds a penis from a flap of the person''s own skin, usually taken from the forearm (radial forearm free flap) or the outer thigh (anterior lateral thigh flap). The skin is rolled into a tube and grafted at the groin, with its blood supply either reconnected or kept intact depending on the technique.

It is normally staged across several operations rather than done in one, so that grafts can establish a blood supply before later stages. Optional components include scrotoplasty with or without testicular implants, lengthening the urethra to allow standing urination, and an erectile implant. A hysterectomy and vaginectomy usually precede urethral lengthening, to reduce the risk of fistula.

Sensation depends on the technique and on whether nerves are connected. The donor site leaves a visible scar, which is one of the factors people weigh when choosing between forearm and thigh.

Metoidioplasty is the other route, and a different operation rather than a smaller version of this one.'),

      ('metoidioplasty', 'trans-health', 'Metoidioplasty',
       'Genital surgery that releases the testosterone-enlarged clitoris to form a small penis.',
       'Metoidioplasty is genital surgery that releases the clitoris — enlarged by testosterone — to form a small penis, using existing tissue rather than a graft.',
'Metoidioplasty uses tissue that is already there. Testosterone enlarges the clitoris over time, and the procedure releases it from the surrounding ligaments and skin so that it sits forward as a small penis.

Because it uses no graft, there is no donor site and no scar elsewhere on the body, it is a shorter operation than phalloplasty, and erogenous sensation and spontaneous erection are generally retained. The result is proportionally smaller, and penetrative sex is usually not possible.

It can be combined with urethral lengthening to allow standing urination, and with scrotoplasty. Some people have metoidioplasty first and phalloplasty later; others choose it as the endpoint.

Also spelled metaoidioplasty or metaidoioplasty.'),

      ('orchiectomy', 'trans-health', 'Orchiectomy',
       'Surgical removal of the testicles.',
       'Orchiectomy is the surgical removal of the testicles. As gender-affirming care it sharply reduces testosterone, often allowing hormone doses to be lowered or anti-androgens stopped.',
'Orchiectomy removes the testicles. In gender-affirming care it is sometimes chosen on its own and is always part of a penile-inversion vaginoplasty.

Its main effect is endocrine: with the body''s main source of testosterone gone, oestrogen doses can often be reduced and anti-androgens such as spironolactone usually stopped altogether. For people who do not want vaginoplasty, or who want to stop taking a blocker, that is frequently the reason for it.

It is a comparatively short operation and, as genital surgeries go, a simple one. It is also permanent and ends fertility, so sperm banking beforehand is worth considering if biological children may ever be wanted.

Someone who has had an orchiectomy but not a vaginoplasty can still have one later.'),

      ('bottom-surgery', 'trans-health', 'Bottom Surgery',
       'Umbrella term for gender-affirming genital surgery.',
       'Bottom surgery is the informal umbrella term for gender-affirming genital surgery — vaginoplasty, phalloplasty, metoidioplasty, orchiectomy, hysterectomy and vaginectomy among them.',
'Bottom surgery is the everyday term for gender-affirming genital surgery. It is not one operation: it covers vaginoplasty, vulvoplasty and orchiectomy on one side, and metoidioplasty, phalloplasty, hysterectomy, oophorectomy and vaginectomy on the other, in whatever combination someone chooses.

Most people who transition do not have bottom surgery, and that is unremarkable rather than an incomplete transition. Cost, surgical access, waiting lists, health conditions and simple preference all bear on it.

Where it is wanted, it is usually staged over more than one operation and more than one year, and several of the procedures have their own entries here.')
    ) as t(slug, cat_slug, nm, short_d, desc_d, long_d)
  loop
    select id into strict v_cat_id from public.tag_categories where slug = r.cat_slug;
    select id into v_tag_id from public.unified_tags where slug = r.slug;
    if v_tag_id is null then
      v_missing := v_missing || r.slug;
      continue;
    end if;

    update public.unified_tags
       set name=r.nm, slug=r.slug, short_description=r.short_d, description=r.desc_d,
           long_description=r.long_d,
           category_id=v_cat_id,
           category=(select name from public.tag_categories where id=v_cat_id),
           status='active', entity_kind='concept', human_reviewed=true,
           verification_status='reviewed', merged_into_id=null, deprecated_at=null,
           deprecation_reason=null, last_verified_at=now(), updated_at=now()
     where id = v_tag_id;

    delete from public.tag_category_assignments a using public.tag_categories c
     where a.category_id=c.id and a.tag_id=v_tag_id
       and c.slug in ('fetishes-interests','bdsm-power-exchange','practices-play',
                      'gear-aesthetics','kink-community','sex-kink');

    update public.unified_tags set seo_indexable=true, updated_at=now()
     where id=v_tag_id and not is_adult and human_reviewed;
  end loop;

  -- === re-file / revive, prose kept as-is: it was read and is accurate ===
  for r in
    select * from (values
      -- misfiled while ACTIVE
      ('top-surgery',                  'trans-health'),
      ('facial-feminization-surgery',  'trans-health'),
      ('testosterone-enanthate',       'trans-health'),
      ('transsexual',                  'gender-identity'),  -- was Orientation
      ('genderqueer',                  'gender-identity'),  -- was Orientation
      -- deprecated by the orphan sweep, prose accurate
      ('feminizing-hormone-therapy',   'trans-health'),
      ('masculinizing-hormone-therapy','trans-health'),
      ('puberty-blockers',             'trans-health'),     -- was Orientation
      ('hormone-blockers',             'trans-health'),
      ('anti-androgen-therapy',        'trans-health'),
      ('spironolactone',               'trans-health'),
      ('transdermal-testosterone',     'trans-health'),     -- was Orientation
      ('testosterone-therapy',         'trans-health'),
      ('estrogen-therapy',             'trans-health'),     -- was Mental Health
      ('medical-transition',           'trans-health'),
      ('voice-therapy',                'trans-health'),     -- was Mental Health
      ('transgender-healthcare-access','trans-health'),
      ('legal-transition',             'legal-rights'),
      ('legal-name-change',            'legal-rights'),
      ('gender-marker',                'legal-rights'),     -- was Orientation
      ('gender-marker-change',         'legal-rights'),
      ('cervical-cancer-screening',    'physical-reproductive')
    ) as t(slug, cat_slug)
  loop
    select id into strict v_cat_id from public.tag_categories where slug = r.cat_slug;
    select id into v_tag_id from public.unified_tags where slug = r.slug;
    if v_tag_id is null then
      v_missing := v_missing || r.slug;
      continue;
    end if;

    update public.unified_tags
       set category_id=v_cat_id,
           category=(select name from public.tag_categories where id=v_cat_id),
           status='active', human_reviewed=true, verification_status='reviewed',
           merged_into_id=null, deprecated_at=null, deprecation_reason=null,
           last_verified_at=now(), updated_at=now()
     where id = v_tag_id;

    delete from public.tag_category_assignments a using public.tag_categories c
     where a.category_id=c.id and a.tag_id=v_tag_id
       and c.slug in ('fetishes-interests','bdsm-power-exchange','practices-play',
                      'gear-aesthetics','kink-community','sex-kink');

    update public.unified_tags set seo_indexable=true, updated_at=now()
     where id=v_tag_id and not is_adult and human_reviewed;
  end loop;

  -- `sti` is not a property of hormone therapy or of an orchiectomy. Removed by
  -- name so a genuine topic on the same row survives, and only where it is present,
  -- so this is a no-op on a row someone has since cleaned by hand.
  update public.unified_tags
     set sensitive_topics = array_remove(sensitive_topics, 'sti'),
         updated_at = now()
   where slug in ('feminizing-hormone-therapy','masculinizing-hormone-therapy','orchiectomy')
     and sensitive_topics @> array['sti'];

  -- A slug that has moved under us is worth saying out loud rather than silently
  -- skipping — several sibling worktrees are editing this table concurrently.
  if array_length(v_missing, 1) > 0 then
    raise notice 'ucsf refile: % slug(s) not found, skipped: %',
      array_length(v_missing, 1), array_to_string(v_missing, ', ');
  end if;
end
$mig$;

do $verify$
declare v_n int; v_bad text;
begin
  -- The category exists to hold this vocabulary; before this pass it held 3.
  select count(*) into v_n
    from public.unified_tags t
    join public.tag_categories c on c.id = t.category_id
   where c.slug = 'trans-health' and t.status = 'active';
  if v_n < 20 then
    raise exception 'ucsf refile: trans-health should hold 20+ active tags, holds %', v_n;
  end if;

  -- Nothing clinical left filed as sexual orientation.
  select string_agg(t.slug, ', ') into v_bad
    from public.unified_tags t
    join public.tag_categories c on c.id = t.category_id
   where c.slug = 'sexual-orientation'
     and t.slug in ('puberty-blockers','transdermal-testosterone','gender-marker',
                    'transsexual','genderqueer');
  if v_bad is not null then
    raise exception 'ucsf refile: still filed under Orientation: %', v_bad;
  end if;

  -- Every surgical entry must actually be about gender affirmation. This is the
  -- assertion that would have caught the vaginoplasty description, which was a
  -- complete and accurate account of the wrong subject.
  select string_agg(slug, ', ') into v_bad from public.unified_tags
   where slug in ('vaginoplasty','phalloplasty','metoidioplasty','orchiectomy','bottom-surgery')
     and coalesce(long_description,'') !~* '(gender.affirming|gender affirmation|transition|testosterone|oestrogen|estrogen)';
  if v_bad is not null then
    raise exception 'ucsf refile: surgical prose does not mention gender affirmation: %', v_bad;
  end if;

  -- and must not have reverted to the framings that were removed
  select string_agg(slug, ', ') into v_bad from public.unified_tags
   where slug in ('vaginoplasty','phalloplasty','metoidioplasty','orchiectomy','bottom-surgery')
     and (coalesce(description,'') || ' ' || coalesce(long_description,''))
         ~* '(female-to-male|male-to-female|penis enlargement|chemical castration)';
  if v_bad is not null then
    raise exception 'ucsf refile: dated or off-topic framing returned on: %', v_bad;
  end if;

  -- Zero-usage rows survive the nightly prune only if human_reviewed.
  select string_agg(slug, ', ') into v_bad from public.unified_tags
   where status = 'active' and coalesce(usage_count,0) = 0 and not coalesce(human_reviewed,false)
     and slug in ('vaginoplasty','phalloplasty','metoidioplasty','orchiectomy','bottom-surgery',
                  'feminizing-hormone-therapy','masculinizing-hormone-therapy','puberty-blockers',
                  'spironolactone','voice-therapy','medical-transition','legal-name-change');
  if v_bad is not null then
    raise exception 'ucsf refile: revived but not human_reviewed, will be re-culled tonight: %', v_bad;
  end if;

  -- The sensitive core must be indexable, not merely alive. This is the assertion
  -- for the draft that revived seven hormone and surgery tags and left every one
  -- of them deindexed.
  select string_agg(slug, ', ') into v_bad from public.unified_tags
   where status = 'active' and is_sensitive and not seo_indexable
     and slug in ('feminizing-hormone-therapy','masculinizing-hormone-therapy',
                  'hormone-blockers','puberty-blockers','metoidioplasty',
                  'orchiectomy','spironolactone');
  if v_bad is not null then
    raise exception 'ucsf refile: sensitive tags revived but left deindexed: %', v_bad;
  end if;

  -- and none of them still claims to be about STIs
  select string_agg(slug, ', ') into v_bad from public.unified_tags
   where slug in ('feminizing-hormone-therapy','masculinizing-hormone-therapy','orchiectomy')
     and sensitive_topics @> array['sti'];
  if v_bad is not null then
    raise exception 'ucsf refile: bogus sti sensitive_topic survived on: %', v_bad;
  end if;
end
$verify$;
