-- Trans gear was resolved to the wrong entities, then filed as fetish content.
--
-- Matching the UCSF Guidelines for the Primary and Gender-Affirming Care of
-- Transgender and Gender Nonbinary People (2nd ed., transcare.ucsf.edu/guidelines)
-- against `unified_tags` found the namesake-chimera class from
-- 20261008100000 alive and unrepaired on the trans-gear vocabulary. Measured on
-- prod 2026-08-29 — these are the PUBLISHED descriptions, not drafts:
--
--   tucking  (Slang & Language)  "Pre-industrial wool fabric making process"
--   packing  (Slang & Language)  "Preparing luggage for travel"
--   binding  (Sexual Health)     "A required course of action"
--   binder   (Expression & Style)"Family name"
--   binders  (—)                 "Folder with rings for holding papers"
--   packers  (—)                 "American football team"
--   stealth  (Fetishes, adult)   "Stealth may refer to:"   <- a scraped disambiguation page
--   gaff     (Fetishes, adult)   (empty)
--
-- Every one is the same defect: an identifier resolved by NAME, adopting whatever
-- article the redirect landed on, and the prose then generated from that wrong
-- entity. `binder`, `binders` and `packers` are left deprecated on purpose — those
-- three rows really are the family name, the office product and the NFL team, and
-- the right answer for them is to stay out of the glossary, not to be rewritten.
--
-- THE LIVE HARM IS THE ADULT GATE. `hair-removal` is status=active and in
-- `search_documents` filed under **Fetishes** with is_adult=true. UCSF gives hair
-- removal its own chapter as gender-affirming care — facial and genital electrolysis
-- in preparation for vaginoplasty, forearm and thigh graft-site clearance before
-- phalloplasty. The platform was publishing it as a fetish behind an age gate, and
-- `stealth` and `gaff` carried the same gating.
--
-- WHAT THE SOURCE IS USED FOR, AND WHAT IT IS NOT. UCSF is clinical guidance
-- published 2016. Its procedural chapters are quoted here for the definitions of
-- tucking, packing, binding and the gaff, and for the harms it actually names.
-- Its TERMINOLOGY chapter is deliberately not used: that chapter anchors
-- trans-masculine/trans-feminine to the birth certificate and treats "transsexual"
-- as current clinical vocabulary, which is 2016 framing this glossary already
-- states better. And no dosing, protocol or contraindication list is reproduced —
-- definition plus the harms named by the source, then a link out.
--
-- `stealth` gets NO UCSF citation, because UCSF does not define it. It is community
-- vocabulary and is sourced as such. It is also NOT given the "stealthing" sense
-- (non-consensual condom removal): that is a different word for a sexual assault,
-- it has no tag today, and collapsing the two on one page would be its own harm.
--
-- ORDER OF THE THREE STATEMENTS PER TAG IS LOAD-BEARING, and was established by
-- probing prod in a rolled-back transaction rather than reasoned about:
--
--   1. UPDATE unified_tags — prose + `category_id` AND `category` together.
--      `category_id` is the single lever (BEFORE `sync_tag_category_assignment`
--      derives the text, AFTER `sync_tag_category_assignment_after` moves the
--      primary junction row), but `trg_search_documents_tag` is COLUMN-SCOPED and
--      fires on the columns named in the statement, not on what a BEFORE trigger
--      mutated — so `category` must be named explicitly or the search facet keeps
--      the old value. Measured: with it, search_reindex_queue 3 -> 4.
--   2. DELETE the stale adult-category junction rows. **Re-filing alone does NOT
--      clear is_adult** — this was the assumption going in and it is false. The
--      AFTER trigger DEMOTES the old primary, it does not remove it, so the
--      Fetishes row survives as non-primary and `unified_tags_recompute_is_adult()`
--      reads ALL junction rows. Measured on `gaff`: after step 1 alone,
--      junction = "Fetishes, Trans Health*" and is_adult was still true.
--   3. UPDATE seo_indexable. `enforce_tag_seo_sensitivity_gate()` forced it false
--      during step 1, while is_adult was still true, and nothing restores it when
--      the flag later clears. Measured: is_adult false but seo_indexable false
--      until this third statement runs.
--
-- One tag per iteration, one tuple per statement: two junction rows in a single
-- statement raises 27000 via the is_adult recompute writing back to unified_tags
-- (20260907100000).
--
-- `human_reviewed = true` is not decoration. Every tag here has usage_count = 0,
-- and `deprecate_unused_tags()` prunes zero-usage active tags unless they are
-- human-reviewed. Without it this whole migration is silently undone by the
-- nightly job — which is how this vocabulary was culled in the first place.

select set_config('app.actor', 'admin:ucsf-transcare-20260829', true);

do $mig$
declare
  r         record;
  v_tag_id  uuid;
  v_cat_id  uuid;
begin
  for r in
    select * from (values
      -- slug, target category slug, name, short_description, description, long_description
      ('tucking', 'trans-health', 'Tucking',
       'Positioning the penis and testicles to give a flat crotch line.',
       'Tucking is the practice of positioning the penis and testicles to give a smooth, flat crotch line — usually held in place by tight underwear or a purpose-made undergarment called a gaff.',
'Tucking gives a visibly smooth crotch contour. The testicles, if present, are moved up into the inguinal canal, and the penis and scrotum are drawn back into the perineal region. Tight-fitting underwear or a purpose-made undergarment called a gaff then holds that position; some people use adhesive or tape instead.

The UCSF guidelines note the trade-offs plainly: alongside effects on the skin itself, tucking can lead to urinary irritation or infection, and to testicular discomfort. Tape and adhesives are the harshest on skin.

None of that makes tucking unsafe as such — it is ordinary practice for a great many trans women and transfeminine people, and it is worth knowing that a gaff exists rather than improvising with tape.'),

      ('packing', 'trans-health', 'Packing',
       'Wearing a prosthetic in the underwear to create a visible bulge.',
       'Packing is wearing a prosthetic — a packer — in the underwear to create a visible bulge. It serves both an outward appearance and, for many people, a real reduction in gender dysphoria.',
'Packing means placing a penile prosthesis, commonly called a packer, in one''s underwear. The UCSF guidelines describe it as serving two purposes at once: the outward appearance, and a reduction in gender dysphoria for the person wearing it.

Packers range from soft silicone shapes worn purely for contour to firmer ones designed to be used for standing urination or for sex. Some are held by a harness, some by close-fitting underwear made for the purpose.

It is a garment practice, not a medical one, and carries no particular health risk.'),

      ('binding', 'trans-health', 'Binding',
       'Flattening the chest with a compression garment.',
       'Binding is flattening the chest with a compression garment. A purpose-made binder is the safer option; the harms that are documented come mostly from improvised methods and from wearing one too long.',
'Binding flattens the chest contour. People use tight sports bras, layered shirts, ace bandages, or a purpose-made binder.

The UCSF guidelines name the harms directly. Where someone has larger breasts, several garments may be layered, and breathing can be restricted. Prolonged binding is associated with breast pain, local skin irritation, and fungal infections.

The practical reading of that is not "do not bind" — it is that a garment made for binding is a better idea than bandages or doubled-up sports bras, that layering to get a flatter result is the thing that restricts breathing, and that time spent bound is the variable most within your control.'),

      ('gaff', 'trans-health', 'Gaff',
       'An undergarment worn to hold a tuck in place.',
       'A gaff is a purpose-made undergarment that holds a tuck in place, used instead of improvised tight underwear, adhesive or tape.',
'A gaff is an undergarment made specifically to hold a tuck. The UCSF guidelines describe it as the garment worn to maintain the alignment after tucking, as an alternative to ordinary tight-fitting underwear.

The reason it is worth naming as its own thing is the alternative: the same guidelines note that some people use adhesive or duct tape to hold a tuck, which is considerably harder on the skin. A gaff does the same job without that.

Gaffs are sold as ordinary underwear by a number of trans-run makers, in styles from briefs to thongs.'),

      ('stealth', 'gender-identity', 'Stealth',
       'Living without disclosing that one is trans.',
       'Stealth describes living without disclosing that one is trans — being read simply as a man or a woman, with one''s trans history known only to people one chooses to tell.',
'Stealth describes living without disclosing that one is trans: being read, at work and in public and often among friends, simply as a man or a woman, with one''s history known only to those one chooses to tell.

It is a position rather than an identity, and people move in and out of it. Some are stealth everywhere, some only at work or only when travelling, some were stealth for years and are now open. The reasons range from plain privacy — a medical history is nobody''s business — to safety in places where being known as trans carries real risk.

The word carries some weight in community debate, because it can be heard as implying concealment of something shameful; "private" or "non-disclosing" are preferred by some for that reason. Being outed against one''s will is a different matter entirely, and can be dangerous.

Not to be confused with "stealthing", an unrelated term for removing a condom without the other person''s consent, which is a sexual assault.')
    ) as t(slug, cat_slug, nm, short_d, desc_d, long_d)
  loop
    select id into v_cat_id from public.tag_categories where slug = r.cat_slug;
    if v_cat_id is null then
      raise exception 'category % not found', r.cat_slug;
    end if;

    select id into v_tag_id from public.unified_tags where slug = r.slug;
    if v_tag_id is null then
      raise exception 'tag % not found — expected to repair an existing row, not create one', r.slug;
    end if;

    -- 1. prose + filing. `slug` is restated so the BEFORE normaliser cannot
    -- regenerate it from the new name (measured: renaming alone rewrites the slug).
    update public.unified_tags
       set name                = r.nm,
           slug                = r.slug,
           short_description   = r.short_d,
           description         = r.desc_d,
           long_description    = r.long_d,
           category_id         = v_cat_id,
           category            = (select name from public.tag_categories where id = v_cat_id),
           status              = 'active',
           entity_kind         = 'concept',
           human_reviewed      = true,
           verification_status = 'reviewed',
           merged_into_id      = null,
           deprecated_at       = null,
           deprecation_reason  = null,
           last_verified_at    = now(),
           updated_at          = now()
     where id = v_tag_id;

    -- 2. the stale adult filing, which step 1 demotes but does not remove
    delete from public.tag_category_assignments a
     using public.tag_categories c
     where a.category_id = c.id
       and a.tag_id = v_tag_id
       and c.slug in ('fetishes-interests','bdsm-power-exchange','practices-play',
                      'gear-aesthetics','kink-community','sex-kink');

    -- 3. restore the SEO gate, now that is_adult has recomputed to false
    update public.unified_tags
       set seo_indexable = true, updated_at = now()
     where id = v_tag_id
       and not is_adult
       and human_reviewed;
  end loop;

  -- `hair-removal` is the live one. It is NOT moved to Trans Health: the row is the
  -- generic concept (Q625145, "Temporary removal of body hair") and belongs with
  -- grooming and presentation. The gender-affirming entry is the separate tag
  -- below. What matters here is only that it stops being a fetish.
  select id into strict v_cat_id from public.tag_categories where slug = 'expression-presentation';
  select id into strict v_tag_id from public.unified_tags where slug = 'hair-removal';

  -- Prose is also replaced. What was there was not fetish-framed, but it was
  -- circular filler ("The goal of hair removal is to remove unwanted hair from the
  -- body"), and it is now the parent of a real gender-affirming entry, so it should
  -- point at it.
  update public.unified_tags
     set short_description = 'Removing body or facial hair, temporarily or permanently.',
         description       = 'Removing body or facial hair. Temporary methods include shaving, waxing, plucking and depilatory creams; laser and electrolysis are the two routes to permanent reduction.',
         long_description  =
'Hair removal covers everything from shaving to permanent reduction. The temporary methods — shaving, waxing, plucking, threading, depilatory creams — work on the hair above or just below the surface and have to be repeated indefinitely. The two permanent methods, laser and electrolysis, target the follicle itself.

Reasons vary and need no justification: comfort, sport, aesthetics, cultural norms, or gender presentation.

Where hair removal is part of gender-affirming care — facial and neck clearance, or clearing a surgical site before genital surgery — see Electrolysis & Laser Hair Removal, which covers the two permanent methods and how they are used in that context.',
         category_id = v_cat_id,
         category    = (select name from public.tag_categories where id = v_cat_id),
         human_reviewed = true,
         verification_status = 'reviewed',
         last_verified_at = now(),
         updated_at = now()
   where id = v_tag_id;

  delete from public.tag_category_assignments a
   using public.tag_categories c
   where a.category_id = c.id and a.tag_id = v_tag_id
     and c.slug in ('fetishes-interests','bdsm-power-exchange','practices-play',
                    'gear-aesthetics','kink-community','sex-kink');

  update public.unified_tags
     set seo_indexable = true, updated_at = now()
   where id = v_tag_id and not is_adult and human_reviewed;

  -- The gender-affirming hair-removal entry, revived out of "Dynamics & Roles"
  -- (where it was also adult-gated). The rename regenerates the slug from
  -- `electrolysis-laser-hair-removal-affirming` to `electrolysis-laser-hair-removal`,
  -- which is allowed to happen: the row is deprecated, so no live URL points at it.
  select id into strict v_cat_id from public.tag_categories where slug = 'trans-health';
  select id into v_tag_id from public.unified_tags
   where slug in ('electrolysis-laser-hair-removal-affirming','electrolysis-laser-hair-removal');

  if v_tag_id is not null then
    update public.unified_tags
       set name              = 'Electrolysis & Laser Hair Removal',
           slug              = 'electrolysis-laser-hair-removal',
           short_description = 'Permanent hair reduction used as part of gender-affirming care.',
           description       = 'Electrolysis and laser hair removal are the two methods used for permanent hair reduction, including as part of gender-affirming care — facial and body hair, and clearing surgical sites before genital surgery.',
           long_description  =
'Electrolysis and laser are the two routes to permanent hair reduction, and they work differently. Laser targets the pigment in dark, coarse hair, so it covers large areas quickly but does little for fine, light, red, blonde or grey hair. Electrolysis treats one follicle at a time, which is slower but does not depend on the hair having pigment.

Both need repeated sessions, because hair is only susceptible during the growing phase and every strand is on its own cycle. The UCSF guidelines put effectiveness at roughly 85-90% and note that combining the two often gives the best result.

In gender-affirming care this is not only cosmetic. Trans women commonly seek facial and neck clearance, and genital clearance is required before vaginoplasty; trans men may need forearm or thigh sites cleared before phalloplasty, because those are the graft sites.

Insurance coverage is expanding but remains inconsistent, and finding a practitioner experienced with trans clients makes a real difference to how the process goes.',
           category_id       = v_cat_id,
           category          = (select name from public.tag_categories where id = v_cat_id),
           status            = 'active',
           entity_kind       = 'concept',
           human_reviewed    = true,
           verification_status = 'reviewed',
           merged_into_id    = null,
           deprecated_at     = null,
           deprecation_reason = null,
           last_verified_at  = now(),
           updated_at        = now()
     where id = v_tag_id;

    delete from public.tag_category_assignments a
     using public.tag_categories c
     where a.category_id = c.id and a.tag_id = v_tag_id
       and c.slug in ('fetishes-interests','bdsm-power-exchange','practices-play',
                      'gear-aesthetics','kink-community','sex-kink');

    update public.unified_tags
       set seo_indexable = true, updated_at = now()
     where id = v_tag_id and not is_adult and human_reviewed;
  end if;
end
$mig$;

do $verify$
declare
  v_n    int;
  v_bad  text;
begin
  -- Every repaired tag live, reviewed, filed, and out of the adult gate.
  select count(*) into v_n from public.unified_tags
   where slug in ('tucking','packing','binding','gaff','stealth',
                  'electrolysis-laser-hair-removal','hair-removal')
     and status = 'active' and human_reviewed
     and verification_status in ('reviewed','locked')
     and category_id is not null
     and not is_adult;
  if v_n <> 7 then
    raise exception 'ucsf gear repair: expected 7 live non-adult reviewed tags, found %', v_n;
  end if;

  -- No adult-category junction row may survive on any of them. This is the
  -- assertion that would have caught the false assumption above: step 1 alone
  -- leaves the Fetishes row in place and is_adult stays true.
  select string_agg(t.slug || '->' || c.name, ', ') into v_bad
    from public.tag_category_assignments a
    join public.unified_tags t on t.id = a.tag_id
    join public.tag_categories c on c.id = a.category_id
   where t.slug in ('tucking','packing','binding','gaff','stealth',
                    'electrolysis-laser-hair-removal','hair-removal')
     and c.slug in ('fetishes-interests','bdsm-power-exchange','practices-play',
                    'gear-aesthetics','kink-community','sex-kink');
  if v_bad is not null then
    raise exception 'ucsf gear repair: adult junction rows survived: %', v_bad;
  end if;

  -- The chimeras themselves. If any of these strings comes back the prose has been
  -- reverted to the wrong entity, which is a factual regression rather than a
  -- style one, so it fails here instead of being read by someone.
  select string_agg(slug, ', ') into v_bad from public.unified_tags
   where slug in ('tucking','packing','binding','gaff','stealth')
     and (coalesce(short_description,'') || ' ' || coalesce(description,'') || ' ' || coalesce(long_description,''))
         ~* '(wool fabric|luggage|American football|Family name|rings for holding papers|may refer to|required course of action)';
  if v_bad is not null then
    raise exception 'ucsf gear repair: namesake prose still present on: %', v_bad;
  end if;

  -- Each carries real prose, not a stub — `placeholder_description_active` is a
  -- hard CI gate and short shared descriptions are exactly what it counts.
  select string_agg(slug, ', ') into v_bad from public.unified_tags
   where slug in ('tucking','packing','binding','gaff','stealth',
                  'electrolysis-laser-hair-removal','hair-removal')
     and length(coalesce(long_description,'')) < 200;
  if v_bad is not null then
    raise exception 'ucsf gear repair: thin long_description on: %', v_bad;
  end if;

  -- `stealth` must keep the disambiguation against the consent-violation sense.
  select count(*) into v_n from public.unified_tags
   where slug = 'stealth' and coalesce(long_description,'') ~* 'stealthing';
  if v_n <> 1 then
    raise exception 'ucsf gear repair: stealth must distinguish itself from "stealthing"';
  end if;

  -- The three genuine namesakes stay out of the glossary.
  select string_agg(slug, ', ') into v_bad from public.unified_tags
   where slug in ('binder','binders','packers') and status = 'active';
  if v_bad is not null then
    raise exception 'ucsf gear repair: namesake rows must stay deprecated, found active: %', v_bad;
  end if;
end
$verify$;
