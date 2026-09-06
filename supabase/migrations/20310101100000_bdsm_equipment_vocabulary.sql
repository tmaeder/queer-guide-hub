-- Create 25 BDSM equipment and practice terms, and revive 3.
--
-- SOURCE: the term LIST from Wikipedia's "List of BDSM equipment" and "Glossary
-- of BDSM". No prose is copied — every definition is written from
-- independently documented meaning.
--
-- THE DEDUPE RAN FIRST, against prod, and it changed the list:
--
--   ABDL          NOT created. Already reachable as an alias of
--                 `adult-baby-diaper-lover-abdl`.
--   pro-domme     NOT created. Already an active tag.
--   ball-stretcher DELIBERATELY EXCLUDED. It is deprecated AND the alias
--                 "Ballstretcher" routes to `cock-and-ball-torture`. Reviving
--                 it would put a live tag at a slug the alias table sends
--                 elsewhere — the trg_tag_reject_alias_shadow case. Whether
--                 that row should be revived or stay merged into CBT is a
--                 revive-vs-merge decision, and it is not swept in here.
--   anal-hook,    REVIVED, not created. All three are deprecated rows carrying
--   dungeon-      real bodies; a second row would orphan the original and its
--   monitor,      history. Revived by clearing status/deprecated_at/
--   sub-drop      deprecation_reason TOGETHER.
--
-- THE JUNCTION IS WRITTEN EXPLICITLY. sync_tag_category_assignment_after is
-- scoped AFTER UPDATE OF category_id and does not fire on INSERT, so a new row
-- gets category_id and the text mirror and files NOTHING in
-- tag_category_assignments — leaving is_adult false, because that flag is
-- derived by a trigger on the junction table. Measured on the previous batch:
-- `box-tie` came out adult=f with 0 junctions. Without the explicit insert this
-- would publish gear pages with no age gate.
--
-- SAFETY FACTS ARE SPECIFIC OR ABSENT, per TAG_STYLE_SYSTEM's ban on consent
-- boilerplate. Breath control carries the only irreversible risk in common
-- kink practice and says so; enema play, genitorture and the encasement gear
-- each name their own. Where a piece of gear carries no distinctive risk,
-- nothing is padded in.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:bdsm-equipment-vocabulary', true);

do $mig$
declare
  r record; v_bad int; v_cat uuid; v_made int := 0; v_rev int := 0;
begin
  create temp table _new (slug text primary key, name text, cat text, descr text, longd text) on commit drop;

  insert into _new (slug, name, cat, descr, longd) values
    ('armbinder','Armbinder','gear-aesthetics',
     'A sleeve that encloses both arms behind the back and laces them together from wrist to elbow.',
     'An armbinder is a single tapered sleeve, usually leather or latex, that draws the forearms together behind the back and closes with lacing or straps. It is far more restrictive than cuffs because the arms are held parallel along their whole length, which rotates the shoulders back and forward. That rotation is the risk: shoulders fatigue quickly in this position and the circulation to the hands is easily cut, so wear time is short and the hands are checked.'),
    ('sleepsack','Sleepsack','gear-aesthetics',
     'A full-body bag that encloses the occupant from neck to feet, usually latex or heavy leather.',
     'A sleepsack seals a person inside a single garment with internal sleeves, leaving only the head out. It produces near-total immobility and heavy sensory reduction, which is its appeal for bondage and encasement play. Heat is the practical limit rather than restraint: the material traps body heat and sweat with no way to shed either, so sessions are timed and the occupant is never left unattended.'),
    ('bondage-cuffs','Bondage Cuffs','gear-aesthetics',
     'Padded wrist or ankle cuffs with a D-ring, made to take load without cutting the way handcuffs do.',
     'Bondage cuffs spread pressure over a wide padded band and carry a ring for clipping to rope, chain or an anchor. They are the standard alternative to metal handcuffs, which concentrate force on a narrow line and cause nerve damage under any real load. Buckled and locking versions both exist; the release method matters more than the closure, because a cuff that cannot come off quickly is a problem in an emergency.'),
    ('bondage-harness','Bondage Harness','gear-aesthetics',
     'A body harness of straps or rope worn over the torso, providing anchor points or worn for its look.',
     'A bondage harness wraps the chest, waist and shoulders in a fixed pattern of straps with rings at the junctions. It serves two purposes that are worth keeping distinct: as a fashion piece worn over or under clothing, and as load-bearing rigging with attachment points for restraint or suspension. Only harnesses built and rated for weight belong in the second role.'),
    ('head-harness','Head Harness','gear-aesthetics',
     'A strap frame worn over the head and face, often holding a gag or providing rings for restraint.',
     'A head harness is a cage of straps around the skull and jaw, typically anchoring a gag and offering rings for a leash or tether. It removes the ability to push a gag out with the tongue, which is exactly why it is used and why it raises the stakes: speech is gone, so a non-verbal signal is agreed first. Anything holding the jaw shut is removed immediately if the wearer is nauseated.'),
    ('elbow-harness','Elbow Harness','gear-aesthetics',
     'Straps or rope drawing the elbows together behind the back, forcing the chest open.',
     'An elbow harness pulls the elbows toward each other behind the back, arching the chest forward. Very few people can bring their elbows fully together and forcing it strains the shoulder joints, so the distance is set by what the body already allows rather than by the hardware. It is often combined with an armbinder or box tie, which compounds the shoulder load.'),
    ('posture-collar','Posture Collar','gear-aesthetics',
     'A tall stiff collar that holds the chin up and prevents the head from turning or lowering.',
     'A posture collar is a wide, rigid band, usually boned leather, that runs from the collarbone to the jaw. It forces the head into a raised position and removes most neck movement, which produces both a physical discipline and a distinctive silhouette. Fit is the whole safety question: it must hold posture without pressing on the windpipe or the carotid arteries, and dizziness means it comes off.'),
    ('leash','Leash','gear-aesthetics',
     'A lead clipped to a collar, used to direct a partner and to make the ownership dynamic visible.',
     'A leash attaches to the ring of a collar and hands physical direction to whoever holds it. Its function is as much symbolic as practical — being led is a public, legible act of submission, which is why leashes appear at events as often as in scenes. It is never used to take load or to pull sharply: force applied through a collar goes straight to the neck.'),
    ('shackle','Shackle','gear-aesthetics',
     'A rigid metal restraint locking around the wrists or ankles, often joined by a fixed bar or chain.',
     'Shackles are steel cuffs closed with a lock or bolt, joined by chain or a rigid spreader. They are heavy, cold and unmistakably institutional, which is much of the appeal, and unlike rope they cannot be cut off in a hurry. A key is kept within reach of the person holding them, and a spare somewhere else — the failure mode for metal restraint is a lost key, not a slipped knot.'),
    ('gas-mask','Gas Mask','gear-aesthetics',
     'A sealed mask worn for sensory restriction and controlled breathing, often with a hose attachment.',
     'A gas mask covers the whole face and routes breathing through a filter or hose, muffling sound, restricting vision and making every breath audible. It sits at the meeting point of rubber fetish, sensory deprivation and breath play, and hose attachments allow airflow to be restricted deliberately. Anything that can limit air is a different order of risk from anything that cannot: the person holding the hose does not leave, and the mask comes off at the first sign of distress.'),
    ('nose-hook','Nose Hook','gear-aesthetics',
     'A hook or cord drawing the nostrils upward, used in humiliation and predicament play.',
     'A nose hook lifts the nostrils and holds them there, usually tied back to hair, a collar or an anchor. It produces a deliberately undignified appearance, which is the point — it belongs to humiliation play rather than to restraint. Tension is light: the septum tears easily and the position blocks nasal breathing, so it is not combined with a gag.'),
    ('parachute','Parachute','gear-aesthetics',
     'A conical weight harness that fastens above the testicles and hangs weights from them.',
     'A parachute is a small leather or steel cone that buckles around the top of the scrotum and carries chains for hanging weights. It applies steady downward tension rather than the squeeze of a clamp, so the sensation builds slowly and can be increased in measured steps. Weight is added gradually and the session is ended on numbness or colour change; circulation, not pain, is the limit.'),
    ('chastity-device','Chastity Device','gear-aesthetics',
     'The general term for lockable gear that prevents sexual access or release.',
     'Chastity device covers cages, tubes, belts and the hardware around them. It is the umbrella under which chastity belts and cock cages sit, and the practice built on it — denial, orgasm control, keyholding — is a power dynamic rather than a physical one. Fit and hygiene decide whether long-term wear is viable, and any numbness, swelling or discolouration means removal rather than adjustment.'),
    ('berkley-horse','Berkley Horse','gear-aesthetics',
     'A historic adjustable flogging frame, the ancestor of modern bondage furniture.',
     'The Berkley Horse was an adjustable padded frame built in 1828 for Theresa Berkley, a London dominatrix, to hold a client at any angle for flogging. It is the earliest well-documented piece of purpose-built BDSM furniture and the direct ancestor of the spanking bench and the St Andrew''s Cross. It survives mostly as a historical reference rather than a piece of gear in current use.'),
    ('spanking-horse','Spanking Horse','gear-aesthetics',
     'A padded bench or trestle that bends the occupant forward and presents the buttocks.',
     'A spanking horse holds a bottom face down over a padded beam with the hips raised, usually with straps for the wrists and ankles. Bending the body over a support takes the strain off the legs and makes a long impact scene sustainable, which a standing position does not. It is a staple of dungeon furniture alongside the cross and the bondage bed.'),
    ('queening-stool','Queening Stool','gear-aesthetics',
     'A low seat with an open top, built so one partner can sit on another''s face comfortably.',
     'A queening stool is a stool with a cut-out seat under which a person lies, so the seated partner takes their weight on the frame rather than on the person beneath. That is the whole purpose: it makes facesitting sustainable for far longer than unsupported. Breathing is still the constraint — the person underneath cannot speak, so a hand signal is agreed beforehand.'),
    ('smotherbox','Smotherbox','gear-aesthetics',
     'A box that immobilises the head beneath an open seat for extended facesitting.',
     'A smotherbox encloses the head with an opening above it, so the person inside cannot turn away and the seated partner controls all contact. It takes facesitting from a position into full restraint, and it removes the bottom''s ability to move themselves clear. Because airflow is entirely in someone else''s hands, it is never used with an unresponsive or intoxicated partner, and the box is never latched shut.'),
    ('breath-control-play','Breath Control Play','practices-play',
     'Restricting a partner''s breathing for erotic effect, and the riskiest practice in common kink.',
     'Breath control, or asphyxiophilia, covers anything that limits airflow — hands, hoods, masks, weight or position. It is the practice with the clearest documented fatality record and no reliable safety margin: unconsciousness arrives with little warning, the person losing it cannot signal, and pressure on the carotid arteries can stop a heart in seconds rather than minutes. Most organisations, including those otherwise permissive, class it as edge play that cannot be made safe — only less likely to kill. It is never done alone or with anyone intoxicated.'),
    ('breast-torture','Breast Torture','practices-play',
     'Intense sensation play directed at the breasts and nipples — clamps, weights, impact or binding.',
     'Breast torture, sometimes abbreviated TT for tit torture, covers clamping, weighting, slapping, binding and needle work on the breasts. Sensation builds and then changes character sharply on release, when blood returns to compressed tissue, so removal is often more intense than application. Clamps are timed rather than left indefinitely, and anything constricting the whole breast is watched for colour change.'),
    ('enema-play','Enema Play','practices-play',
     'Introducing liquid into the rectum as erotic play, for fullness, control or cleaning.',
     'Enema play covers everything from a small cleansing bulb before anal sex to large-volume retention as a control practice. The medical facts are the constraints: plain warm water only, since soap and additives damage the bowel lining, and volume matters because large or repeated enemas disturb electrolyte balance dangerously. It overlaps with klismaphilia, where the enema itself is the point rather than a preparation.'),
    ('erotic-spanking','Erotic Spanking','practices-play',
     'Striking the buttocks with a hand or implement for arousal, discipline or ritual.',
     'Erotic spanking is the most common entry point into impact play, needing no equipment and carrying the mildest risk profile of any impact practice. It runs from playful swats to sustained discipline scenes with paddles, straps and canes, and it often carries a disciplinary framing. Strikes stay on the buttocks, which are built to absorb them, and away from the tailbone and kidneys.'),
    ('genitorture','Genitorture','practices-play',
     'Intense sensation play directed at the genitals — the umbrella covering CBT and its counterparts.',
     'Genitorture covers clamping, weighting, binding, impact, electro and needle work applied to the genitals of any anatomy. Sensitivity is extreme and the tissue is unforgiving, so intensity is built slowly and specific injuries are the limit rather than the pain: testicular torsion, urethral tearing and lasting nerve damage all present as sudden severe pain rather than a gradual increase, and all mean stopping and seeking care.'),
    ('service-submission','Service Submission','practices-play',
     'Submission expressed through doing things for a partner rather than through sensation or pain.',
     'Service submission finds its satisfaction in usefulness — cooking, cleaning, driving, secretarial or protocol work, held to a standard someone else sets. It frequently involves no pain and no scene at all, which is why it is often invisible in a scene-centred picture of kink, and it can run continuously rather than in sessions. The dynamic depends on the standard being real: service that is never assessed stops functioning as submission.'),
    ('squick','Squick','slang-terminology',
     'A reaction of visceral disgust to a practice, distinct from judging it wrong.',
     'To be squicked is to find something viscerally repellent without making a moral claim about it. The word exists because kink communities needed a way to say "not for me, and I''d rather not watch" that does not shade into condemnation, and it is used as a limit in negotiation. It is a useful distinction: a squick describes the speaker, while a judgement describes the practice.'),
    ('mdlb','MDLB','bdsm-power-exchange',
     'Mommy Dom / little boy — an age-play dynamic pairing a nurturing dominant with a regressed partner.',
     'MDLB is the counterpart to DDlg, with a maternal dominant and a little who is usually male. Like the rest of the caregiver family it centres on nurture, rules and care rather than on pain, and for many participants the regression is about comfort rather than sex. The dynamic is between adults roleplaying age difference; that is what separates it from anything else it superficially resembles.');

  select count(*) into v_bad from _new n where not exists (select 1 from public.tag_categories c where c.slug = n.cat);
  if v_bad > 0 then raise exception 'equipment vocab: % row(s) name a missing category', v_bad; end if;

  select count(*) into v_bad from _new n join public.unified_tags t on t.slug = n.slug where t.status <> 'deprecated';
  if v_bad > 0 then raise exception 'equipment vocab: % slug(s) exist and are not deprecated', v_bad; end if;

  select count(*) into v_bad from _new n where exists (select 1 from public.tag_aliases a where a.alias_slug = n.slug);
  if v_bad > 0 then raise exception 'equipment vocab: % slug(s) are held as an alias of another tag', v_bad; end if;

  for r in select * from _new order by slug loop
    select c.id into v_cat from public.tag_categories c where c.slug = r.cat;
    insert into public.unified_tags (name, slug, description, long_description, category_id, category,
      entity_kind, status, seo_indexable, human_reviewed, verification_status, last_verified_at)
    values (r.name, r.slug, r.descr, r.longd, v_cat,
      (select name from public.tag_categories where id = v_cat), 'concept',
      'active', true, true, 'reviewed', now())
    on conflict (slug) do update set
      name = excluded.name, description = excluded.description,
      long_description = excluded.long_description, category_id = excluded.category_id,
      category = excluded.category, entity_kind = excluded.entity_kind,
      status = 'active', deprecated_at = null, deprecation_reason = null,
      seo_indexable = true, human_reviewed = true, verification_status = 'reviewed',
      last_verified_at = now();

    -- Required on INSERT: the AFTER trigger is scoped to UPDATE OF category_id.
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    select t.id, v_cat, true from public.unified_tags t where t.slug = r.slug
    on conflict (tag_id, category_id) do update set is_primary = true;
    v_made := v_made + 1;

    insert into public.tag_sources (tag_id, source_type, claim_summary, is_public)
    select t.id, 'editorial:general-knowledge',
           'Definition written by hand for migration 20310101100000 (BDSM equipment vocabulary).', false
      from public.unified_tags t where t.slug = r.slug
       and not exists (select 1 from public.tag_sources s where s.tag_id = t.id
                        and s.claim_summary like '%BDSM equipment vocabulary%');
  end loop;

  -- Revive three deprecated rows that already carry real bodies. ball-stretcher
  -- is deliberately NOT here: its slug is shadowed by an alias pointing at
  -- cock-and-ball-torture, so it needs a revive-vs-merge decision first.
  for r in select * from (values
      ('anal-hook','gear-aesthetics','A curved steel hook inserted anally, usually tethered to a collar or hair to hold position.'),
      ('dungeon-monitor','kink-community','A designated volunteer who watches play at an event and intervenes when a scene goes wrong.'),
      ('sub-drop','bdsm-power-exchange','The emotional and physical crash a bottom can experience after a scene, hours or days later.')
    ) as v(slug, cat, descr) loop
    select c.id into v_cat from public.tag_categories c where c.slug = r.cat;
    update public.unified_tags t set
      status = 'active', deprecated_at = null, deprecation_reason = null,
      category_id = v_cat, description = r.descr,
      seo_indexable = true, human_reviewed = true, verification_status = 'reviewed',
      last_verified_at = now()
    where t.slug = r.slug and t.status = 'deprecated';
    if found then
      insert into public.tag_category_assignments (tag_id, category_id, is_primary)
      select t.id, v_cat, true from public.unified_tags t where t.slug = r.slug
      on conflict (tag_id, category_id) do update set is_primary = true;
      delete from public.tag_category_assignments a using public.unified_tags t
       where t.slug = r.slug and a.tag_id = t.id and a.category_id <> v_cat;
      v_rev := v_rev + 1;
    end if;
  end loop;

  -- ── Assertions ───────────────────────────────────────────────────────────
  if v_made <> 25 then raise exception 'equipment vocab: created % rows, expected 25', v_made; end if;

  select count(*) into v_bad from _new n join public.unified_tags t on t.slug = n.slug
   where t.status <> 'active'
      or coalesce(length(btrim(t.description)),0) < 30
      or coalesce(length(btrim(t.long_description)),0) < 120
      or t.seo_indexable is not true or t.human_reviewed is not true
      or t.verification_status <> 'reviewed';
  if v_bad <> 0 then raise exception 'equipment vocab: % row(s) missing, thin or unpublished', v_bad; end if;

  -- Everything here is filed under a Sex & Kink stop or Slang & Language.
  -- `squick` is the one row that is NOT expected to be 18+: it is a word about
  -- reactions, not a practice, and Slang & Language is not in the adult set.
  select count(*) into v_bad from _new n join public.unified_tags t on t.slug = n.slug
   where n.slug <> 'squick' and t.is_adult is not true;
  if v_bad <> 0 then raise exception 'equipment vocab: % row(s) came out NOT adult-gated', v_bad; end if;

  select count(*) into v_bad from (
    select 1 from _new n join public.unified_tags t on t.slug = n.slug
     group by lower(btrim(t.description)) having count(*) > 1) d;
  if v_bad <> 0 then raise exception 'equipment vocab: % duplicate description(s)', v_bad; end if;

  select count(*) into v_bad from public.unified_tags
   where slug in ('anal-hook','dungeon-monitor','sub-drop')
     and (status <> 'active' or deprecated_at is not null);
  if v_bad <> 0 then raise exception 'equipment vocab: % revive(s) did not take', v_bad; end if;

  raise notice 'equipment vocab: % created, % revived', v_made, v_rev;
end
$mig$;
