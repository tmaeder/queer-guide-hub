-- Create 135 glossary terms that exist in the Kinktionary index and in no
-- row of `unified_tags` under any status.
--
-- GENERATED from scripts/data-quality/kinktionary-new-term-definitions.mjs by
-- scripts/data-quality/generate-new-term-migration.mjs. Edit the definitions
-- there and regenerate; do not hand-edit the VALUES below, or the two will
-- disagree about what was published.
--
-- 0 written from independently documented meaning, 135 inferred from the term's name.
--
-- NOTHING HERE IS PUBLISHED. Every row is created with seo_indexable=false,
-- human_reviewed=false and verification_status='unverified': usable for
-- tagging, browsing and site search, invisible to crawlers until a human
-- approves it. A machine-written definition of an identity or role term is a
-- draft, and this program spent its life retracting prose that reached
-- production as though it were not — 44 chimera pages, then five wrong-sense
-- revivals created while cleaning them up.
--
-- LICENCE. The Kinktionary is licensed NON-COMMERCIAL and queer.guide is
-- commercial, so NOT ONE WORD OF THEIR PROSE IS COPIED OR ADAPTED. Only their
-- TERM LIST was used, as a signal for which entries are absent. Every
-- definition below is original text. For the terms marked
-- `editorial` with source_id `inferred-from-name`, the Kinktionary is the only place the term is
-- attested at all — so rather than reproduce their definition, the row records
-- that its meaning is a reasoned guess and waits for a human who knows the
-- vocabulary.
--
-- Provenance is written to `tag_sources` with is_public=false, so it is
-- available to reviewers and never rendered on the page.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:kinktionary-new-terms', true);

do $mig$
declare
  r        record;
  v_bad    int;
  v_made   int := 0;
  v_src    int := 0;
  v_revive int := 0;
begin
  create temp table _new (
    slug text primary key, name text, cat text, kind text,
    adult boolean, sensitive boolean, sourced boolean,
    descr text, longd text
  ) on commit drop;

  insert into _new (slug, name, cat, kind, adult, sensitive, sourced, descr, longd) values
    ('pivotgender', 'Pivotgender', 'gender-identity', 'concept', false, false, false,
     'A gender identity that turns around a fixed anchor while the rest shifts.',
     'Pivotgender appears to describe a gender that has one constant reference point with the remainder moving around it, so the person is neither wholly static nor wholly fluid. The reading is drawn from the word itself; the term is not attested outside community glossaries and the definition is a reasoned guess pending review by someone who uses it.'),
    ('almondsexual', 'Almondsexual', 'sexual-orientation', 'concept', false, false, false,
     'An orientation microlabel whose meaning is not attested outside community glossaries.',
     'Almondsexual is listed as an orientation microlabel but has no documented definition anywhere it can be checked, and the name gives no reliable clue to what it describes. Rather than invent a meaning, this entry records that the term is in use and that its definition is unknown until someone who uses it supplies one.'),
    ('animesexual', 'Animesexual', 'sexual-orientation', 'concept', false, false, false,
     'Attraction directed at anime characters rather than at real people.',
     'Animesexual reads as a label for people whose sexual attraction is directed at animated characters, placing it near fictosexual. The reading follows from the name; the term is not documented outside community glossaries, so this definition is a reasoned guess.'),
    ('cratosexual', 'Cratosexual', 'sexual-orientation', 'concept', false, false, false,
     'Attraction to power or authority itself rather than to a gender.',
     'From the Greek kratos, power. The name points to attraction organised around power, strength or authority rather than around a partner''s gender, which would make it an orientation-shaped statement of what is more often described as a D/s preference. The reading is inferred from the root and awaits confirmation.'),
    ('demiflexible', 'Demiflexible', 'sexual-orientation', 'concept', false, false, false,
     'Mostly attracted to one gender, with occasional flexibility toward others.',
     'Demiflexible combines the demi- prefix with flexible, suggesting someone whose attraction sits mainly with one gender but is not closed to others. It sits near heteroflexible and homoflexible. The reading is drawn from the name and is not independently documented.'),
    ('kinksexual', 'Kinksexual', 'sexual-orientation', 'concept', false, false, false,
     'Someone for whom kink, not gender, is the axis their attraction runs along.',
     'Kinksexual reads as a label for people whose sexual attraction is organised around kink rather than around a partner''s gender or body, closer to how an orientation works than to a preference. Some people do describe kink identity in exactly those terms, and the label appears to name that. Inferred from the term; not otherwise documented.'),
    ('mutosexual', 'Mutosexual', 'sexual-orientation', 'concept', false, false, false,
     'An orientation microlabel whose meaning is not attested outside community glossaries.',
     'Mutosexual is listed as an orientation microlabel. The Latin root muto-, meaning change, suggests something about shifting attraction, but that is a guess from etymology alone and could equally be wrong. The term is not documented anywhere it can be checked, and it is recorded here without a confident definition rather than with an invented one.'),
    ('myrsexual', 'Myrsexual', 'sexual-orientation', 'concept', false, false, false,
     'Attraction experienced as many distinct orientations at once.',
     'Myrsexual appears to derive from myriad and to describe someone who holds several orientations simultaneously rather than one. It belongs to the same family of multi-orientation microlabels as polysexual and omnisexual, though it is not interchangeable with either. Inferred from the name.'),
    ('sadosexual', 'Sadosexual', 'sexual-orientation', 'concept', true, true, false,
     'Someone whose sexuality is organised around inflicting pain rather than around gender.',
     'Sadosexual reads as a label for people for whom sadism is not a preference layered on top of a sexuality but is the sexuality itself. Framing it as an orientation is a claim about how central it is, not a clinical statement. The reading is inferred from the name; consent and negotiation apply exactly as they do to any sadistic practice.'),
    ('scrosexuality', 'Scrosexuality', 'sexual-orientation', 'concept', false, false, false,
     'An orientation microlabel whose meaning is not attested outside community glossaries.',
     'Scrosexuality is listed as an orientation but has no documented definition that can be checked and no root that reliably indicates its meaning. It is recorded so the term exists in the glossary, with its definition left open rather than guessed.'),
    ('platoniromantic', 'Platoniromantic', 'sexual-orientation', 'concept', false, false, false,
     'Someone who cannot cleanly separate platonic from romantic attraction.',
     'Platoniromantic names an experience in which the line between deep friendship and romantic feeling does not resolve: the attraction is real but does not sort into either category. It sits alongside quoiromantic, which makes a similar claim about the usefulness of the romantic and platonic distinction. Inferred from the name.'),
    ('clan', 'Clan', 'relationship-structures', 'concept', false, false, false,
     'A large chosen-family group organised around shared kink or community identity.',
     'Clan appears to name a chosen-family unit larger and looser than a household or polycule, bound by shared identity, leadership or scene rather than by a defined set of relationships between every member. The reading follows from ordinary usage of the word; the specific community sense is not otherwise documented.'),
    ('primal-mate', 'Primal Mate', 'bdsm-power-exchange', 'concept', true, false, false,
     'A committed partner within primal play, framed in animal-pairing terms.',
     'Primal mate reads as the ongoing-partner role inside primal play, where interaction is instinctive and non-verbal rather than protocol-driven, and the relationship is framed in the language of mating rather than of ownership or service. Inferred from the term; the framing is a mode of play between consenting adults, not a claim about how humans work.'),
    ('sister-slut', 'Sister Slut', 'bdsm-power-exchange', 'concept', true, true, false,
     'A submissive who shares a service or sexual role with others as siblings.',
     'Sister slut appears to name a submissive who is one of several serving the same dominant and who relates to the others as siblings rather than as rivals. It sits alongside the sibling framing already common in leather families. Inferred from the name.'),
    ('switchuationship', 'Switchuationship', 'relationship-structures', 'concept', false, false, false,
     'An undefined relationship between two switches where roles are never settled.',
     'A portmanteau of switch and situationship: a connection in which neither the relationship status nor who tops is ever pinned down, and both keep moving. The reading follows from the construction; the term is playful and is not documented outside community usage.'),
    ('stray', 'Stray', 'bdsm-power-exchange', 'concept', false, false, false,
     'A pet-play role for someone unclaimed and not attached to a handler.',
     'Stray reads as a pet-play identity for someone who has no owner or handler, independent by choice or simply not yet claimed, in contrast to a pet in a settled dynamic. The reading follows from the word and from how pet-play vocabulary otherwise works. Not independently documented.'),
    ('latex-family', 'Latex Family', 'gear-aesthetics', 'concept', true, false, false,
     'A chosen-family group organised around shared latex fetishism.',
     'Latex family appears to name a chosen-family unit whose shared ground is latex rather than leather: the same structure as a leather family, which mentors and confers standing within its own tradition, transposed onto a different material culture. Inferred from the term.'),
    ('aftercare-specialist', 'Aftercare Specialist', 'bdsm-power-exchange', 'concept', false, false, false,
     'Someone whose role in a scene or a space is looking after people afterwards.',
     'Aftercare specialist reads as a role for someone who takes responsibility for the come-down rather than for the scene itself: warmth, food, water, quiet company and a check that the other person is landing safely. At play parties the function often exists informally, and naming it makes it something a person can offer rather than something everyone assumes someone else is doing. Inferred from the term.'),
    ('alpha-brat', 'Alpha Brat', 'bdsm-power-exchange', 'concept', false, false, false,
     'A brat who leads the other brats rather than only resisting a dominant.',
     'Alpha brat reads as a brat with standing among other brats, setting the tone for the mischief rather than acting alone. Bratting is resistance played for the pleasure of being overcome; an alpha brat is the one who organises it. Inferred from the term.'),
    ('anaconda', 'Anaconda', 'bdsm-power-exchange', 'concept', true, false, false,
     'A rope top whose style is slow, constricting full-body binding.',
     'Anaconda reads as a rope role named for the snake: binding that closes gradually and tightens around the whole body rather than fixing a limb to a point. The reading follows from the name and from rope vocabulary, and the term is not otherwise documented. Constrictive full-body ties carry real circulation and breathing risk and are not a beginner practice.'),
    ('antagonizer', 'Antagonizer', 'bdsm-power-exchange', 'concept', false, false, false,
     'Someone who provokes their partner deliberately as their contribution to a scene.',
     'Antagonizer reads as a role built on provocation: winding a partner up on purpose so that the reaction is the point. It overlaps with bratting but is framed from the provoker''s side rather than the resister''s, and it can be played from either end of a dynamic. Inferred from the term.'),
    ('anthropologist', 'Anthropologist', 'kink-community', 'concept', false, false, false,
     'Someone whose engagement with a scene is observation and study rather than play.',
     'Anthropologist reads as a self-deprecating label for someone present in kink spaces mainly to watch, learn and understand how the community works rather than to play. It is close to how many newcomers describe their first year, and unlike voyeurism it is not framed as erotic. Inferred from the term.'),
    ('alpha-woman', 'Alpha Woman', 'bdsm-power-exchange', 'concept', false, false, false,
     'A woman who takes the leading role in a dynamic as a matter of identity.',
     'Alpha woman reads as a dominant identity for women framed around natural leadership rather than around technique or protocol. It sits near matriarch and femdom without being interchangeable with either: femdom names the direction of the power, alpha woman names the disposition behind it. Inferred from the term.'),
    ('anal-whore', 'Anal Whore', 'bdsm-power-exchange', 'concept', true, true, false,
     'A self-applied role for someone who wants anal sex enthusiastically and often.',
     'Anal whore is a self-applied role centred on receptive anal sex, using the reclaimed vocabulary of sluttiness that runs through much kink self-description. It is a term of enthusiasm from the inside, not a description to apply to anyone else. Inferred from the term.'),
    ('auralist', 'Auralist', 'fetishes-interests', 'concept', true, false, false,
     'Someone for whom sound and voice are the primary erotic channel.',
     'Auralist reads as a label for people whose arousal runs through hearing first: voice, breath, spoken instruction, audio erotica or the sounds a partner makes. It overlaps with narratophilia, which is specifically about erotic language rather than sound in general. Inferred from the term.'),
    ('bite-risk', 'Bite Risk', 'bdsm-power-exchange', 'concept', false, false, false,
     'A warning-as-identity for a primal or pet-play partner who bites.',
     'Bite risk reads as a half-joking self-label warning that the person bites when played with, worn by primal and pet-play types where biting is part of the vocabulary. Like most such labels it functions as disclosure: it tells a prospective partner what to negotiate about. Inferred from the term.'),
    ('bratty-little', 'Bratty Little', 'bdsm-power-exchange', 'concept', true, false, false,
     'Someone whose little headspace is defiant rather than compliant.',
     'Bratty little combines age-play regression with bratting: the little role is present, but expressed as testing limits and refusing instructions rather than as compliance and comfort-seeking. Both are adult headspaces. Inferred from the composed term.'),
    ('bratty-switch', 'Bratty Switch', 'bdsm-power-exchange', 'concept', false, false, false,
     'A switch who brings bratting to both ends of the dynamic.',
     'A bratty switch takes both dominant and submissive roles and brings the same provoking, playful resistance to each — bratting up as a submissive and being deliberately winding as a dominant. Inferred from the composed term.'),
    ('chaos-creature', 'Chaos Creature', 'bdsm-power-exchange', 'concept', false, false, false,
     'A self-label for someone whose play is unpredictable and feral rather than structured.',
     'Chaos creature reads as a self-description for someone who does not run to protocol: play is instinctive, disorderly and hard to predict, and that is the appeal rather than a failure of discipline. It is one of a family of chaos-prefixed self-labels used more for flavour than for structure. Inferred from the term.'),
    ('chaos-cutie', 'Chaos Cutie', 'bdsm-power-exchange', 'concept', false, false, false,
     'A softer variant of the chaos self-label: disruptive, but sweet with it.',
     'Chaos cutie pairs disorder with cuteness — someone who causes trouble and is forgiven for it, which is itself the dynamic. It belongs to the same informal family as chaos creature and chaos princess. Inferred from the term.'),
    ('charge-master-charge-mistress', 'Charge Master / Charge Mistress', 'bdsm-power-exchange', 'concept', true, false, false,
     'A dominant role in electrical play, named for the charge rather than the implement.',
     'Charge master and charge mistress read as gendered forms of a dominant role specialising in electrical play — violet wands, TENS units and similar. Electrical play has hard physical limits: current is kept below the waist and away from the chest, and never used on anyone with a pacemaker or a heart condition. Inferred from the term; the safety constraints are not.'),
    ('chaos-princess', 'Chaos Princess', 'bdsm-power-exchange', 'concept', false, false, false,
     'A princess-role variant whose demands are deliberately disruptive.',
     'Chaos princess combines the princess role, where being served and indulged is the point, with deliberate disorder — entitled and unpredictable at once. Inferred from the composed term.'),
    ('cigarette-top', 'Cigarette Top', 'bdsm-power-exchange', 'concept', true, true, false,
     'A dominant role centred on smoking, ash and cigarette play.',
     'Cigarette top reads as the dominant side of smoking fetishism, where the cigarette is the focus of the scene through smoke, ash, and in some practice deliberate burns. Burn play causes real injury and infection risk and is at the far edge of edge play; the smoking aesthetic and actual burns are separate practices with very different consequences. Inferred from the term.'),
    ('clown-handler', 'Clown Handler', 'bdsm-power-exchange', 'concept', false, false, false,
     'The counterpart role to a clown persona in fool or circus-themed play.',
     'Clown handler reads as the managing role opposite a clown persona, in the same relational shape as a pet and their handler. Clown and harlequin personas turn foolishness and performance into a submissive or trickster role, and the handler is the one who directs it. Inferred from the term.'),
    ('cock-enthusiast', 'Cock Enthusiast', 'bdsm-power-exchange', 'concept', true, false, false,
     'A cheerful self-label for someone with a pronounced enthusiasm for penises.',
     'Cock enthusiast reads as a light self-description rather than a role in a dynamic: it states a preference plainly and with humour, and says nothing about whether the person is dominant, submissive or neither. Inferred from the term.'),
    ('conditional-sub', 'Conditional Sub', 'bdsm-power-exchange', 'concept', false, false, false,
     'Someone who submits only to specific people or under specific conditions.',
     'Conditional sub reads as a submissive whose submission is not a general disposition but is granted under stated conditions — to a particular person, in a particular context, or once particular terms are met. Naming it forestalls the assumption that a submissive submits to anyone who asks. Inferred from the term.'),
    ('connection-whore', 'Connection Whore', 'bdsm-power-exchange', 'concept', true, false, false,
     'A self-label for someone who plays for intimacy rather than for sensation.',
     'Connection whore reads as a self-description for someone whose appetite is for the closeness a scene produces rather than for the technique or the sensation in it: they would rather have a slow scene with someone they are connected to than an impressive one with a stranger. Inferred from the term.'),
    ('cuddlee', 'Cuddlee', 'bdsm-power-exchange', 'concept', false, false, false,
     'The receiving side of a cuddling dynamic.',
     'Cuddlee names the person being held in a cuddling dynamic, as against the cuddler doing the holding. The pairing formalises non-sexual touch as something with roles and preferences, which matters for people who want physical closeness explicitly separated from sex. Inferred from the term.'),
    ('cuddle-switch', 'Cuddle Switch', 'bdsm-power-exchange', 'concept', false, false, false,
     'Someone who both gives and receives in a cuddling dynamic.',
     'Cuddle switch is the switch position of the cuddler and cuddlee pair: comfortable being held and holding, and moving between the two within one session or across a relationship. Inferred from the composed term.'),
    ('denied-slave', 'Denied Slave', 'bdsm-power-exchange', 'concept', true, false, false,
     'A slave role whose defining condition is long-term orgasm denial.',
     'Denied slave reads as a total-power-exchange role in which the submissive''s orgasm is permanently controlled and mostly withheld, so denial is the ongoing state rather than an occasional scene. Long-term denial and chastity need attention to hygiene, circulation and mental state, and a stated way out. Inferred from the term.'),
    ('dirty-girl', 'Dirty Girl', 'bdsm-power-exchange', 'concept', true, true, false,
     'A feminine self-label built on reclaiming sexual shame as pleasure.',
     'Dirty girl reads as a self-applied role that takes the language used to shame women for wanting sex and wears it as appetite instead. Like most reclaimed vocabulary it works from the inside and not as a description applied by others. Inferred from the term.'),
    ('divine', 'Divine', 'bdsm-power-exchange', 'concept', false, false, false,
     'A dominant role framed as an object of worship rather than a commander.',
     'Divine reads as a dominant identity built on reverence: the submissive''s posture is devotional and the dominant''s authority comes from being adored rather than from giving orders. It sits alongside goddess and deity roles and pairs naturally with worship-style service. Inferred from the term.'),
    ('elder-brat', 'Elder Brat', 'bdsm-power-exchange', 'concept', false, false, false,
     'A long-standing brat with seniority in the community.',
     'Elder brat reads as a title of affectionate seniority: someone who has been bratting for years, knows the community and its history, and mentors newer brats without giving up the role. Inferred from the term.'),
    ('electro-slut', 'Electro Slut', 'bdsm-power-exchange', 'concept', true, false, false,
     'An enthusiastic bottom for electrical play.',
     'Electro slut reads as a self-applied bottom label for someone who seeks out electrical play — violet wands, TENS units, e-stim — with enthusiasm. The safety constraints are fixed regardless of enthusiasm: current stays below the waist, never crosses the chest, and is never used on anyone with a pacemaker or a heart condition. Inferred from the term.'),
    ('emotional-support-sub', 'Emotional Support Sub', 'bdsm-power-exchange', 'concept', false, false, false,
     'A submissive whose service is primarily emotional care.',
     'Emotional support sub reads as a service role in which the work is steadiness and care rather than domestic tasks or protocol: being present, absorbing stress, and holding a dominant''s difficult days. The name borrows the emotional-support-animal construction as a joke, but the labour it describes is real and needs the same reciprocity as any other service arrangement. Inferred from the term.'),
    ('escape-artist', 'Escape Artist', 'bdsm-power-exchange', 'concept', true, false, false,
     'A bondage bottom whose pleasure is in trying to get out.',
     'Escape artist reads as a bondage bottom who treats the tie as a puzzle and a contest, testing whether they can get free rather than settling into stillness. It requires a top who ties accordingly and safety cutters within reach, since struggling against rope tightens it and raises the circulation risk. Inferred from the term.'),
    ('femboydom', 'Femboydom', 'bdsm-power-exchange', 'concept', true, false, false,
     'A dominant who is feminine-presenting and masculine-identified.',
     'Femboydom reads as a dominant role held by a femboy: feminine presentation, masculine identity, and authority exercised without the presentation being read as submission. The label exists because the assumption that femininity implies submission is common enough to need contradicting explicitly. Inferred from the composed term.'),
    ('feral-princess-feral-prince', 'Feral Princess / Feral Prince', 'bdsm-power-exchange', 'concept', false, false, false,
     'A role combining royal entitlement with primal, uncivilised behaviour.',
     'Feral princess and feral prince read as roles that pair the pampered, indulged framing of royalty with primal play''s wildness: adored and untamed at once, expecting to be served without behaving well about it. Inferred from the term.'),
    ('firefly', 'Firefly', 'bdsm-power-exchange', 'concept', false, false, false,
     'A light, elusive play role named for the insect.',
     'Firefly reads as a self-label for someone bright, brief and hard to hold onto in play — present in flashes rather than settled into a long dynamic. The reading is drawn from the imagery alone and the term is not otherwise documented. Some usage may instead relate it to fire play, which would be a different meaning entirely.'),
    ('fire-masochist', 'Fire Masochist', 'bdsm-power-exchange', 'concept', true, true, false,
     'A bottom who seeks out the sensation of fire play.',
     'Fire masochist reads as a bottom whose preferred sensation is fire play: brief controlled flame on the skin, usually with alcohol and a damp cloth to extinguish. Fire play is edge play with a real burn risk and demands a top who knows the technique, a fire blanket and clear escape from the area. Inferred from the term; the safety requirements are not.'),
    ('fire-sadist', 'Fire Sadist', 'bdsm-power-exchange', 'concept', true, true, false,
     'A top who specialises in fire play.',
     'Fire sadist reads as the top counterpart to a fire masochist: someone who has learned to apply controlled flame to skin as a sensation practice. Fire play requires training, fuel discipline, a fire blanket, hair and clothing management, and a bottom who has consented to a technique with a genuine burn risk. Inferred from the term; the requirements are not.'),
    ('first-girl', 'First Girl', 'bdsm-power-exchange', 'concept', true, false, false,
     'The senior submissive in a household with several.',
     'First girl reads as a rank within a poly or household dynamic: the longest-standing or highest-standing submissive, often with responsibility for the others. It parallels the alpha designation in hierarchical polyamory, and like all such ranks it works only where everyone agrees what it means. Inferred from the term.'),
    ('fisting-daddy-fisting-mommy', 'Fisting Daddy / Fisting Mommy', 'bdsm-power-exchange', 'concept', true, false, false,
     'A caregiver-framed top who specialises in fisting.',
     'Fisting daddy and fisting mommy read as caregiver-styled top roles specialising in fisting, where the framing is patient and instructive rather than harsh. Fisting requires long preparation, copious lubricant, short nails or gloves, and constant communication; injury from rushing is the main risk. Inferred from the term; the practice requirements are not.'),
    ('fisting-prince-fisting-princess', 'Fisting Prince / Fisting Princess', 'bdsm-power-exchange', 'concept', true, false, false,
     'A bottom identity for someone who takes fisting with pride.',
     'Fisting prince and fisting princess read as bottom-side identities carrying the royal framing already common in kink self-description: taking fisting is treated as an accomplishment rather than merely an act. The practice needs preparation, lubricant and unhurried pacing. Inferred from the term.'),
    ('fisting-switch', 'Fisting Switch', 'bdsm-power-exchange', 'concept', true, false, false,
     'Someone who both gives and receives fisting.',
     'Fisting switch reads as someone comfortable on both sides of fisting rather than fixed as top or bottom. Inferred from the composed term; the same preparation, lubricant and pacing apply in either direction.'),
    ('food-mommy', 'Food Mommy', 'bdsm-power-exchange', 'concept', false, false, false,
     'A caregiver role centred on feeding and nourishing a partner.',
     'Food mommy reads as a caregiver dynamic in which feeding is the primary expression of care: cooking, providing and watching someone eat. It touches on feeding-related kink but the framing is nurturing rather than about weight or gluttony. Food dynamics need care where eating disorders are in play. Inferred from the term.'),
    ('fuckslut', 'Fuckslut', 'bdsm-power-exchange', 'concept', true, true, false,
     'A blunt self-applied label for someone with an enthusiastic appetite for sex.',
     'Fuckslut is a self-applied role using the reclaimed vocabulary of sluttiness at its bluntest. As with the rest of that family it is an expression of appetite from the inside and not a description for anyone else to apply. Inferred from the term.'),
    ('gag-slut', 'Gag Slut', 'bdsm-power-exchange', 'concept', true, true, false,
     'A bottom who specifically enjoys being gagged.',
     'Gag slut reads as a bottom label for someone whose particular pleasure is being gagged and silenced. Gags remove speech, so a non-verbal safe signal — a dropped object, a hand squeeze — has to be agreed before one goes in, and a gagged person can never be left alone. Inferred from the term; the safety rule is standard.'),
    ('gangbang-slut', 'Gangbang Slut', 'bdsm-power-exchange', 'concept', true, true, false,
     'A self-applied label for someone who enjoys being the focus of group sex.',
     'Gangbang slut reads as a self-applied role for someone whose appetite is to be the centre of a group scene. Group scenes need explicit negotiation on numbers, acts, barriers and how anyone stops the scene, since the person at the centre is the least able to manage the room. Inferred from the term.'),
    ('giggle-bottom', 'Giggle Bottom', 'bdsm-power-exchange', 'concept', false, false, false,
     'A bottom whose response to a scene is laughter rather than solemnity.',
     'Giggle bottom reads as a bottom who laughs their way through play — nervous, delighted or both — rather than sinking into intensity. Naming it is useful because laughter is easily misread as not taking a scene seriously, when for some people it is simply what submission sounds like. Inferred from the term.'),
    ('giggle-masochist', 'Giggle Masochist', 'bdsm-power-exchange', 'concept', false, false, false,
     'A masochist who laughs at pain rather than gasping.',
     'Giggle masochist reads as someone whose response to painful sensation is laughter. It is the same disconnection between expected and actual response as giggle bottom, applied specifically to pain, and a top has to learn to read it since it does not signal what it appears to. Inferred from the term.'),
    ('grappler', 'Grappler', 'bdsm-power-exchange', 'concept', true, false, false,
     'Someone whose play is physical wrestling and struggle.',
     'Grappler reads as a role for someone who plays through bodily contest — wrestling, pinning, resisting — rather than through implements or protocol. It sits close to primal play and to consensual non-consent, and it needs the ordinary safeguards of contact sport as well as those of kink: agreed limits on strikes and joints, and a way to tap out that both people will honour. Inferred from the term.'),
    ('guardian', 'Guardian', 'bdsm-power-exchange', 'concept', false, false, false,
     'A protective dominant role whose authority is framed as duty of care.',
     'Guardian reads as a dominant identity built around protection rather than command: the authority exists because someone is being kept safe by it. It sits near daddy and caregiver roles without the family framing, and it also describes the role some people take at events, watching over a partner who is deep in a scene. Inferred from the term.'),
    ('helper', 'Helper', 'bdsm-power-exchange', 'concept', false, false, false,
     'A service role defined by being useful rather than by obedience.',
     'Helper reads as a low-protocol service role: the satisfaction comes from being of practical use — carrying, fetching, tidying, assisting at an event — rather than from submission as such. It is a common entry point for people who find service comfortable long before they find obedience so. Inferred from the term.'),
    ('honey-pot', 'Honey Pot', 'bdsm-power-exchange', 'concept', true, false, false,
     'Someone who draws a partner in for someone else, or who is the lure in a scene.',
     'Honey pot reads as a role built on being the attraction: the person who draws someone in, whether for a couple seeking a third or as the bait in a planned scenario. The espionage sense of the phrase — a person used to lure a target — is the source of the imagery. Any such arrangement is only a scene if everyone involved has actually agreed to it. Inferred from the term.'),
    ('hubull', 'Hubull', 'bdsm-power-exchange', 'concept', true, false, false,
     'A husband who also takes the bull role in his own relationship.',
     'Hubull appears to be a portmanteau of husband and bull, naming a man who is both the partner and the dominant sexual figure in a dynamic where those are usually separate people. In cuckolding vocabulary the bull is the outside partner, so the term reads as a deliberate collapsing of that distinction. Inferred from the construction.'),
    ('kink-slut', 'Kink Slut', 'bdsm-power-exchange', 'concept', true, false, false,
     'A self-label for someone indiscriminately enthusiastic about kink itself.',
     'Kink slut reads as a self-description for someone whose appetite is for kink broadly rather than for one practice: eager to try most things, not fixed on a specialty. Inferred from the term.'),
    ('latex-toy', 'Latex Toy', 'bdsm-power-exchange', 'concept', true, false, false,
     'A submissive role built on being encased in rubber and used as an object.',
     'Latex toy reads as an objectification role in which rubber encasement is what turns a person into a thing to be used: the material removes individuality and the role is built on that. Full encasement restricts heat loss and can restrict breathing, so temperature, hydration and constant monitoring are not optional. Inferred from the term; the constraints are not.'),
    ('lover-boy', 'Lover Boy', 'bdsm-power-exchange', 'concept', false, false, false,
     'A masculine role built on romance and attentiveness rather than dominance.',
     'Lover boy reads as a role for a man whose contribution is romance, affection and attentiveness rather than authority — sweetness as the offering. Inferred from the term.'),
    ('meatbag', 'Meatbag', 'bdsm-power-exchange', 'concept', true, true, false,
     'A self-applied objectification label reducing oneself to a body.',
     'Meatbag reads as an objectification self-label at its bluntest: the person is a body to be used, with the word doing the dehumanising deliberately. Objectification play depends on the humanity being fully restored afterwards, which is what aftercare is for in this kind of scene. Inferred from the term.'),
    ('mouse', 'Mouse', 'bdsm-power-exchange', 'concept', false, false, false,
     'A small, timid pet-play or submissive persona.',
     'Mouse reads as a persona built on smallness and timidity: quiet, easily startled, hiding rather than defying. It appears both as a pet-play animal identity and as a general submissive self-description, and it contrasts directly with bratting. Inferred from the term.'),
    ('muscle-slut', 'Muscle Slut', 'bdsm-power-exchange', 'concept', true, false, false,
     'Someone whose desire is organised around muscular bodies, their own or others.',
     'Muscle slut reads as a self-label for someone whose sexuality centres on muscularity — being muscular and displaying it, wanting muscular partners, or both. It sits near muscle worship, where the body itself is the object of devotion. Inferred from the term.'),
    ('oral-slave', 'Oral Slave', 'bdsm-power-exchange', 'concept', true, false, false,
     'A submissive whose service is specifically oral sex.',
     'Oral slave reads as a service role in which oral sex on demand is the defining obligation. As with any total-service framing, the word slave describes a negotiated arrangement between consenting adults with limits and an exit, however absolute the language sounds. Inferred from the term.'),
    ('pegging-princess', 'Pegging Princess', 'bdsm-power-exchange', 'concept', true, false, false,
     'A receiving role in pegging framed as being adored while taken.',
     'Pegging princess reads as a receptive role in pegging carrying the royal framing common in kink self-description: being pegged is something to be proud of and be indulged for rather than something to be shamed about. Pegging needs a harness that fits, plenty of lubricant and unhurried pacing. Inferred from the term.'),
    ('pegging-slut', 'Pegging Slut', 'bdsm-power-exchange', 'concept', true, false, false,
     'A self-label for someone who enthusiastically seeks out being pegged.',
     'Pegging slut reads as a self-applied label for someone with an appetite for receiving pegging specifically. The label is one of the more common ways men name a desire that a lot of cultural pressure works against admitting to. Inferred from the term.'),
    ('pet-trainer', 'Pet Trainer', 'bdsm-power-exchange', 'concept', true, false, false,
     'The handler role in pet play, specialising in teaching behaviour.',
     'Pet trainer reads as the handler side of pet play with the emphasis on instruction: teaching commands, postures and behaviours to someone in a pet headspace. It sits alongside handler and owner, differing in what the role is for rather than in where the authority sits. Inferred from the term.'),
    ('pleasure-sadomasochist', 'Pleasure Sadomasochist', 'bdsm-power-exchange', 'concept', true, false, false,
     'Someone whose sadomasochism is about pleasure rather than suffering.',
     'Pleasure sadomasochist reads as a distinction within sadomasochism: the interest is in sensation experienced as good rather than in suffering endured, so intensity is pursued for how it feels rather than for what it costs. The contrast is with people for whom the suffering itself is the point. Inferred from the term.'),
    ('porcelain-doll', 'Porcelain Doll', 'bdsm-power-exchange', 'concept', true, false, false,
     'A doll-play persona built on fragility and being handled with care.',
     'Porcelain doll reads as a doll persona whose defining quality is delicacy: the person is precious, breakable and handled carefully, which makes it a gentler variant of objectification than the mannequin or toy framings. Inferred from the term.'),
    ('praise-princess', 'Praise Princess', 'bdsm-power-exchange', 'concept', false, false, false,
     'A submissive whose motivation is praise rather than correction.',
     'Praise princess reads as a submissive role driven by approval: doing well in order to be told so, with praise carrying the weight that punishment carries in other dynamics. Praise kink is widely recognised in its own right, and this is its role-shaped form. Inferred from the term.'),
    ('pretzel', 'Pretzel', 'bdsm-power-exchange', 'concept', true, false, false,
     'A flexible bottom who enjoys being folded into demanding positions.',
     'Pretzel reads as a self-label for a bottom whose flexibility is the offering: comfortable being bent, folded and tied into positions most people could not hold. Predicament bondage and demanding rope positions both draw on it. Joint strain and circulation are the limits to watch. Inferred from the term.'),
    ('primal-pet', 'Primal Pet', 'bdsm-power-exchange', 'concept', true, false, false,
     'A pet-play identity played wild and instinctive rather than trained.',
     'Primal pet reads as the meeting point of pet play and primal play: an animal headspace that is feral rather than obedient, closer to a wild creature than to a trained companion. Inferred from the composed term.'),
    ('princess-domme', 'Princess Domme', 'bdsm-power-exchange', 'concept', true, false, false,
     'A dominant whose authority is expressed as entitlement to be served and adored.',
     'Princess domme reads as a dominant style built on being indulged rather than on commanding: the submissive''s role is to provide, pamper and adore, and the authority comes from expecting it as a right. It sits close to findom and to worship dynamics. Inferred from the term.'),
    ('princette', 'Princette', 'bdsm-power-exchange', 'concept', false, false, false,
     'A gender-neutral or diminutive form of prince and princess.',
     'Princette reads as a coinage for people who want the pampered, adored framing of the princess role without its gendering, or in a smaller and more affectionate register. It belongs to the same impulse as mxstress and priestex: an established role whose only available names are a gendered pair. Inferred from the construction.'),
    ('punching-bag', 'Punching Bag', 'bdsm-power-exchange', 'concept', true, true, false,
     'A bottom who takes strikes in rough body play.',
     'Punching bag reads as a self-applied bottom role for someone who takes punches and body blows rather than implement strikes. Rough body play needs a top who knows which areas are survivable — never the head, kidneys, spine or floating ribs — and a bottom who can still signal. Inferred from the term; the anatomy is not.'),
    ('puppeteer', 'Puppeteer', 'bdsm-power-exchange', 'concept', true, false, false,
     'A dominant who moves and poses a partner as an object.',
     'Puppeteer reads as a dominant role centred on physical control of a partner''s body: positioning, moving and posing them rather than instructing them to move themselves. It pairs with doll and marionette bottom roles and sits within objectification play. Inferred from the term.'),
    ('pussy-worshipper', 'Pussy Worshipper', 'bdsm-power-exchange', 'concept', true, false, false,
     'Someone whose devotion is directed at a partner''s vulva.',
     'Pussy worshipper reads as a devotional role in which the vulva is the object of reverence, expressed through oral service and ritual. It parallels other worship dynamics such as foot and body worship, where the point is adoration rather than reciprocity. Inferred from the term.'),
    ('ritual-object', 'Ritual Object', 'bdsm-power-exchange', 'concept', true, false, false,
     'An objectification role in which the person functions as an item used in ceremony.',
     'Ritual object reads as an objectification role placed in a ceremonial frame: the person becomes an altar, a vessel or an instrument used within a rite rather than a piece of furniture. It draws on the overlap between kink and ritual practice, where structure and reverence do much of the work. Inferred from the term.'),
    ('sadist-bait', 'Sadist Bait', 'bdsm-power-exchange', 'concept', true, true, false,
     'A self-label for a bottom who attracts sadists and enjoys doing so.',
     'Sadist bait reads as a self-description worn with some pride: the person''s reactions, appetite or manner draw sadists to them, and that is the intent. It is disclosure as much as boast, telling prospective partners what the person is looking for. Inferred from the term.'),
    ('scent-freak', 'Scent Freak', 'fetishes-interests', 'concept', true, false, false,
     'Someone whose arousal runs primarily through smell.',
     'Scent freak reads as a self-label for someone whose erotic response is driven by smell — body odour, sweat, worn clothing, leather or rubber. It overlaps with olfactophilia as a clinical term, and with the well-established gear practice of trading worn items. Inferred from the term.'),
    ('selective-nympho', 'Selective Nympho', 'bdsm-power-exchange', 'concept', true, false, false,
     'Someone with a very high sex drive that is directed at very few people.',
     'Selective nympho reads as a self-description resolving an apparent contradiction: an intense appetite for sex combined with a narrow set of people it applies to. It is close to what demisexual describes, framed through drive rather than through attraction. Inferred from the term.'),
    ('sex-witch', 'Sex Witch', 'bdsm-power-exchange', 'concept', true, false, false,
     'Someone who works with sexuality as a spiritual or magical practice.',
     'Sex witch reads as an identity at the meeting point of witchcraft and sexuality, where sex is treated as a source of power and a ritual practice rather than only as pleasure. It draws on a real current of queer and feminist witchcraft in which reclaiming the witch is itself the point. Inferred from the term.'),
    ('shock-daddy-shock-mommy', 'Shock Daddy / Shock Mommy', 'bdsm-power-exchange', 'concept', true, false, false,
     'A caregiver-framed dominant specialising in electrical play.',
     'Shock daddy and shock mommy read as caregiver-styled dominant roles built around electrical play, pairing nurturing framing with e-stim, TENS and violet wands. The safety rules do not soften with the framing: current stays below the waist, never crosses the chest, and is never used on anyone with a pacemaker or a heart condition. Inferred from the term; the rules are not.'),
    ('sissifier', 'Sissifier', 'bdsm-power-exchange', 'concept', true, true, false,
     'A dominant who feminises a submissive as the substance of the dynamic.',
     'Sissifier reads as the dominant side of sissification: directing a submissive into feminine dress, manner and role. The practice sits on a fault line, since it can work as gender exploration or can rest on treating femininity as degrading, and which one it is depends entirely on the people in it. Some people find their gender through it; for others it is humiliation play. Inferred from the term.'),
    ('soft-bottom', 'Soft Bottom', 'bdsm-power-exchange', 'concept', false, false, false,
     'A bottom who wants gentleness and sensuality rather than intensity.',
     'Soft bottom reads as a bottom whose preference is for tenderness: sensation play, closeness and care rather than heavy impact or harsh dynamics. Naming it is practically useful, since bottom on its own is often read as an appetite for intensity. Inferred from the term.'),
    ('soft-goddess', 'Soft Goddess', 'bdsm-power-exchange', 'concept', false, false, false,
     'A worshipped dominant whose register is warm rather than severe.',
     'Soft goddess reads as the gentle form of the goddess or divine dominant role: still the object of devotion, but the devotion is met with warmth and praise instead of coldness. It is to goddess worship what gentle femdom is to femdom. Inferred from the term.'),
    ('soft-masochist', 'Soft Masochist', 'bdsm-power-exchange', 'concept', false, false, false,
     'A masochist whose appetite is for light sensation rather than heavy pain.',
     'Soft masochist reads as someone who wants pain in a low register: stinging rather than bruising, a warm-up rather than a scene that ends in marks. Naming it matters because masochist alone is often read as a claim to endurance. Inferred from the term.'),
    ('spit-slut', 'Spit Slut', 'bdsm-power-exchange', 'concept', true, true, false,
     'A bottom whose kink is being spat on or fed a partner''s saliva.',
     'Spit slut reads as a bottom label for someone whose particular interest is saliva play: being spat on, or taking a partner''s spit. It is a mild degradation practice with a straightforward hygiene note, since saliva transmits some infections. Inferred from the term.'),
    ('struggle-slut', 'Struggle Slut', 'bdsm-power-exchange', 'concept', true, false, false,
     'A bondage bottom whose pleasure is in fighting the restraint.',
     'Struggle slut reads as a bondage bottom for whom the point is resistance: straining, twisting and fighting a tie rather than settling into it. It needs rope and cuffs that will hold up to being fought, since struggling tightens rope and raises circulation risk, and safety cutters within reach. Inferred from the term.'),
    ('subslut', 'Subslut', 'bdsm-power-exchange', 'concept', true, false, false,
     'A submissive whose submission is sexual first.',
     'Subslut reads as a submissive label where the submission runs through sex specifically rather than through service, protocol or domestic structure. Inferred from the composed term.'),
    ('suffer-slut', 'Suffer Slut', 'bdsm-power-exchange', 'concept', true, true, false,
     'A masochist whose appetite is for endurance rather than pleasant sensation.',
     'Suffer slut reads as the opposite pole from the pleasure sadomasochist: the point is enduring, and the pain is meant to be hard rather than to feel good. Play at that end needs a top who can read a bottom who will not tap out, and an agreed limit set before the scene rather than during it. Inferred from the term.'),
    ('switch-daddy', 'Switch Daddy', 'bdsm-power-exchange', 'concept', true, false, false,
     'A daddy-role caregiver who also takes the submissive side.',
     'Switch daddy reads as someone who holds the daddy caregiver role and also submits, either with different partners or at different times with the same one. Inferred from the composed term.'),
    ('trinket-goblin', 'Trinket Goblin', 'bdsm-power-exchange', 'concept', false, false, false,
     'A playful role for someone who hoards small gifts and shiny things.',
     'Trinket goblin reads as a light, non-sexual persona for someone who collects and hoards small objects — gifts, tokens, shiny things — in the manner of a magpie or a goblin. It appears alongside pet-play and creature identities and is generally worn for fun rather than as a dynamic. Inferred from the term.'),
    ('unruly-submissive', 'Unruly Submissive', 'bdsm-power-exchange', 'concept', false, false, false,
     'A submissive who does not obey easily and makes a dominant work for it.',
     'Unruly submissive reads as a submissive whose obedience is real but has to be won: they resist, test and disobey as part of how they submit. It overlaps with bratting, framed as a disposition rather than as a game. Inferred from the term.'),
    ('volt-bunny', 'Volt Bunny', 'bdsm-power-exchange', 'concept', true, false, false,
     'A bottom who seeks out electrical play, on the model of rope bunny.',
     'Volt bunny reads as the electrical-play equivalent of a rope bunny: an enthusiastic bottom for e-stim, TENS and violet wands. The constraints stand regardless: current below the waist, never across the chest, never with a pacemaker or a heart condition. Inferred from the term; the constraints are not.'),
    ('volt-vixen', 'Volt Vixen', 'bdsm-power-exchange', 'concept', true, false, false,
     'A feminine variant of the electrical-play bottom or top role.',
     'Volt vixen reads as a feminine-framed electrical-play identity, paired with volt bunny in the same vocabulary and usually with more of a knowing, predatory register. The safety rules for electrical play apply in either role. Inferred from the term.'),
    ('whip-catcher', 'Whip Catcher', 'bdsm-power-exchange', 'concept', true, true, false,
     'A bottom who specialises in taking single-tail and whip play.',
     'Whip catcher reads as a bottom who takes whip strikes as their speciality, particularly single-tails. Single-tail work is a skilled discipline: it can break skin, and it requires a top with real practice and strict avoidance of the face, neck, spine and kidneys. Inferred from the term; the anatomy is not.'),
    ('wood-nymph', 'Wood Nymph', 'bdsm-power-exchange', 'concept', false, false, false,
     'A woodland creature persona, wild and elusive.',
     'Wood nymph reads as a creature persona drawn from folklore: sylvan, elusive and untamed, often paired with outdoor play. It sits in the same family as the fae and faun personas that recur in kink self-description. Inferred from the term.'),
    ('coach', 'Coach', 'bdsm-power-exchange', 'concept', false, false, false,
     'A dominant role framed as training and improvement rather than command.',
     'Coach reads as a dominant identity in the register of athletic training: setting tasks, drilling, correcting and pushing someone to improve. It appears as a role-play framing and as a real ongoing structure, and it sits alongside the well-established sports and locker-room scenarios in kink. Inferred from the term.'),
    ('encourager', 'Encourager', 'bdsm-power-exchange', 'concept', false, false, false,
     'Someone whose contribution to a dynamic is praise and motivation.',
     'Encourager reads as a role built on affirmation: the person''s job is to praise, motivate and build up a partner, which is the positive-reinforcement counterpart to a disciplinarian. It pairs naturally with praise kink. Inferred from the term.'),
    ('hyena', 'Hyena', 'bdsm-power-exchange', 'concept', false, false, false,
     'A primal or pet-play persona built on hyena traits.',
     'Hyena reads as an animal persona drawn from the hyena: laughing, scavenging, pack-social and not domesticated. It carries particular resonance in queer contexts, since spotted hyena females are famously dominant and do not fit the sexual dimorphism people expect. Inferred from the term.'),
    ('ladybug', 'Ladybug', 'bdsm-power-exchange', 'concept', false, false, false,
     'A small, gentle creature persona.',
     'Ladybug reads as a creature persona built on smallness, prettiness and harmlessness — an affectionate pet name as much as a role. Insect personas are a small but real strand of pet play. Inferred from the term.'),
    ('goose', 'Goose', 'bdsm-power-exchange', 'concept', false, false, false,
     'A bird persona built on aggression and mischief rather than sweetness.',
     'Goose reads as an animal persona chosen for the bird''s reputation: loud, territorial, unafraid and a nuisance on purpose. It sits with the bratty end of pet play rather than the devoted end. Inferred from the term.'),
    ('feral-sadist', 'Feral Sadist', 'bdsm-power-exchange', 'concept', true, true, false,
     'A sadist who works instinctively and physically rather than by technique.',
     'Feral sadist reads as the sadist counterpart within primal play: pain delivered through biting, scratching and bodily struggle rather than through implements and technique. Primal play is fast and hard to modulate, so limits, marks and infection risk from bites need settling in advance. Inferred from the term.'),
    ('feral-masochist', 'Feral Masochist', 'bdsm-power-exchange', 'concept', true, true, false,
     'A masochist who wants pain given wildly rather than precisely.',
     'Feral masochist reads as the receiving side of primal sadism: wanting to be bitten, scratched and overpowered rather than struck with an implement, and fighting back as part of it. Inferred from the term; bites break skin and carry a real infection risk.'),
    ('fellatio-slave', 'Fellatio Slave', 'bdsm-power-exchange', 'concept', true, false, false,
     'A service role centred specifically on performing oral sex on a penis.',
     'Fellatio slave reads as a narrower form of the oral service role, defined by the specific act rather than by oral service generally. As with all such framings, the word slave describes a negotiated arrangement between adults with limits and an exit. Inferred from the term.'),
    ('chaos-puppy', 'Chaos Puppy', 'bdsm-power-exchange', 'concept', false, false, false,
     'A pup-play persona that is disobedient and disruptive rather than eager to please.',
     'Chaos puppy reads as pup play in the bratty register: the energy and enthusiasm of a pup with none of the obedience, stealing things and causing trouble instead of heeling. Inferred from the term.'),
    ('sinner', 'Sinner', 'bdsm-power-exchange', 'concept', true, false, false,
     'A role built on transgression and guilt in a religious frame.',
     'Sinner reads as a role played against a religious backdrop, where the eroticism comes from transgression, guilt and the prospect of confession or punishment. Religious framing is common in kink and carries particular charge for queer people raised in traditions that condemned them, which is part of why it is reclaimed as play. Inferred from the term.'),
    ('pest', 'Pest', 'bdsm-power-exchange', 'concept', false, false, false,
     'A brat-adjacent role built on being deliberately annoying.',
     'Pest reads as a self-applied role for someone who provokes by being a nuisance rather than by open defiance: persistent, interrupting and impossible to ignore, with the reaction as the reward. Inferred from the term.'),
    ('slut-trainer', 'Slut Trainer', 'bdsm-power-exchange', 'concept', true, true, false,
     'A dominant who trains a submissive into a sexual role over time.',
     'Slut trainer reads as a dominant role framed around progressive sexual training: setting tasks, escalating limits by agreement and shaping a submissive''s sexual behaviour over time. Anything described as training only works where the escalation is negotiated in advance rather than assumed to follow from the framing. Inferred from the term.'),
    ('anal-pounding', 'Anal Pounding', 'practices-play', 'concept', true, false, false,
     'Hard, fast anal penetration.',
     'Anal pounding names anal sex at the rough end: fast, forceful and sustained. It needs the same preparation as any anal sex and rather more attention to it, since force without adequate lubricant and warm-up is how tearing happens. Inferred from the term.'),
    ('cumsicle', 'Cumsicle', 'practices-play', 'concept', true, false, false,
     'Frozen semen, used as a temperature-play novelty.',
     'Cumsicle reads as a portmanteau of cum and popsicle, naming frozen semen used in play. It sits at the meeting point of semen play and temperature play. Freezing does not reliably inactivate infections, so the ordinary barrier considerations still apply. Inferred from the term.'),
    ('nipple-play-wrestling', 'Nipple Play Wrestling', 'practices-play', 'concept', true, false, false,
     'Contest-framed play in which the target is a partner''s nipples.',
     'Nipple play wrestling reads as a contest scene in which each person tries to get at the other''s nipples, combining wrestling with a specific sensation focus. It belongs with the wider tit-torture and nipple-play vocabulary, played as a game rather than as a straightforward top-and-bottom scene. Inferred from the term.'),
    ('whipcasso', 'Whipcasso', 'practices-play', 'concept', true, true, false,
     'A whip top who leaves deliberate patterns of marks.',
     'Whipcasso puns on Picasso and reads as a term for a top whose whip work is precise enough to place marks deliberately, treating the bottom''s skin as a surface to compose on. Single-tail accuracy at that level takes years of practice and stays clear of the face, neck, spine and kidneys. Inferred from the pun.'),
    ('fotboth', 'Fotboth', 'practices-play', 'concept', true, false, false,
     'A term whose meaning is not attested outside community glossaries.',
     'Fotboth is not documented anywhere it can be checked and has no clear derivation, though the first element may relate to feet. Rather than invent a meaning for an act term, this entry records the word and leaves its definition open until someone who uses it supplies one.'),
    ('outstroking', 'Outstroking', 'practices-play', 'concept', true, false, false,
     'Stimulation focused on withdrawal rather than on thrusting in.',
     'Outstroking reads as a technique that puts the attention on the outward stroke — slow withdrawal rather than the push — reversing the usual emphasis of penetrative sex. The reading follows from the construction of the word and is not otherwise documented.'),
    ('cratolagnia', 'Cratolagnia', 'fetishes-interests', 'concept', true, false, false,
     'Arousal from displays of strength.',
     'From the Greek kratos, strength, with the -lagnia suffix used across the philia vocabulary for arousal. It reads as arousal specifically at displays of physical power, which places it near muscle worship and near the strength element of primal play. The reading is from the roots; the term is not clinically established.'),
    ('glass-licking-fetish', 'Glass Licking Fetish', 'fetishes-interests', 'concept', true, false, false,
     'Arousal from licking glass, usually with someone watching from the other side.',
     'Glass licking reads as a fetish built on the barrier: tongue against a window or screen with someone on the other side, contact and separation at once. It fits with voyeurism and exhibitionism, where the glass is exactly what makes the scene work. Inferred from the term.'),
    ('grossdom', 'Grossdom', 'fetishes-interests', 'concept', true, true, false,
     'Domination built on disgust rather than on pain or authority.',
     'Grossdom reads as a dominance style whose currency is revulsion: the submissive is subjected to things they find disgusting, and the reaction is the point. It sits near mysophilia and the messier end of humiliation play, and it needs an unusually explicit limits conversation, since disgust is highly individual and hygiene risks are real. Inferred from the term.'),
    ('ludophilia', 'Ludophilia', 'fetishes-interests', 'concept', true, false, false,
     'Arousal from games and play itself.',
     'From the Latin ludus, game. It reads as arousal from the structure of games — rules, contests, stakes and forfeits — rather than from any particular act, which is why so much kink is organised as a game in the first place. The reading is from the root; the term is not clinically established.'),
    ('bushmaxxing', 'Bushmaxxing', 'slang-terminology', 'concept', true, false, false,
     'Deliberately growing out body or pubic hair as a look.',
     'Bushmaxxing reads as growing body and pubic hair out on purpose, using the -maxxing construction from internet self-optimisation slang. It runs against a long default of removal and is often framed as reclaiming a natural look. Inferred from the construction.'),
    ('cumjob', 'Cumjob', 'practices-play', 'concept', true, false, false,
     'Using semen as lubricant for continued stimulation after ejaculation.',
     'Cumjob reads as continued manual or oral stimulation after ejaculation, using the semen itself as lubricant. Post-orgasm stimulation is intensely sensitive and shades into overstimulation play, which is its own negotiated thing. Inferred from the term.'),
    ('dickdash', 'Dickdash', 'slang-terminology', 'concept', true, true, false,
     'Slang for briefly exposing a penis, whether as a joke or as flashing.',
     'Dickdash reads as slang for a quick genital exposure. The distinction that matters is consent: between people who have agreed to it, it is exhibitionism; directed at anyone who has not, it is indecent exposure and a criminal offence in most jurisdictions, and sending an unsolicited image is the same act in another medium. Inferred from the term.'),
    ('wireplay', 'Wireplay', 'practices-play', 'concept', true, true, false,
     'Play using wire, generally in an electrical or binding context.',
     'Wireplay reads as play using wire — as a conductor in electrical scenes, or as an unforgiving binding material. Wire has no give, cuts into skin under load and can damage nerves in minutes where rope would only mark, so it is edge play with a narrow margin. Inferred from the term; the physical constraints are not.'),
    ('cover', 'Cover', 'physical-digital-safety', 'concept', false, false, false,
     'A prepared account of one''s whereabouts that protects kink or queer privacy.',
     'In a safety context cover reads as the story someone keeps ready for where they were and who with, protecting them from being outed as queer or kinky to family, employers or anyone who could do them harm with it. It is standard practice for people whose safety depends on separating community life from the rest, and it goes with separate names, accounts and photographs. The reading is inferred from context; note that in leather culture cover also means the peaked cap, which is a different word entirely and is covered under muir cap.'),
    ('metasexuality', 'Metasexuality', 'sexual-orientation', 'concept', false, false, false,
     'Sexuality treated as something to be examined rather than simply had.',
     'Metasexuality reads as an orientation toward sex itself as a subject: the thinking, framing and analysis of desire being as compelling as the acts. The meta- prefix points that way, and it would describe a real disposition common among people who spend their time in kink theory and vocabulary. The reading is inferred from the construction and is not independently documented.');

  -- Every category must resolve. A typo would otherwise create an uncategorized
  -- row, which tag_hygiene_stats counts and nothing else would explain.
  select count(*) into v_bad from _new n
   where not exists (select 1 from public.tag_categories c where c.slug = n.cat);
  if v_bad > 0 then
    raise exception 'new terms: % row(s) name a category that does not exist', v_bad;
  end if;

  -- Refuse to create anything that already exists — a term that is merely
  -- deprecated needs REVIVING, not a duplicate concept alongside it.
  --
  -- 2026-09-03: `pretzel` already existed as status='deprecated',
  -- merged_into_id NULL, from the 2026-06-05 orphan sweep — same class as
  -- `femdom`/`voyeur` in the sourced half. Not merge residue, not a duplicate:
  -- exactly the revive this comment prescribes, so it is now performed rather
  -- than refused. The guard stays hard for active or merged rows, whose slug is
  -- a live redirect trail and needs human judgement about direction.
  select count(*) into v_bad from _new n
    join public.unified_tags t on t.slug = n.slug
   where t.status <> 'deprecated' or t.merged_into_id is not null;
  if v_bad > 0 then
    raise exception 'new terms: % slug(s) already exist as active or merged rows — resolve by hand, not by insert', v_bad;
  end if;

  for r in select * from _new order by slug loop
    -- Revive the deprecated orphan instead of inserting beside it, restoring the
    -- same safety posture a new row gets below: not indexable, not human-reviewed,
    -- verification_status 'unverified' (these rows carry 'auto', and the
    -- publishability assertion below tests for exactly that).
    if exists (select 1 from public.unified_tags t where t.slug = r.slug) then
      update public.unified_tags t
         set name                = r.name,
             description         = r.descr,
             long_description    = r.longd,
             category_id         = c.id,
             category            = c.name,
             entity_kind         = r.kind::tag_entity_kind,
             is_adult            = r.adult,
             is_sensitive        = r.sensitive,
             status              = 'active',
             deprecated_at       = null,
             deprecation_reason  = null,
             seo_indexable       = false,
             human_reviewed      = false,
             verification_status = 'unverified'
        from public.tag_categories c
       where t.slug = r.slug and c.slug = r.cat;
      v_revive := v_revive + 1;

      insert into public.tag_sources (tag_id, source_type, source_id, claim_summary, is_public)
      select t.id, 'editorial',
             case when r.sourced then 'general-knowledge' else 'inferred-from-name' end,
             case when r.sourced
                  then 'Definition written from independently documented meaning. Not derived from the Kinktionary, whose licence is non-commercial.'
                  else 'Term is attested only in the FetLife Kinktionary. This definition is INFERRED from the term name and its section, and is a reasoned guess pending review by someone who knows the vocabulary.'
             end,
             false
        from public.unified_tags t
       where t.slug = r.slug
         and not exists (select 1 from public.tag_sources s
                          where s.tag_id = t.id and s.source_type = 'editorial');
      v_src := v_src + 1;
      continue;
    end if;

    insert into public.unified_tags (
      name, slug, description, long_description,
      category_id, category, entity_kind,
      is_adult, is_sensitive,
      status, seo_indexable, human_reviewed, verification_status
    )
    select r.name, r.slug, r.descr, r.longd,
           c.id, c.name, r.kind::tag_entity_kind,
           r.adult, r.sensitive,
           'active', false, false, 'unverified'
      from public.tag_categories c where c.slug = r.cat;
    v_made := v_made + 1;

    insert into public.tag_sources (tag_id, source_type, source_id, claim_summary, is_public)
    select t.id,
           -- Same defect as the sourced half at 20261211100000: source_type is
           -- CHECK-constrained to a fixed vocabulary and the prefixed value is not
           -- in it, so every provenance insert here violated
           -- tag_sources_source_type_check. Sub-kind moves to source_id.
           'editorial',
           case when r.sourced then 'general-knowledge'
                else 'inferred-from-name' end,
           case when r.sourced
                then 'Definition written from independently documented meaning. Not derived from the Kinktionary, whose licence is non-commercial.'
                else 'Term is attested only in the FetLife Kinktionary. This definition is INFERRED from the term name and its section, and is a reasoned guess pending review by someone who knows the vocabulary.'
           end,
           false
      from public.unified_tags t where t.slug = r.slug;
    v_src := v_src + 1;
  end loop;

  ------------------------------------------------------------------ assertions
  select count(*) into v_bad from _new n
   where not exists (select 1 from public.unified_tags t where t.slug = n.slug);
  if v_bad > 0 then
    raise exception 'new terms: % row(s) were not created', v_bad;
  end if;

  -- Not one of them may be publishable. This is the whole safety property.
  select count(*) into v_bad from _new n
    join public.unified_tags t on t.slug = n.slug
   where t.seo_indexable or coalesce(t.human_reviewed, false) or t.verification_status <> 'unverified';
  if v_bad > 0 then
    raise exception 'new terms: % row(s) are publishable — they must be created unreviewed and unindexed', v_bad;
  end if;

  -- Every row carries a provenance record saying where its prose came from.
  select count(*) into v_bad from _new n
    join public.unified_tags t on t.slug = n.slug
   where not exists (select 1 from public.tag_sources s
                      where s.tag_id = t.id and s.source_type = 'editorial');
  if v_bad > 0 then
    raise exception 'new terms: % row(s) have no provenance record', v_bad;
  end if;

  -- The CI zero-invariant, corpus-wide.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and seo_indexable
     and coalesce(nullif(btrim(description), ''), short_description) is null;
  if v_bad > 0 then
    raise exception 'new terms: % indexable row(s) corpus-wide have no description', v_bad;
  end if;

  raise notice 'new terms: % created, % revived, % provenance row(s)', v_made, v_revive, v_src;
end
$mig$;
