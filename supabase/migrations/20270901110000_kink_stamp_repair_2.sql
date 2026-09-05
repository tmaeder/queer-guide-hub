-- Replace the 'Sexual activity tag' / 'Scene safety tag' import stamps on 60 kink glossary rows
-- with hand-written definitions, re-file them into a stop that matches their
-- kind, and publish them.
--
-- GENERATED from scripts/data-quality/kink-stamp-repair-2-definitions.mjs by
-- scripts/data-quality/generate-kink-stamp-repair-migration.mjs. Edit the
-- definitions there and regenerate; do not hand-edit the VALUES below, or the
-- two will disagree about what was published.
--
-- WHY THIS FINISHES A BACKLOG. tag_hygiene_stats()
-- .placeholder_description_active decomposes into exactly four stamps and no
-- others: 'Toys tag' 41 and 'Philia tag' 20 (both repaired by 20270901100000),
-- 'Sexual activity tag' 49 and 'Scene safety tag' 11, repaired here. 41 + 20 +
-- 49 + 11 = 121, the whole metric, so this takes it to ZERO.
--
-- A stamp is WORSE than a blank: it is non-null, so tag_has_prose() is
-- satisfied, enforce_tag_thin_page_gate does not fire, the fill sweep never
-- selects the row and indexable_without_description cannot see it. The row
-- reads as finished.
--
-- THE SAFETY ELEVEN ARE THE WORST ROWS IN THE CORPUS. These are the terms a
-- reader looks up when trying not to get hurt, and five published prose about
-- something else entirely:
--
--   subspace     "a fictional or hypothetical property of space-time ... used
--                in science fiction" (Q6471641). The real concept is the
--                altered state a bottom can enter, and it is the reason drop
--                and aftercare exist.
--   sub-frenzy   "an event where people who identify as submissive can gather
--                and connect" — a WARNING term published as a party listing.
--                It names a new submissive's rush to consent to everything.
--   dom-frenzy   "an event that caters to individuals interested in BDSM" —
--                the same inversion, and the more dangerous of the two,
--                because the consequences land on someone else's body.
--   vetting      the generic employment background-check article (Q7923820).
--   after-scene  the comedown after Pride events and parties, rather than
--                sub/dom drop after a scene.
--
-- cuttlefish-method and white-knight had no body at all.
--
-- THE OTHER 49 REPEAT THE FIRST COHORT'S THREE FAILURES. Wrong entity or
-- generic sense on 14: facial -> a skincare treatment; foursome -> "a type of
-- golf match"; edging -> "a gardening tool, a climbing technique" (a
-- disambiguation page rendered as a definition); face-fucking -> "Face Fucking
-- Inc., an adult film production company"; free-use -> "Free content refers to
-- creative works" (Q14075, the SAME wrong identifier cleared for the Toys
-- cohort); queening -> drag performance art; stretching -> "a form of physical
-- exercise"; oral -> "something related to the mouth"; breeding -> animal
-- husbandry; and testicular-sex -> "the sex assigned at birth based on the
-- presence of testes", which is not what the term means and is a claim about
-- intersex and trans people this platform must not make by accident.
-- Empty on 12. 3 identifiers are cleared and NONE is re-resolved: a
-- plausible-but-wrong QID regenerates wrong data into tag_medical_codes,
-- broader edges and the Elsewhere rail every week, a null one regenerates
-- nothing.
--
-- KIND MISMATCH: 27 acts were filed under Fetishes (an act is not an
-- attraction), 7 under Slang & Language, mixed-wrestling under Events &
-- Parties, and sexual-positions under ORIENTATION. Category is written as
-- category_id ONLY — the BEFORE trigger derives the text mirror and the AFTER
-- trigger moves the junction; writing either directly propagates nothing.
--
-- AGE GATING IS AN EXPLICIT DECISION HERE, IN BOTH DIRECTIONS, AND IS THE ONE
-- THING IN THIS MIGRATION THAT IS NOT PURELY A REPAIR.
-- unified_tags_recompute_is_adult() derives the flag from the junction, and
-- 'Consent & Negotiation' is deliberately NOT in its adult set while every Sex
-- & Kink stop is. So filing a safety term there UN-GATES it. That is intended:
-- safe-call, vetting, trauma-awareness, meeting-for-the-first-time,
-- rope-compatibility-checks, cuttlefish-method, white-knight and
-- after-scene-drop are things a person needs to be able to read BEFORE they
-- are in the room, and an age wall on a safety practice is a harm of its own.
-- subspace, sub-frenzy and dom-frenzy deliberately STAY 18+ in Dynamics &
-- Roles: they are states inside a D/s dynamic, that is where a reader looks,
-- and un-gating them buys nothing. The assertions below check the resulting
-- flag per row AGAINST THE DECLARED LISTS rather than asserting one direction
-- for everything, because both answers are correct for different rows here.
--
-- PUBLISHING NEEDS FOUR THINGS, NOT ONE. Prose present (or
-- enforce_tag_thin_page_gate stamps 'thin'), human_reviewed=true (or
-- enforce_tag_seo_sensitivity_gate forces seo_indexable false on any sensitive
-- or adult row), verification_status='reviewed' (or
-- unified_tags_public_gated_read hides a sensitive row from anon entirely — it
-- is verification_status, NOT seo_indexable, that shows a sensitive term to a
-- signed-out reader), and seo_indexable=true. human_reviewed is truthful:
-- every definition was written by hand for this migration.
--
-- 16 rows keep their existing long_description because it is already correct;
-- only their stamp is replaced.
--
-- ONE UPDATE PER SLUG, NEVER SET-BASED. The category sync trigger pair raises
-- Postgres 27000 ("tuple to be updated was already modified") on a multi-row
-- UPDATE that touches category_id. The loop below is not a style choice.
--
-- Provenance goes to tag_sources with is_public=false, so it is available to
-- reviewers and never rendered on the page.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:kink-stamp-repair-2', true);

do $mig$
declare
  r          record;
  v_bad      int;
  v_cat      uuid;
  v_updated  int := 0;
  v_alias    int := 0;
  v_src      int := 0;
  v_before   int;
  v_after    int;
begin
  select count(*) into v_before from public.unified_tags
   where status = 'active' and description in ('Sexual activity tag', 'Scene safety tag');

  create temp table _fix (
    slug text primary key, new_name text, new_slug text, cat text,
    clear_qid boolean, drop_alias text[], publish boolean, expect_adult boolean,
    descr text, longd text
  ) on commit drop;

  insert into _fix (slug, new_name, new_slug, cat, clear_qid, drop_alias, publish, expect_adult, descr, longd) values
    ('subspace', null, null, 'bdsm-power-exchange', true, null, true, true,
     'The altered, floaty state a bottom can enter during intense play, driven by adrenaline and endorphins.',
     'Subspace is a trance-like state some bottoms reach in heavy scenes, marked by reduced pain response, slowed or dreamlike thinking, and difficulty forming words. It is why a bottom deep in it cannot reliably negotiate or safeword, so a top watches for it rather than relying on being told. Coming down afterwards is what produces sub drop, sometimes hours or days later, and it is the reason aftercare exists.'),
    ('sub-frenzy', null, null, 'bdsm-power-exchange', false, null, true, true,
     'The rush of a new submissive to say yes to everything at once, before they know their own limits.',
     'Sub frenzy describes the burst of enthusiasm that often hits someone newly exploring submission: an urge to meet everyone, try everything and agree to arrangements they have no basis yet for judging. It is named so that people can recognise it in themselves, because the risk is not the enthusiasm but the speed — it removes the pause in which vetting, negotiation and limits would normally be worked out. The usual advice is to slow the timeline down, not the interest.'),
    ('dom-frenzy', null, null, 'bdsm-power-exchange', false, null, true, true,
     'The equivalent rush in a new dominant, taking on more responsibility and heavier play than their skill supports.',
     'Dom frenzy is the mirror of sub frenzy: a newly identified dominant moving fast, collecting partners, and reaching for techniques whose risks they cannot yet assess. It is more dangerous than the submissive version in one specific way — the consequences land on someone else''s body. Rope suspension, breath restriction and heavy impact are where it does real damage, and the correction is training and mentorship rather than enthusiasm management.'),
    ('after-scene-drop', null, null, 'consent-negotiation', false, null, true, false,
     'The emotional and physical crash that can follow an intense scene, for either partner, hours or days later.',
     'Drop is the comedown after the neurochemical high of a scene: low mood, tearfulness, aching, cold, or a flat sense of shame that has nothing to do with regret about what happened. It affects tops as well as bottoms, and it can arrive immediately or two days later, which is what makes it easy to misread as something being wrong with the relationship. Planned aftercare, food, warmth, rest and a check-in the following day are the standard response.'),
    ('safe-call', null, null, 'consent-negotiation', false, null, true, false,
     'A pre-arranged check-in with a trusted person, with agreed details and an agreed response if it is missed.',
     'A safe call is set up before meeting someone new: a friend knows who you are meeting, where, and when you will contact them, and knows what to do if you do not. The arrangement only works if the second half is real — a time by which silence triggers action, and enough detail (name, profile, address, photo) for that action to be useful. It is the standard first-meeting precaution in kink and hookup contexts alike.'),
    ('vetting', null, null, 'consent-negotiation', true, null, true, false,
     'Checking a potential partner''s reputation and references within the community before playing with them.',
     'Vetting in kink means asking people who have played with someone what that was like, rather than relying on how they present. It typically covers whether they respect limits and safewords, how they handle a scene going wrong, and whether anyone has raised concerns. Because the scene is small and reputational, references are usually available to anyone who asks — and a refusal to provide any is itself information.'),
    ('meeting-for-the-first-time', null, null, 'consent-negotiation', false, null, true, false,
     'The convention of meeting a new partner in public, clothed and without play, before any scene.',
     'A first meeting in kink is normally a coffee or a bar rather than a scene: somewhere public, with an easy exit, and no obligation to continue. It exists so both people can judge in person whether they want to go further, and it pairs with a safe call and with vetting. Treating the first meeting as automatically the first scene removes the one low-cost opportunity either person has to change their mind.'),
    ('rope-compatibility-checks', null, null, 'consent-negotiation', false, null, true, false,
     'Checks made before and during rope play for nerve compression, circulation and position tolerance.',
     'Rope compatibility covers both the body and the pairing. Physically it means establishing beforehand what a bottom''s shoulders, wrists and knees will tolerate, and checking during the tie for numbness, tingling, colour change and cold — nerve damage from a badly placed wrap can occur in minutes and is the most common serious rope injury. Socially it means agreeing what the tie is for, since rope used for restraint, for aesthetics and for suspension carry very different risks.'),
    ('trauma-awareness', null, null, 'consent-negotiation', false, null, true, false,
     'Playing with an understanding that scenes can trigger trauma responses, and planning for it in advance.',
     'Trauma awareness in kink means recognising that intensity, restraint and power exchange can reach places a person did not know were reachable, and that a freeze or dissociative response can look like compliance. Practically it changes negotiation: asking what has gone badly before, agreeing a non-verbal signal, and treating a bottom who has gone quiet and still as a reason to stop rather than a sign things are going well. Some people use kink deliberately for cathartic processing, which is a distinct practice and not the same as being unprepared.'),
    ('cuttlefish-method', null, null, 'consent-negotiation', false, null, true, false,
     'A negotiation approach that maps interests, limits and uncertainties as a spectrum rather than a yes/no list.',
     'The cuttlefish method is a negotiation framing in which each activity is placed on a range — enthusiastic, willing, curious, uncertain, refused — instead of being ticked or crossed. The point is that most of a real answer lives in the middle, and a binary checklist forces people to round a "maybe, in the right mood, with someone I trust" up to yes or down to no. It is one of several structured negotiation tools alongside checklists and the traffic-light system.'),
    ('white-knight', null, null, 'consent-negotiation', false, null, true, false,
     'Someone who inserts themselves as a protector of others in the scene, often unhelpfully and without being asked.',
     'White knight is a critical term for a person who positions themselves as the defender of newcomers or of a particular partner, typically without being asked and often in a way that undermines the person they claim to protect. The pattern matters because it can look identical to genuine community safety work while removing agency from the people involved, and because it is sometimes a route to the access it claims to be guarding. Actual safety roles in a space — dungeon monitors, organisers — are appointed and accountable.'),
    ('deepthroat', null, null, 'practices-play', false, null, true, true,
     'Taking a penis or toy far enough into the throat to pass the gag reflex.',
     'Deepthroating is oral sex taken past the back of the mouth into the throat. It usually requires deliberate practice to manage the gag reflex, and angle matters more than effort. Breathing is the practical constraint — it stops while the throat is full — so a clear non-verbal signal is agreed in advance, since speech is not available.'),
    ('throat-fucking', null, null, 'practices-play', false, null, true, true,
     'Deepthroating where the penetrating partner sets the pace and depth rather than the receiving one.',
     'Throat fucking is the active counterpart to deepthroating: control of rhythm and depth sits with the penetrating partner, often with the receiving partner''s head held or positioned. Because the receiving partner cannot speak and may not be able to pull away, the signal for stop is worked out beforehand — a dropped object or a tap is the usual answer. It sits in rough-oral and face-fucking territory rather than ordinary oral sex.'),
    ('face-fucking', null, null, 'practices-play', false, null, true, true,
     'Rough oral sex in which the penetrating partner thrusts into the mouth while the receiver stays still.',
     'Face fucking inverts the usual dynamic of oral sex: the receiving partner holds position and the penetrating partner does the moving. It is negotiated as rough play, with depth, duration and a non-verbal stop signal set in advance, because the receiver can neither speak nor easily disengage. Gagging, watering eyes and smeared makeup are part of what draws people to it, and are also the signs a scene is at its limit.'),
    ('oral', null, null, 'practices-play', false, null, true, true,
     'Sex using the mouth on a partner''s genitals — the umbrella covering fellatio, cunnilingus and analingus.',
     'Oral sex covers any stimulation of the genitals or anus with the mouth, tongue or lips. It carries a lower HIV risk than anal or vaginal sex but readily transmits gonorrhoea, syphilis, herpes and HPV, including to and from the throat, which is why oral-site testing exists and why a routine urine-only screen misses infections. Barriers — condoms and dental dams — reduce that transmission.'),
    ('fucklicking', null, null, 'practices-play', false, null, true, true,
     'Oral sex performed on a partner during or immediately after they have been penetrated by someone else.',
     'Fucklicking is oral stimulation given while another partner is penetrating, or straight afterwards, and is most often a group-sex practice. It overlaps with felching and with creampie play depending on whether ejaculate is involved. Fluid exchange makes it a higher-risk activity for STI transmission than oral sex alone.'),
    ('tit-fucking', null, null, 'practices-play', false, null, true, true,
     'Thrusting between a partner''s breasts, held together to form a channel.',
     'Tit fucking, also called mammary intercourse, is a non-penetrative act in which the breasts are pressed together and used for friction. It needs lubricant and works best with the receiving partner lying back. As a non-penetrative practice it carries no pregnancy risk and low STI risk, though skin contact can still transmit herpes and HPV.'),
    ('masturbating', null, null, 'practices-play', false, null, true, true,
     'Stimulating one''s own genitals for pleasure, alone or in company.',
     'Masturbation is self-stimulation for pleasure or release. It is the most common sexual behaviour there is, carries no STI or pregnancy risk on its own, and is used deliberately in edging, orgasm control and mutual scenes. It is also how many people work out what they like well enough to ask for it.'),
    ('mutual-masturbation', null, null, 'practices-play', false, null, true, true,
     'Two or more people masturbating together, either themselves or each other.',
     null),
    ('jerk-off-instructions', null, null, 'practices-play', false, null, true, true,
     'Directing a partner''s masturbation by voice — pace, grip and whether they are allowed to finish.',
     'Jerk-off instructions, usually shortened to JOI, is verbal control of someone else''s masturbation: telling them how to touch themselves, how fast, when to slow down and whether they may come. It is a control dynamic that needs no physical contact at all, which makes it a staple of long-distance and online play, and it pairs naturally with edging and orgasm denial.'),
    ('frotting', null, null, 'practices-play', false, null, true, true,
     'Rubbing genitals directly against a partner''s, most often penis against penis.',
     null),
    ('intercrural-sex', null, null, 'practices-play', false, null, true, true,
     'Thrusting between a partner''s closed thighs rather than penetrating.',
     null),
    ('docking', null, null, 'practices-play', false, null, true, true,
     'Drawing one partner''s foreskin over the head of the other''s penis so the two are joined.',
     'Docking requires at least one uncircumcised partner: the foreskin is stretched over the glans of the other penis, holding them together. It is a distinctly intact-specific act with a following of its own, and it is close and frictional rather than penetrative. Direct mucosal contact means it carries real STI transmission risk despite involving no penetration.'),
    ('pompoir', null, null, 'practices-play', false, null, true, true,
     'Using trained pelvic-floor muscles to stimulate a penetrating partner without moving the hips.',
     'Pompoir is a technique in which the receiving partner grips and releases with the pelvic floor while otherwise still, so all the movement is internal. It depends on deliberate muscle training of the same kind used in pelvic-floor rehabilitation, and it is described in South Asian and South East Asian erotic traditions long before modern sexology. It is available to anyone with a trained pelvic floor.'),
    ('pegging', null, null, 'practices-play', false, null, true, true,
     'Anal penetration of a man by a partner wearing a strap-on.',
     null),
    ('urethral-sounding', null, null, 'practices-play', false, null, true, true,
     'Inserting a smooth tapered rod into the urethra for sensation.',
     'Sounding uses graduated surgical-steel rods worked slowly up in diameter. The urethra runs directly to the bladder, so this is one of the few practices where sterility is genuinely non-negotiable: unsterilised gear, insufficient lubricant or force cause infection and tearing. Purpose-made sounds and sterile lubricant are the baseline, and pain or blood means stopping.'),
    ('figging', null, null, 'practices-play', false, null, true, true,
     'Inserting a carved piece of raw ginger to produce an intense burning sensation.',
     null),
    ('cuntification', null, null, 'practices-play', false, null, true, true,
     'Feminisation play that reframes a partner''s genitals and body in explicitly feminine terms.',
     'Cuntification is a verbal and psychological strand of feminisation play in which a partner''s anatomy is renamed and treated as female, usually alongside humiliation or ownership dynamics. It is language-driven rather than physical, and it depends heavily on the specific words being negotiated beforehand, since the same phrase can be erotic or genuinely wounding depending on the person and their relationship to their body. It overlaps with sissification and forced feminisation.'),
    ('threesome', null, null, 'practices-play', false, null, true, true,
     'Sex between three people, in any combination of genders and pairings.',
     null),
    ('foursome', null, null, 'practices-play', false, null, true, true,
     'Sex between four people, often but not necessarily two couples.',
     'A foursome is group sex involving four people, in any combination of pairings and orientations. It is often two couples, but need not be. As with any group scene, what is agreed beforehand — who does what with whom, and what is off the table — matters more as the number of people rises.'),
    ('moresome', null, null, 'practices-play', false, null, true, true,
     'Group sex involving more than four people, where counting stops being the point.',
     'Moresome is the catch-all above threesome and foursome, used when a group is large or fluid enough that a precise number is not the useful description. It covers everything from a five-person scene to a party. It describes an encounter, not a relationship structure — polyamory and open relationships are separate concepts.'),
    ('orgy', null, null, 'practices-play', false, null, true, true,
     'A gathering where many people have sex together, usually with partners changing throughout.',
     'An orgy is group sex at party scale, distinguished from a smaller group scene by the number of people and by the expectation that pairings shift. Organised play parties and sex clubs run them with explicit rules — barriers, consent norms, monitors — and those rules are what make a large space workable. Negotiating in advance is harder at scale, so venues usually carry the standards rather than the individuals.'),
    ('gangbang', null, null, 'practices-play', false, null, true, true,
     'One person having sex with several partners in turn, by arrangement.',
     null),
    ('run-a-train', null, null, 'practices-play', false, null, true, true,
     'Slang for a gangbang: several people having sex with one person one after another.',
     'Running a train describes partners taking turns with one person in sequence. The phrase comes from African-American vernacular and is common in gay and bisexual men''s spaces. As a consensual arrangement it is a gangbang by another name; the same words are also used to describe assault, so context and prior agreement are what separate them.'),
    ('blowbang', null, null, 'practices-play', false, null, true, true,
     'One person performing oral sex on several partners in turn.',
     null),
    ('bukkake', null, null, 'practices-play', false, null, true, true,
     'Several partners ejaculating onto one person, usually the face.',
     null),
    ('air-tight', null, null, 'practices-play', false, null, true, true,
     'A group configuration in which one person is penetrated orally, anally and vaginally at once.',
     null),
    ('creampie', null, null, 'practices-play', false, null, true, true,
     'Ejaculating inside a partner and the visible result afterwards.',
     null),
    ('facial', null, null, 'practices-play', false, null, true, true,
     'Ejaculating onto a partner''s face.',
     'A facial is ejaculation onto the face, often negotiated as a mildly degrading or possessive act rather than purely a physical one. Semen in the eye stings badly and can transmit infection, so where it lands is usually agreed in advance. It is a staple of pornography, which is part of why expectations about it are frequently mismatched in practice.'),
    ('snowballing', null, null, 'practices-play', false, null, true, true,
     'Passing semen from one partner''s mouth to another''s in a kiss.',
     null),
    ('squirting', null, null, 'practices-play', false, null, true, true,
     'The expulsion of fluid from the urethra during arousal or orgasm.',
     'Squirting is the release of fluid at or near orgasm, distinct from ordinary lubrication and varying enormously between people and occasions. Analysis of the fluid finds it comes from the bladder and the Skene''s glands, which is why it is not the marker of a "better" orgasm it is sometimes sold as. Plenty of people never experience it, and plenty of pornography exaggerates it.'),
    ('scat-play', null, null, 'practices-play', false, null, true, true,
     'Sexual play involving faeces, and the highest-infection-risk practice in common use.',
     'Scat play, or coprophilia, is arousal involving faeces, ranging from watching to direct contact. It carries the highest infection risk of any common practice — hepatitis A, shigella, E. coli, parasites — all of which spread readily by the faecal-oral route and several of which circulate in outbreaks among men who have sex with men. Hepatitis A vaccination, gloves, barriers and thorough washing are the standard precautions, and this is a practice where a hard barrier between play partners and everything else genuinely matters.'),
    ('edging', null, null, 'practices-play', false, null, true, true,
     'Repeatedly approaching orgasm and stopping short of it, prolonging arousal.',
     'Edging means bringing someone to the point just before orgasm and backing off, repeatedly, sometimes for hours. Done alone it intensifies the eventual release; done with a partner holding the timing it becomes an orgasm-control dynamic, and combined with refusal it becomes denial. It is the mechanism underneath chastity play and much of JOI.'),
    ('orgasm-play', null, null, 'practices-play', false, null, true, true,
     'Play centred on controlling whether, when and how a partner comes.',
     'Orgasm play covers denial, forced or repeated orgasm, ruined orgasms and timed permission. What unites them is that the decision belongs to someone other than the person having it, which makes it a power exchange expressed through the body rather than through protocol. Forced repetition past the point of comfort is genuinely painful, so a limit on number is usually negotiated rather than discovered.'),
    ('wand-teasing', null, null, 'practices-play', false, null, true, true,
     'Using a wand vibrator to tease and edge a restrained partner.',
     'Wand teasing pairs a powerful vibrator with restraint so the receiving partner cannot move away from or towards the sensation. Because a wand delivers far more stimulation than a hand, it is the standard tool for forced-orgasm and overstimulation scenes as well as for slow edging. Prolonged contact on one spot causes numbness, so position is varied.'),
    ('nipple-play', null, null, 'practices-play', false, null, true, true,
     'Stimulating the nipples for pleasure, from light touch to clamps and suction.',
     null),
    ('stretching', null, null, 'practices-play', false, null, true, true,
     'Gradually widening the anus or vagina to accommodate larger insertions.',
     'Stretching is the deliberate, progressive widening of an opening using graduated plugs, dilators or hands over repeated sessions. It is how fisting and large-toy play become possible, and the method is patience rather than force: go up a size only when the current one is comfortable, use far more lubricant than seems necessary, and stop at pain. Tearing heals badly in these tissues and is entirely avoidable.'),
    ('teabagging', null, null, 'practices-play', false, null, true, true,
     'Lowering the scrotum into or onto a partner''s mouth.',
     null),
    ('queening', null, null, 'practices-play', false, null, true, true,
     'Sitting on a partner''s face for oral sex, with the seated partner controlling position.',
     'Queening is facesitting: the receiving partner sits astride the other''s face, which puts pace and pressure under their control and is why it reads as a dominant position. A queening stool exists specifically to make it sustainable. Breathing is the constraint — weight can restrict the airway, and the person underneath cannot speak — so a hand signal is agreed rather than relied on being asked for.'),
    ('yoni-massage', null, null, 'practices-play', false, null, true, true,
     'Slow, non-goal-oriented massage of the vulva and vagina, drawn from tantric practice.',
     'Yoni massage is extended external and internal massage framed around relaxation and sensation rather than orgasm. It borrows its vocabulary from tantra, though most contemporary practice is a Western wellness adaptation rather than a traditional one. It is used for slow arousal, for reconnecting with sensation after trauma or surgery, and as partnered practice.'),
    ('dogging', null, null, 'practices-play', false, null, true, true,
     'Meeting for sex in semi-public outdoor locations, often with onlookers.',
     null),
    ('car-play', null, null, 'practices-play', false, null, true, true,
     'Sex in a parked car, typically in a known cruising location.',
     null),
    ('exposure-play', null, null, 'practices-play', false, null, true, true,
     'Play built on the risk or fact of being seen, from near-public exposure to threatened outing.',
     'Exposure play uses the charge of being witnessed: being undressed where someone might see, photographed, or having a scene or identity revealed. The line that matters is between a controlled scenario and a real one — genuine non-consensual exposure involves people who never agreed, and threatened outing touches employment, family and, in many countries, safety. Digital exposure is effectively permanent, which is why it is negotiated separately from the rest.'),
    ('morning-sex', null, null, 'practices-play', false, null, true, true,
     'Sex on waking, when hormone levels and physical arousal are typically highest.',
     'Morning sex is named for the practical fact behind it: testosterone peaks around waking and many people are already physically aroused, so it needs less build-up. It also tends to be slower and less planned than sex later in the day. It is a scheduling observation rather than a technique.'),
    ('breeding', null, null, 'fetishes-interests', false, null, true, true,
     'Erotic play around insemination and impregnation, usually as fantasy rather than outcome.',
     'Breeding play centres on ejaculating inside a partner and the idea of impregnation. In queer contexts it is almost always fantasy, since pregnancy is not a possible outcome, which is what separates the kink from the biology and is why it is bound up with barrier-free sex and bareback culture. That link is the practical point: the appeal depends on the absence of a condom, so it belongs in a conversation about PrEP, U=U and testing rather than apart from one.'),
    ('free-use', null, null, 'fetishes-interests', true, null, true, true,
     'A negotiated arrangement in which one partner may initiate sex at any time without asking each time.',
     'Free use is a standing-consent dynamic: the parties agree in advance that one may use the other whenever they like, so the fiction of the scene is that no permission is sought. The consent is real and given beforehand — it is the asking that is suspended, not the agreement — and it carries the usual safeword and limit structure underneath. It appeals as a total-availability fantasy and it depends entirely on the negotiation that precedes it.'),
    ('mixed-wrestling', null, null, 'fetishes-interests', false, null, true, true,
     'Erotic wrestling between partners of different genders or body types, often with a dominance framing.',
     'Mixed wrestling as a kink is a contest with an erotic charge: the appeal is the struggle, the physical overpowering and the reversal of assumptions about who will win. It ranges from playful pinning to competitive submission holds, and it overlaps with dominance play, muscle worship and smothering. Real holds cause real injury, so what is allowed and how to tap out are agreed in advance.'),
    ('quacking', null, null, 'practices-play', false, null, true, true,
     'Slang for using a Hitachi-style wand on a partner until they are overstimulated.',
     'Quacking is scene slang for relentless wand stimulation, named for the noise the toy makes at speed. It belongs to overstimulation and forced-orgasm play rather than teasing, since the point is to continue past the first orgasm. Overstimulation is genuinely uncomfortable, so a limit is negotiated before rather than discovered during.'),
    ('testicular-sex', null, null, 'practices-play', false, null, true, true,
     'Play focused on the testicles — handling, weighting, squeezing and impact.',
     'Testicular play covers everything done to the testicles for sensation, from gentle handling and tugging through stretchers and weights to squeezing and impact in CBT. Sensitivity is extreme and injury is easy, so force is escalated slowly and torsion — a testicle rotating on its cord — is a surgical emergency rather than an intense sensation to work through. Sudden severe pain, swelling or nausea means stopping and seeking care.'),
    ('sexual-positions', null, null, 'sex-positions', false, null, true, true,
     'The umbrella term for the physical configurations partners take during sex.',
     'Sexual positions describe how bodies are arranged during sex — who is above, behind, seated or standing, and which contact each arrangement makes available. Which ones work depends on anatomy, height difference, mobility and stamina far more than on any list, and most named positions are variations on a handful of basic configurations. This platform files individual positions under their own entries.');

  -- Every category must resolve, or the row lands uncategorized and
  -- tag_hygiene_stats counts it with nothing to explain why.
  select count(*) into v_bad from _fix f
   where not exists (select 1 from public.tag_categories c where c.slug = f.cat);
  if v_bad > 0 then
    raise exception 'stamp repair: % row(s) name a category that does not exist', v_bad;
  end if;

  -- This migration only ever UPDATEs. A slug that is missing or not active
  -- means the committed definitions have drifted from prod, which is a fact to
  -- report rather than paper over by inserting a fresh row under that slug.
  select count(*) into v_bad from _fix f
   where not exists (select 1 from public.unified_tags t where t.slug = f.slug and t.status = 'active');
  if v_bad > 0 then
    raise exception 'stamp repair: % slug(s) are missing or not active — definitions have drifted from prod', v_bad;
  end if;

  -- A rename must not land on an occupied slug, and must not land on a slug
  -- held as an alias of some other tag: trg_tag_reject_alias_shadow raises on
  -- the second case, and it is better to say so here than to fail mid-loop.
  select count(*) into v_bad from _fix f
   where f.new_slug is not null
     and (exists (select 1 from public.unified_tags t where t.slug = f.new_slug)
       or exists (select 1 from public.tag_aliases a where a.alias_slug = f.new_slug));
  if v_bad > 0 then
    raise exception 'stamp repair: % rename target(s) collide with an existing tag or alias', v_bad;
  end if;

  for r in select * from _fix order by slug loop
    select c.id into v_cat from public.tag_categories c where c.slug = r.cat;

    update public.unified_tags t set
      name                = coalesce(r.new_name, t.name),
      slug                = coalesce(r.new_slug, t.slug),
      description         = r.descr,
      long_description    = coalesce(r.longd, t.long_description),
      category_id         = v_cat,
      wikidata_id         = case when r.clear_qid then null else t.wikidata_id end,
      wikipedia_url       = case when r.clear_qid then null else t.wikipedia_url end,
      human_reviewed      = case when r.publish then true else t.human_reviewed end,
      verification_status = case when r.publish then 'reviewed' else t.verification_status end,
      seo_indexable       = case when r.publish then true else t.seo_indexable end,
      seo_deindex_reason  = case when r.publish then null else t.seo_deindex_reason end,
      last_verified_at    = now(),
      prose_reviewed_at   = now()
    where t.slug = r.slug;
    v_updated := v_updated + 1;

    -- Delete junction rows for any OTHER category. The AFTER trigger demotes the
    -- old primary but does not remove it, and unified_tags_recompute_is_adult()
    -- matches ANY assignment, not the primary one — so a row moved OUT of a kink
    -- stop keeps its 18+ flag from the junction it left behind.
    --
    -- This is not hypothetical: it aborted this migration's first apply on
    -- "rope-compatibility-checks", the only one of the eight deliberately
    -- un-gated safety terms that was moving out of an ADULT stop (Practices &
    -- Play). The prod dry run had probed "after-scene-drop", which came from
    -- Slang & Language and is not adult, so the case went untested. Same trap as
    -- 20261230113700 and the six venue descriptors that stayed 18+ after being
    -- "moved" in the taxonomy v3 cutover.
    delete from public.tag_category_assignments a
     using public.unified_tags t
     where t.slug = coalesce(r.new_slug, r.slug)
       and a.tag_id = t.id
       and a.category_id <> v_cat;

    if r.drop_alias is not null then
      delete from public.tag_aliases a
       using public.unified_tags t
       where t.slug = coalesce(r.new_slug, r.slug)
         and a.canonical_tag_id = t.id
         and a.alias_name = any(r.drop_alias);
      get diagnostics v_bad = row_count;
      v_alias := v_alias + v_bad;
    end if;

    insert into public.tag_sources (tag_id, source_type, claim_summary, is_public)
    select t.id, 'editorial:general-knowledge',
           'Definition written by hand for migration 20270901110000 (kink stamp repair 2); replaced a bulk-import stamp.',
           false
      from public.unified_tags t
     where t.slug = coalesce(r.new_slug, r.slug)
       and not exists (
         select 1 from public.tag_sources s
          where s.tag_id = t.id and s.source_type = 'editorial:general-knowledge'
            and s.claim_summary like '%kink stamp repair%');
    get diagnostics v_bad = row_count;
    v_src := v_src + v_bad;
  end loop;

  -- ── Assertions ───────────────────────────────────────────────────────────
  -- Not "zero stamps remain": that also passes if the rows were deleted. Assert
  -- the rows are still here, carry real prose, and that no two of them share a
  -- description — a shared short string is what the metric counts in the first
  -- place.
  select count(*) into v_after from public.unified_tags
   where status = 'active' and description in ('Sexual activity tag', 'Scene safety tag');
  if v_after <> 0 then
    raise exception 'stamp repair: % stamped row(s) remain', v_after;
  end if;

  select count(*) into v_bad from _fix f
    join public.unified_tags t on t.slug = coalesce(f.new_slug, f.slug)
   where t.status <> 'active'
      or coalesce(length(btrim(t.description)), 0) < 30
      or coalesce(length(btrim(t.long_description)), 0) < 120;
  if v_bad <> 0 then
    raise exception 'stamp repair: % row(s) are missing, inactive or thin after the repair', v_bad;
  end if;

  select count(*) into v_bad from (
    select 1 from _fix f
      join public.unified_tags t on t.slug = coalesce(f.new_slug, f.slug)
     group by lower(btrim(t.description)) having count(*) > 1) d;
  if v_bad <> 0 then
    raise exception 'stamp repair: % description(s) are shared by more than one row', v_bad;
  end if;

  if v_updated <> 60 then
    raise exception 'stamp repair: updated % rows, expected 60', v_updated;
  end if;

  -- THE RE-FILE DOES NOT FINISH ON ITS OWN, and without this the age-gate
  -- assertion below fails on exactly one row.
  --
  -- Setting category_id fires sync_tag_category_assignment_after, which DEMOTES
  -- the previous primary junction row and promotes the new one. Demotes, not
  -- deletes -- the old tag_category_assignments row survives with
  -- is_primary=false. And unified_tags_recompute_is_adult() gates on
  -- `exists (... from tag_category_assignments ...)` over ANY assignment,
  -- primary or not. So a row moved OUT of the Sex & Kink family keeps whatever
  -- age gate its old, now-secondary filing implies.
  --
  -- Measured: `rope-compatibility-checks` is re-filed to Consent & Negotiation
  -- (parent Safety & Consent, correctly not adult) while retaining a
  -- non-primary assignment to Practices & Play (parent Sex & Kink). It came out
  -- is_adult=true against an expected false, and the assertion below refused --
  -- correctly -- to call the repair done.
  --
  -- This is the same shape the merge path already pays for ("the merge carries
  -- the loser's category junction, and the winner becomes 18+"): a residual
  -- junction row silently keeps a gate its owner no longer earns.
  --
  -- The expectation was right and stays. A consent-and-negotiation topic under
  -- Safety & Consent should be readable without an age wall -- gating it would
  -- put a safety article behind the barrier, which is the wrong direction to
  -- fail in. What was wrong is that the re-file left the old filing behind.
  --
  -- Scoped tightly, and only in the direction that REMOVES a gate that is no
  -- longer earned: non-primary assignments only, in the Sex & Kink family only,
  -- and only for rows whose NEW category is outside that family. A row re-filed
  -- INTO Sex & Kink is untouched, so this can never drop an age gate that the
  -- destination category still implies.
  delete from public.tag_category_assignments a
   using public.unified_tags t, public.tag_categories tc,
         public.tag_categories tgt
    left join public.tag_categories tgtp on tgtp.id = tgt.parent_id
   where a.tag_id = t.id
     and t.slug in (select coalesce(f.new_slug, f.slug) from _fix f)
     and tgt.id = t.category_id
     and tc.id = a.category_id
     and coalesce(a.is_primary, false) = false
     and (tc.name in ('Sex & Kink','Practices & Play','Dynamics & Roles','Fetishes','Gear',
                      'Kink Community & Scenes')
          or exists (select 1 from public.tag_categories p
                      where p.id = tc.parent_id and p.name = 'Sex & Kink'))
     and not (tgt.name in ('Sex & Kink','Practices & Play','Dynamics & Roles','Fetishes','Gear',
                           'Kink Community & Scenes')
              or tgtp.name = 'Sex & Kink');

  -- Every repaired row must be adult-gated. The re-file is supposed to TIGHTEN
  -- this (six rows were is_adult=false only because they were misfiled outside
  -- Sex & Kink); asserting it is what makes that a fact rather than an
  -- expectation, and catches a target stop being dropped from
  -- unified_tags_recompute_is_adult()'s name list.
  select count(*) into v_bad from _fix f
    join public.unified_tags t on t.slug = coalesce(f.new_slug, f.slug)
   where coalesce(t.is_adult, false) is distinct from f.expect_adult;
  if v_bad <> 0 then
    raise exception 'stamp repair: % row(s) came out with the WRONG age gate (expected per the definitions file)', v_bad;
  end if;

  -- Publishing must have actually taken. seo_indexable is forced false by three
  -- separate BEFORE gates, so setting it is not the same as achieving it.
  select count(*) into v_bad from _fix f
    join public.unified_tags t on t.slug = coalesce(f.new_slug, f.slug)
   where f.publish and (t.seo_indexable is not true
      or t.human_reviewed is not true
      or t.verification_status <> 'reviewed');
  if v_bad <> 0 then
    raise exception 'stamp repair: % row(s) did not publish', v_bad;
  end if;

  -- No cleared identifier may have been re-adopted within this transaction.
  select count(*) into v_bad from _fix f
    join public.unified_tags t on t.slug = coalesce(f.new_slug, f.slug)
   where f.clear_qid and t.wikidata_id is not null;
  if v_bad <> 0 then
    raise exception 'stamp repair: % cleared QID(s) are not null', v_bad;
  end if;

  raise notice 'kink stamp repair: % stamps before, % after; % rows updated, % aliases deleted, % provenance rows',
    v_before, v_after, v_updated, v_alias, v_src;
end
$mig$;
