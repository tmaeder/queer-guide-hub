-- Revive thirteen core kink terms the 2026-06-05 orphan audit deprecated, and
-- fix the wrong-sense prose on eight of them BEFORE they go back.
--
-- SOURCE: the same seven-glossary comparison as 50500101100000. Every one of
-- these thirteen appears in several of those glossaries as basic vocabulary,
-- and every one is DEPRECATED here with no active row holding the concept.
--
-- THE PREMISE THAT KILLED THEM IS ALREADY RECORDED AS FALSE. Eleven carry
-- `deprecation_reason` = "data-quality audit 2026-06-05: orphan tag (no entity
-- assignments, relations, synonyms, or aliases)" and two carry "auto: zero
-- usage". Neither is a reason to retire a GLOSSARY term — a definition is
-- content in its own right, not an index into venues — which is the finding
-- 20261211100000 recorded when it revived `femdom` and `voyeur`, and which
-- 20360101101600 recorded again for `men-who-have-sex-with-men`,
-- `heterosexism` and `bi-erasure`. This is the third time.
--
-- THE DEDUPE RAN FIRST, and it removed far more candidates than it kept. Of
-- the 34 deprecated rows the comparison surfaced, 21 are NOT revivable and
-- each was checked individually:
--
--   the `intimate-*` family  Bondage, Edging, Fisting, Leather, Rimming,
--       (9 rows)             Roleplay, Rubber, Spanking, Tickling all exist at
--                            `intimate-<term>` with COMPLETELY EMPTY prose and
--                            a live active twin (Fisting u=31, Leather u=17,
--                            Spanking u=9, Bondage u=6, Roleplay u=5). These
--                            are duplicates, correctly deprecated. Leave them.
--   watersports              `Water Sports` is active.
--   dom-space                `Domspace` is active (and repaired in ...100500).
--   ballbusting              `Ball Busting` is active, u=1.
--   latex / rubber           active at `mat-latex` / `mat-rubber`, u>1000.
--   enema                    an approved alias of the active `Enemas`.
--   hanky-code               an approved alias of the active `Handkerchief Code`.
--   kinbaku                  an approved alias of the active `Shibari`.
--   cbt                      the DEPRECATED `cbt` row is Q1147152, cognitive
--                            behavioural therapy, filed under Community Life &
--                            Support — a different concept that merely shares
--                            an acronym with the active `Cock & Ball Torture
--                            (CBT)`. Both senses are correctly separated and
--                            the therapy row is out of scope for a kink pass,
--                            recorded here so the next comparison does not
--                            re-propose it as a missing kink term.
--   crop                     an alias of `Riding Crops`, which is MERGED, so
--                            the concept resolves through a redirect. Left
--                            alone rather than half-fixed.
--   piss-play                `Water Sports` is active and holds the concept; a
--                            second row is a merge decision, not a revive.
--
-- THE PROSE HAD TO BE READ BEFORE ANY OF THIS WAS SAFE, and reading it changed
-- the plan. `description` is correct on all thirteen, but the PUBLISHED prose
-- is the generic or wrong sense on eight:
--
--   negotiation   "a dialogue between two or more parties to resolve
--                 differences, gain an advantage..." — business negotiation,
--                 on the consent term. Q202875 is that generic sense, so the
--                 identifier goes too.
--   whip          "commonly used on horses to give subtle cues", and
--                 `description` is the literal string "Toys tag".
--   pvc           "PVC is also the name of a Norwegian musical group."
--   mummification "Preserved dead body or animal."
--   hemp-rope     "used for various purposes, including sailing and
--                 landscaping."
--   obedience     Milgram-style social psychology, not the D/s practice.
--   flogging      historical punishment and religious flagellation, plus the
--                 "essential to approach this topic with sensitivity"
--                 boilerplate TAG_STYLE_SYSTEM bans.
--   anal-play     "It's essential to prioritize consent, communication, and
--                 safety..." — the same banned padding.
--
-- A blanket revive would have PUBLISHED all eight. Reviving is the cheap half;
-- reading what you are about to republish is the half that matters.
--
-- The other five — consent-violation, orgasm-control, predicament-bondage,
-- play-piercing, g-spot — carry accurate bodies and are revived with their
-- prose UNCHANGED. Rewriting correct prose is the LLM rewrite 20261018094000
-- retired after the judge retracted 16 of its first 18 rows with 13 wrong.
--
-- UNPUBLISHED, DELIBERATELY. status='active' + seo_indexable=false. The gap
-- these terms leave is in SITE SEARCH — search_documents_index_tags holds
-- 4,725 of 4,725 active tags and 0 of 5,271 deprecated ones — and reviving
-- fixes that immediately. Putting thirteen new pages into the crawler index is
-- a separate decision with its own SEO consequences, and it is not one a
-- glossary comparison should take on its own. seo_indexable is set EXPLICITLY
-- rather than left alone: 20361001100100 revived eight terms without it and
-- left them invisible to crawlers with nothing to self-heal them.
--
-- human_reviewed=true is NOT a vanity flag here, it is load-bearing.
-- deprecate_unused_tags() selects exactly `status='active' AND
-- human_reviewed=false AND usage_count=0`, and all thirteen have usage_count=0
-- — so without it the next sweep culls every one of them straight back.
--
-- status, deprecated_at and deprecation_reason are cleared TOGETHER. Clearing
-- only status is what produced the 297-tag resurrection that left rows active
-- with deprecated_at still set.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:revive-core-kink-vocabulary', true);

do $mig$
declare
  v_n      int;
  v_cat    uuid;
  v_missed int;
begin
  ------------------------------------------------------------ 1. fix the prose
  -- Guarded on each defect's own signature, so a row someone has since
  -- rewritten is never overwritten.

  update public.unified_tags set
    wikidata_id   = null,
    wikipedia_url = null,
    short_description =
      'Agreeing what will and will not happen before a scene — acts, limits, safewords, aftercare.',
    long_description =
      'Negotiation is the conversation that happens before play, not during it. It covers what each person wants and does not want, which acts are on and off the table, any injuries, medications or triggers that change what is safe, how the scene ends, what the safeword is, and what aftercare each person needs.

It is the practical form consent takes in kink. Consent given once in the abstract cannot cover a scene nobody has described yet, which is why the detail matters: "bondage, yes" and "suspension, yes" are not the same agreement, and neither party can be held to something that was never said out loud.

Negotiation is also renegotiable. A limit discovered mid-scene is not a failure of the original conversation, and changing your mind is the thing safewords exist to make easy.'
  where slug = 'negotiation'
    and long_description like 'Negotiation is a dialogue between two or more parties%';

  update public.unified_tags set
    description = 'A single-tailed or multi-tailed striking implement, and the impact play done with one.',
    short_description =
      'A single-tail striking implement — the most precise and least forgiving thing in impact play.',
    long_description =
      'A whip in kink usually means a single-tail: a long tapering lash thrown so the tip accelerates, rather than a flogger''s many falls landing together. It is the sharpest sensation in impact play and the least forgiving implement to learn on, because accuracy is entirely in the thrower and a tip that lands where it was not aimed cuts.

Targets are the muscled areas of the back, buttocks and thighs. The kidneys, spine, neck and face are not targets, and a wrapped tip that comes round a ribcage or hip is the most common way a scene ends in an injury nobody intended. People generally learn on a target rather than a person.'
  where slug = 'whip'
    and long_description like '%commonly used on horses%';

  update public.unified_tags set
    short_description =
      'A rigid, high-shine plastic used for fetish clothing — the harder-edged cousin of latex.',
    long_description =
      'PVC is used for fetish clothing where latex''s look is wanted without latex''s fragility or cost. It is stiffer, holds a cut rather than clinging, and has a hard gloss rather than a soft sheen. It does not need polishing or talc, and it is not made from latex, which makes it the usual alternative for people with a latex allergy.

It does not breathe. Wearing it for a long session traps heat and sweat in the same way rubber does, so overheating is the practical limit rather than the material itself.'
  where slug = 'pvc'
    and long_description like '%Norwegian musical group%';

  update public.unified_tags set
    short_description =
      'Wrapping the body completely — plastic wrap, tape or bandage — until movement is gone.',
    long_description =
      'Mummification encases the body, usually in cling film, self-adhesive bandage or bondage tape, so that movement disappears gradually rather than being stopped at joints the way rope stops it. Sensory input drops with it, which is most of the appeal: it is as much a sensory-deprivation practice as a restraint one.

Two things make it different from other bondage. Heat has nowhere to go — a wrapped body overheats quickly, and that is the usual reason a scene ends early. And nobody gets out of it unaided, so safety shears stay within reach and the wrap never covers the face without a clear airway and a non-verbal signal already agreed.'
  where slug = 'mummification'
    and short_description = 'Preserved dead body or animal';

  update public.unified_tags set
    short_description =
      'Natural-fibre rope with the grip and tooth most Japanese-style rope work is built around.',
    long_description =
      'Hemp is one of the two natural fibres used for rope bondage, alongside jute. It holds a knot without slipping, has enough tooth for friction-based ties that rely on rope gripping rope, and softens with use in a way synthetic rope does not.

It arrives stiff and usually unusable: rope is broken in — washed, dried under tension, singed of stray fibres and oiled — before it is tied on anyone. It is also weaker than synthetic rope and it degrades, so suspension line is retired on condition and age rather than kept until it visibly fails. Hemp and jute are largely interchangeable in use; jute is lighter and tends to be the lighter-feeling of the two, hemp the more durable.'
  where slug = 'hemp-rope'
    and long_description like '%sailing and landscaping%';

  update public.unified_tags set
    short_description =
      'Following instructions as the substance of a submissive role, rather than as a mood.',
    long_description =
      'Obedience is the practice half of submission: following agreed instructions, rules or protocols because doing so is the point, not because the instruction is independently attractive. It is what rules, rituals and protocol exist to give shape to.

It is bounded by the negotiation that set it up. An instruction outside what was agreed is outside the dynamic, and the ability to refuse one is what separates an obedience practice from coercion — which is also why obedience play tends to be built out of small, repeatable things rather than open-ended authority.'
  where slug = 'obedience'
    and long_description like 'Obedience is a form of social influence%';

  update public.unified_tags set
    short_description =
      'Impact play with a multi-tailed flogger, from a heavy thud to a light sting depending on the falls.',
    long_description =
      'A flogger has many falls attached to a handle, and they land together — which is what makes it the most controllable implement in impact play and the usual place people start. The sensation is set by the material and weight: heavy suede or leather falls read as a thud that carries into the muscle, light or stiff falls as a sting on the surface.

The target is the muscled area across the upper back, buttocks and thighs. The kidneys, spine, neck and face are avoided, and the tips of the falls travel furthest and land hardest, so the edges of a swing are where an unintended wrap lands.'
  where slug = 'flogging'
    and long_description like 'Flogging, also known as flagellation%';

  update public.unified_tags set
    short_description =
      'Sexual play involving the anus — for any body, since the anatomy is not gendered.',
    long_description =
      'Anal play covers everything from external touch to fingering, toys, fisting and penetration. The anus has no self-lubrication, so lubricant is not optional the way it can be elsewhere, and the tissue tears more easily than it hurts — which is why pain is a stop signal rather than something to work through.

Anything inserted needs a flared base or a retrievable handle: the rectum draws objects inward, and this is the single most common reason for an emergency-department visit related to sex. Anal sex carries the highest per-act HIV transmission risk of common sexual practices, so condoms, PrEP and undetectable viral load are the relevant tools depending on the situation.'
  where slug = 'anal-play'
    and long_description like '%essential to prioritize consent, communication, and safety%';

  ----------------------------------------------------- 2. categorise the orphans
  -- consent-violation, obedience and g-spot carry NO category and NO junction
  -- row. A revived row with a null category lands in tag_hygiene_stats'
  -- uncategorised count with nothing to explain it, and /tags/:slug renders the
  -- JUNCTION rather than the text column, so both have to be written.
  for v_cat, v_n in
    select c.id, 1 from public.tag_categories c where c.slug = 'consent-negotiation'
  loop
    update public.unified_tags set category_id = v_cat
     where slug = 'consent-violation' and category_id is null;
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    select t.id, v_cat, true from public.unified_tags t where t.slug = 'consent-violation'
    on conflict (tag_id, category_id) do update set is_primary = true;
  end loop;

  for v_cat, v_n in
    select c.id, 1 from public.tag_categories c where c.slug = 'bdsm-power-exchange'
  loop
    update public.unified_tags set category_id = v_cat
     where slug = 'obedience' and category_id is null;
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    select t.id, v_cat, true from public.unified_tags t where t.slug = 'obedience'
    on conflict (tag_id, category_id) do update set is_primary = true;
  end loop;

  for v_cat, v_n in
    select c.id, 1 from public.tag_categories c where c.slug = 'sexual-health'
  loop
    update public.unified_tags set category_id = v_cat
     where slug = 'g-spot' and category_id is null;
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    select t.id, v_cat, true from public.unified_tags t where t.slug = 'g-spot'
    on conflict (tag_id, category_id) do update set is_primary = true;
  end loop;

  --------------------------------------------------------------- 3. the revive
  update public.unified_tags set
    status              = 'active',
    deprecated_at       = null,
    deprecation_reason  = null,
    seo_indexable       = false,
    seo_deindex_reason  = 'migration:50500101100100-unpublished-revive',
    human_reviewed      = true,
    verification_status = 'reviewed',
    last_verified_at    = now()
  where slug in ('negotiation','consent-violation','flogging','whip','obedience','orgasm-control',
                 'predicament-bondage','play-piercing','mummification','hemp-rope','anal-play',
                 'pvc','g-spot')
    and status = 'deprecated';
  get diagnostics v_n = row_count;
  raise notice 'revive core kink vocabulary: % row(s) revived', v_n;

  ------------------------------------------------------------ 4. postconditions
  -- All thirteen must be active, and none may still carry a deprecation stamp.
  select count(*) into v_missed from public.unified_tags
   where slug in ('negotiation','consent-violation','flogging','whip','obedience','orgasm-control',
                  'predicament-bondage','play-piercing','mummification','hemp-rope','anal-play',
                  'pvc','g-spot')
     and (status <> 'active' or deprecated_at is not null or deprecation_reason is not null);
  if v_missed > 0 then
    raise exception 'revive core kink vocabulary: % row(s) did not revive cleanly', v_missed;
  end if;

  -- The eight wrong-sense bodies must be gone. This is the assertion that would
  -- have caught a revive that published the business sense of "negotiation".
  select count(*) into v_missed from public.unified_tags
   where (slug = 'negotiation'   and long_description  like 'Negotiation is a dialogue between two or more parties%')
      or (slug = 'whip'          and long_description  like '%commonly used on horses%')
      or (slug = 'whip'          and description       = 'Toys tag')
      or (slug = 'pvc'           and long_description  like '%Norwegian musical group%')
      or (slug = 'mummification' and short_description = 'Preserved dead body or animal')
      or (slug = 'hemp-rope'     and long_description  like '%sailing and landscaping%')
      or (slug = 'obedience'     and long_description  like 'Obedience is a form of social influence%')
      or (slug = 'flogging'      and long_description  like 'Flogging, also known as flagellation%')
      or (slug = 'anal-play'     and long_description  like '%essential to prioritize consent, communication, and safety%');
  if v_missed > 0 then
    raise exception 'revive core kink vocabulary: % row(s) would have republished the wrong sense', v_missed;
  end if;

  -- Nothing revived may be indexable, and everything must be human_reviewed or
  -- deprecate_unused_tags() culls it again on its next pass.
  select count(*) into v_missed from public.unified_tags
   where slug in ('negotiation','consent-violation','flogging','whip','obedience','orgasm-control',
                  'predicament-bondage','play-piercing','mummification','hemp-rope','anal-play',
                  'pvc','g-spot')
     and (seo_indexable is true or human_reviewed is not true);
  if v_missed > 0 then
    raise exception 'revive core kink vocabulary: % row(s) are indexable or unreviewed', v_missed;
  end if;

  -- Category and junction must both be set, because the page renders one and
  -- the search facet the other.
  select count(*) into v_missed from public.unified_tags t
   where t.slug in ('negotiation','consent-violation','flogging','whip','obedience','orgasm-control',
                    'predicament-bondage','play-piercing','mummification','hemp-rope','anal-play',
                    'pvc','g-spot')
     and (t.category_id is null
          or not exists (select 1 from public.tag_category_assignments a
                          where a.tag_id = t.id and a.is_primary));
  if v_missed > 0 then
    raise exception 'revive core kink vocabulary: % row(s) have no category or no primary junction', v_missed;
  end if;
end
$mig$;

insert into public.tag_sources (tag_id, source_type, claim_summary, is_public)
select t.id, 'editorial:general-knowledge',
       'Revived by migration 50500101100100 from the 2026-06-05 orphan audit, which deprecated glossary '
       || 'terms for having no entity assignments — a premise already recorded as false for definitions. '
       || 'Left unpublished (active, seo_indexable=false): the gap being closed is site search. Where the '
       || 'published prose described the generic or wrong sense it was rewritten by hand before the revive.',
       false
  from public.unified_tags t
 where t.slug in ('negotiation','consent-violation','flogging','whip','obedience','orgasm-control',
                  'predicament-bondage','play-piercing','mummification','hemp-rope','anal-play',
                  'pvc','g-spot')
   and not exists (select 1 from public.tag_sources s
                    where s.tag_id = t.id and s.claim_summary like '%migration 50500101100100%');
