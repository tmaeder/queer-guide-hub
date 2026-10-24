-- Excel review queue 2026-10-23, batch 13: the unused "Verify facts / meaning" rows.
-- Decisions taken by a person on 2026-10-24.
--
--   * 366 tags are deprecated. Every one is active with usage_count 0 and no
--     assignments, measured on prod before writing this file. Four groups:
--       - 318 whose meaning was inferred from the word (kink roles, personas, generic nouns);
--       - 23 the reviewer found no attested meaning or scope for (ralf, kiwi, tips ...);
--       - 19 person tags nobody could identify or link to LGBTQ+ topics;
--       - 11 place or event names whose referent is unknown (olympia, stable ...).
--     The deprecation reason names the group. Deprecation is reversible.
--   * Tags that another tag is merged into are skipped, because deprecating a merge target
--     leaves a redirect to a retired page: anthropologist, attila-horbiger, clown, conductor,
--     jan-mikolasek. Their rows stay pending.
--   * devourer is kept: its prose was repaired in an earlier pass and
--     e2e/tags-wrong-entity.spec.ts expects /tags/devourer to resolve. Its row is closed.
--   * A tag that gained usage or an assignment after the measurement is left alone, and
--     its row stays pending.
--
-- About 140 of these terms appear on the Kinktionary term list. That list attests the
-- word exists; it does not supply a definition this site may use (non-commercial licence),
-- so the definitions on these rows were still written without a source.

select set_config('app.actor', 'migration:99991792861460_tag_review_batch13_verify_unused', true);

create temp table _b13_dep on commit drop as
select t.id, t.slug, r.why
from (
select unnest(array[
  'actirasty', 'adventurer', 'agi', 'alien', 'alpha-brat', 'alpha-woman', 'altersex', 'anaconda',
  'analytikink', 'ancient-symbol', 'angel-food', 'animal-pronouns', 'anonymous-donors', 'antagonizer', 'anthropologist', 'aphephilia',
  'archangel', 'aylonit', 'babyghoul', 'bangers', 'barbarella', 'beach-bitch', 'bellyriding', 'bite-risk',
  'bizarre', 'blackbooting', 'blue-booty-buddy', 'bobcat', 'bonded', 'booger', 'book-daddy', 'braces',
  'bratty-switch', 'breath-control-training', 'bridge', 'buck', 'bucket-boy', 'bushmaxxing', 'cameras', 'cardiophilia',
  'cashmere-closet', 'cell-popping', 'centaur', 'chain-mouse', 'chaos-creature', 'chaos-cutie', 'chaos-princess', 'chaos-puppy',
  'charge-master-charge-mistress', 'chastity-plug', 'chem-fuckup', 'chest-compression', 'christian-scheuss', 'cigarette-top', 'circus-master', 'circus-mistress',
  'clan', 'cleanup', 'clock-tea', 'clown', 'clown-handler', 'club-hosting', 'cock-box', 'conditional-sub',
  'connection-whore', 'consent-centered-storytelling', 'couples-domination', 'cousin', 'cover', 'cryptid', 'cuddle-switch', 'cuddly-mogwai',
  'culturally-queer', 'cumjob', 'cumsicle', 'cupcake', 'demiflexible', 'demon-daddy', 'demonette', 'derogatory-term-for-non-lgbtq-people',
  'dickdash', 'dirty', 'divine', 'divine-intervention', 'doe-stag', 'dolphin', 'donald-duck', 'drag-kings-of-spoken-word',
  'duchess', 'ebony', 'edge-bottom', 'edge-switch', 'edge-top', 'elder-brat', 'emotional-support-sub', 'ems-pads',
  'encourager', 'energy-bottom', 'energy-switch', 'energy-top', 'eyes-wide-shut', 'face-crack', 'fairy-kink-daddy', 'fairy-kink-mother',
  'fanny-bellhop', 'fantasy-exploration', 'feral-princess-feral-prince', 'fire-fairy', 'firefly', 'flock', 'food-daddy', 'food-mommy',
  'foot-bottom', 'footgirl', 'footlady', 'foster-daddy', 'foster-mommy', 'fotboth', 'fuckbox', 'fweeb',
  'gamma', 'genie', 'giggle-bottom', 'giggle-masochist', 'giraffe', 'girl-scout', 'glass-licking-fetish', 'goblin-king',
  'guardian', 'hairline-plucking', 'halfling', 'hand-puppet', 'hand-rolls', 'harmony-building', 'hedgehog', 'helper',
  'henchman', 'high-five', 'hinge-identity', 'honesty-training', 'hothusband', 'hubull', 'hyena', 'ikapiri',
  'imp', 'in-sisters', 'infusions', 'inspire', 'intellectual-sadomasochist', 'jankha', 'jarl', 'joes-special',
  'king', 'knight', 'ladybug', 'lash-bearer', 'latex-family', 'latex-princess', 'leather-cat', 'little-brother',
  'little-goddess', 'little-lamb', 'little-sister', 'lone-wolf', 'long-waits', 'looplok', 'lovedrug', 'ludophilia',
  'm-refers-to-a-marijuana-joint', 'macaron', 'maiden', 'mania', 'marionette', 'meatbag', 'meerkat', 'mermaid',
  'metasexuality', 'middle-of-vondelpark', 'milkmaid', 'minotaur', 'mister', 'mistrix', 'monarch', 'mouse',
  'mudra', 'muppet', 'muse', 'mutha', 'nala', 'nipple-play-wrestling', 'theno-touch-wallflowers', 'nudist-theater',
  'nurturing-training', 'nymphic-domme', 'offering', 'oiketis', 'omega', 'one-up', 'open-areas', 'orphan',
  'outstroking', 'padding', 'panda', 'patience-training', 'patron-saint', 'pearls', 'penis-shrinking', 'pep-talk',
  'perpetrator', 'pest', 'petitioning', 'pixie', 'plapgasm', 'play-area', 'pleasure-sadomasochist', 'praise-princess',
  'priestess', 'primal-mommy', 'primal-sensualist', 'prince', 'princette', 'priority-access', 'psychedelic-safari', 'public-reminder',
  'raccoon', 'rat', 'reasonable-rates', 'responsibility-training', 'reverse-buck-blowjob', 'right-to-a-free-and-fair-world', 'rimming-kit', 'rope-bat',
  'rope-gremlin', 'rope-kitten', 'rope-menace', 'rope-monkey', 'rope-princess', 'rope-pup', 'sacrificial-lamb', 'sailor',
  'sappho-daddy-o', 'satyress', 'satyric-dominant', 'savage', 'schooners', 'screen-in-north-america', 'secondhand-sadist', 'sensual-prey',
  'serve-on-tiptoe', 'service-brat', 'service-cat', 'serving', 'shade-of-my-heart', 'shadow-daddy', 'shock-daddy-shock-mommy', 'shoe-stealing',
  'sibling', 'sigma', 'silicone-clothing', 'siren', 'sister-slut', 'sitter', 'sketchy', 'skunkseeker',
  'smart-ass-sadist', 'smart-ass-sadomasochist', 'snatch', 'snatch-the-trophy', 'snow-bunny', 'socialization-training', 'soft-bottom', 'soft-goddess',
  'soft-masochist', 'solo-player', 'southbank', 'spucking', 'squire', 'squishy-toy', 'stability-building', 'stag',
  'stay-at-home-dominant', 'steer', 'step-daddy', 'storytime', 'stray', 'submissive-sister', 'sufferer', 'taboo-themes',
  'tankhouse', 'the-good-vibe-tribe', 'thing', 'tomcat', 'trade-bait', 'tradhusband', 'train-tracks', 'transine',
  'translation', 'trash', 'tribe', 'trifecta', 'trinket-goblin', 'twin', 'vaccinophilia', 'vampire-bait',
  'vampire-concubine', 'versandrogyne', 'vivisector', 'volt-vixen', 'waif', 'warlord', 'wench', 'werk-it-out',
  'whipcasso', 'wireplay', 'wood-nymph', 'worship-and-devotion', 'wrathsponge', 'zipper-club'
]) as slug, 'unused, and its meaning was inferred rather than sourced' as why
union all
select unnest(array[
  'ashtime', 'conductor', 'crafter', 'cuckcake', 'eudaimonist', 'f-entropy', 'food-buddy', 'harry',
  'jorn-kubicki', 'kiwi', 'lakin-on', 'mini-mac', 'plecostomus', 'ralf', 'reynard', 'ringberry',
  'scratching-post', 'scrosexuality', 'seraphim', 'shuck', 'the-power-of-three', 'tips', 'zombie-dust'
]) as slug, 'unused; the reviewer found no attested meaning or scope' as why
union all
select unnest(array[
  'attila-horbiger', 'barbel-schwarz', 'ben-hohn', 'dominik-schmitt', 'eric-g-hattenschwiler', 'eva-medusa-guhne', 'gustav-peter-wohler', 'jan-mikolasek',
  'jorg-b-sauer', 'julia-grafner', 'katja-burkle', 'klaus-maria-brandauer', 'lars-steinhofel', 'marie-ronnebeck', 'nina-kreutzmann-jorgensen', 'noris-diaz-perez',
  'patrick-guldenberg', 'reinhardt-brandstatter', 'stonewall-dykes'
]) as slug, 'unused person tag with no identified person or LGBTQ+ link' as why
union all
select unnest(array[
  'berlin-i-love-you', 'de-la-concorde', 'heart-of-london', 'madison', 'olympia', 'one-bar-prison', 'over-the-bridge-to-pimpleton', 'stable',
  'turn-the-party', 'yard-boy', 'zanie'
]) as slug, 'unused place or event name with an unknown referent' as why
) r
join public.unified_tags t on t.slug = r.slug
where t.status = 'active'
  and coalesce(t.usage_count, 0) = 0
  and not exists (select 1 from public.unified_tag_assignments a where a.tag_id = t.id)
  and not exists (select 1 from public.unified_tags m where m.merged_into_id = t.id);

update public.unified_tags t
   set status = 'deprecated', deprecated_at = now(), seo_indexable = false,
       deprecation_reason = 'Review queue 2026-10-23: ' || d.why
  from _b13_dep d where t.id = d.id;

create temp table _b13_close (id uuid primary key, resolution text) on commit drop;
insert into _b13_close select id, 'deprecated: ' || why from _b13_dep;
insert into _b13_close
select t.id, 'kept: repaired prose, page asserted by e2e/tags-wrong-entity.spec.ts'
  from public.unified_tags t where t.slug = 'devourer' and t.status = 'active'
on conflict do nothing;

update public.tag_suggestions g
   set status = 'rejected', reviewed_at = now(),
       metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
         'resolution', c.resolution, 'resolved_by', 'migration:99991792861460')
  from _b13_close c
 where g.entity_id = c.id and g.entity_type = 'tag'
   and g.source = 'excel_review_2026_10_23' and g.status = 'pending'
   and g.metadata->>'review_type' = 'Verify facts / meaning';

do $verify$
declare v_dep int; v_bad int; v_idx int; v_open int; v_targets int;
begin
  select count(*) into v_dep from _b13_dep;
  if v_dep < 300 then
    raise exception 'batch13: only % tags qualified for deprecation; expected about 366', v_dep;
  end if;

  select count(*) into v_bad from _b13_dep d join public.unified_tags t on t.id = d.id
   where t.status <> 'deprecated';
  if v_bad <> 0 then raise exception 'batch13: % tags were not deprecated', v_bad; end if;

  select count(*) into v_idx from _b13_dep d join public.unified_tags t on t.id = d.id
   where t.seo_indexable;
  if v_idx <> 0 then raise exception 'batch13: % deprecated tags are still indexable', v_idx; end if;

  select count(*) into v_targets from _b13_dep d
   where exists (select 1 from public.unified_tags m where m.merged_into_id = d.id);
  if v_targets <> 0 then raise exception 'batch13: % deprecated tags are merge targets', v_targets; end if;

  select count(*) into v_open from _b13_close c join public.tag_suggestions g on g.entity_id = c.id
   where g.entity_type = 'tag' and g.source = 'excel_review_2026_10_23' and g.status = 'pending'
     and g.metadata->>'review_type' = 'Verify facts / meaning';
  if v_open <> 0 then raise exception 'batch13: % closed rows are still pending', v_open; end if;

  if not exists (select 1 from public.unified_tags where slug = 'devourer' and status = 'active') then
    raise exception 'batch13: devourer must stay active';
  end if;
end
$verify$;
