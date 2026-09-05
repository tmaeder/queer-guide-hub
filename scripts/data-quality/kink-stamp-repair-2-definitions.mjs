/**
 * Hand-written replacements for the remaining 60 stamped kink glossary rows:
 * 49 carrying `'Sexual activity tag'` and 11 carrying `'Scene safety tag'`.
 *
 * This finishes what 20270901100000 started. `placeholder_description_active`
 * decomposes into exactly four stamps and no others:
 *
 *   Toys tag             41   repaired by 20270901100000
 *   Philia tag           20   repaired by 20270901100000
 *   Sexual activity tag  49   here
 *   Scene safety tag     11   here
 *                       ---
 *                       121   the whole metric
 *
 * so this migration takes it to ZERO and the baseline drops with it.
 *
 * THE SAFETY ELEVEN ARE THE WORST ROWS IN THE CORPUS, and they are the reason
 * this is not merely tidy-up. These are the terms a reader looks up when they
 * are trying not to get hurt, and five of them published prose about something
 * else entirely:
 *
 *   subspace     "a fictional or hypothetical property of space-time … used in
 *                science fiction" (QID Q6471641). The actual concept is the
 *                altered, endorphin-driven state a bottom can enter, and it is
 *                the reason drop and aftercare exist.
 *   sub-frenzy   "an event where people who identify as submissive can gather
 *                and connect" — described as a PARTY. It names a new
 *                submissive's rush to consent to everything at once, which is
 *                a warning, not a social occasion.
 *   dom-frenzy   "an event that caters to individuals interested in BDSM" —
 *                same inversion, same harm.
 *   vetting      the generic employment background-check article (Q7923820).
 *   after-scene  described the comedown after Pride events and parties rather
 *                than sub/dom drop after a scene.
 *
 * A term whose entire purpose is to warn someone, published as the name of a
 * party, is worse than a blank page. Two more (cuttlefish-method,
 * white-knight) had no body at all.
 *
 * THE OTHER 49 ARE THE SAME THREE FAILURES AS THE FIRST COHORT.
 *
 *   Wrong entity / generic sense (14): facial -> a skincare treatment;
 *   foursome -> "a type of golf match"; edging -> "a gardening tool, a
 *   climbing technique"; face-fucking -> "Face Fucking Inc., an adult film
 *   production company"; free-use -> "Free content refers to creative works"
 *   (Q14075, the same wrong QID cleared for the Toys cohort); queening ->
 *   drag performance art; stretching -> "a form of physical exercise where a
 *   muscle is stretched"; oral -> "something related to the mouth";
 *   mixed-wrestling -> competitive wrestling; breeding -> "the biological
 *   process of sexual reproduction"; testicular-sex -> "the sex assigned at
 *   birth based on the presence of testes", which is not what the term means
 *   and is a claim about intersex and trans people this platform must not make
 *   by accident.
 *
 *   Empty (12): cuntification, deepthroat, docking, fucklicking,
 *   jerk-off-instructions, masturbating, orgy, quacking, run-a-train,
 *   sexual-positions, plus cuttlefish-method and white-knight above.
 *
 *   Kind mismatch: 27 acts filed under Fetishes (an act is not an attraction),
 *   7 under Slang & Language, and `sexual-positions` under ORIENTATION.
 *
 * AGE GATING IS AN EXPLICIT DECISION HERE, NOT A SIDE EFFECT.
 * `unified_tags_recompute_is_adult()` derives the flag from the junction, and
 * `Consent & Negotiation` is deliberately NOT in its adult set while every
 * Sex & Kink stop is. So filing a safety term there un-gates it — which is
 * correct and intended: `safe-call`, `vetting`, `trauma-awareness` and
 * `after-scene-drop` are things a person needs to be able to read before they
 * are in the room, and an age wall on a safety practice is a harm of its own.
 *
 * `subspace`, `sub-frenzy` and `dom-frenzy` deliberately STAY in Dynamics &
 * Roles and stay 18+: they are states inside a D/s dynamic, that is where a
 * reader looks for them, and un-gating them buys nothing. The migration
 * asserts the resulting adult flag per row against this file rather than
 * assuming either direction.
 *
 * VOICE: `supabase/functions/_shared/tag-style.ts` TAG_STYLE_SYSTEM — direct,
 * factual, queer-first, no second person, no consent boilerplate. Where a term
 * carries a REAL and specific risk (breath, scat, sounding, frenzy, drop) that
 * risk is stated concretely; generic "communicate and prioritise consent"
 * padding is exactly what was removed.
 *
 * Fields are identical to kink-stamp-repair-definitions.mjs; see that file.
 */

/** @type {Array<{slug:string,name?:string,newSlug?:string,cat:string,desc:string,long:string|null,clearQid?:boolean,dropAlias?:string[],publish:boolean,note?:string}>} */
export const REPAIRS = [
  // ── Scene safety (11) ───────────────────────────────────────────────────
  {
    slug: 'subspace',
    cat: 'bdsm-power-exchange',
    desc: 'The altered, floaty state a bottom can enter during intense play, driven by adrenaline and endorphins.',
    long:
      'Subspace is a trance-like state some bottoms reach in heavy scenes, marked by reduced pain response, slowed or dreamlike thinking, and difficulty forming words. It is why a bottom deep in it cannot reliably negotiate or safeword, so a top watches for it rather than relying on being told. Coming down afterwards is what produces sub drop, sometimes hours or days later, and it is the reason aftercare exists.',
    clearQid: true,
    publish: true,
    note: 'Carried Q6471641 and a body describing subspace as a science-fiction property of space-time. QID cleared, not re-resolved.',
  },
  {
    slug: 'sub-frenzy',
    cat: 'bdsm-power-exchange',
    desc: 'The rush of a new submissive to say yes to everything at once, before they know their own limits.',
    long:
      'Sub frenzy describes the burst of enthusiasm that often hits someone newly exploring submission: an urge to meet everyone, try everything and agree to arrangements they have no basis yet for judging. It is named so that people can recognise it in themselves, because the risk is not the enthusiasm but the speed — it removes the pause in which vetting, negotiation and limits would normally be worked out. The usual advice is to slow the timeline down, not the interest.',
    publish: true,
    note: 'Previous body described it as "an event where people who identify as submissive can gather" — a warning term published as a party listing.',
  },
  {
    slug: 'dom-frenzy',
    cat: 'bdsm-power-exchange',
    desc: 'The equivalent rush in a new dominant, taking on more responsibility and heavier play than their skill supports.',
    long:
      'Dom frenzy is the mirror of sub frenzy: a newly identified dominant moving fast, collecting partners, and reaching for techniques whose risks they cannot yet assess. It is more dangerous than the submissive version in one specific way — the consequences land on someone else\'s body. Rope suspension, breath restriction and heavy impact are where it does real damage, and the correction is training and mentorship rather than enthusiasm management.',
    publish: true,
    note: 'Previous body described it as "an event that caters to individuals interested in BDSM".',
  },
  {
    slug: 'after-scene-drop',
    cat: 'consent-negotiation',
    desc: 'The emotional and physical crash that can follow an intense scene, for either partner, hours or days later.',
    long:
      'Drop is the comedown after the neurochemical high of a scene: low mood, tearfulness, aching, cold, or a flat sense of shame that has nothing to do with regret about what happened. It affects tops as well as bottoms, and it can arrive immediately or two days later, which is what makes it easy to misread as something being wrong with the relationship. Planned aftercare, food, warmth, rest and a check-in the following day are the standard response.',
    publish: true,
    note: 'Previous body described the comedown after Pride events and parties. Moves to Consent & Negotiation, which un-gates it — deliberate, see the file header.',
  },
  {
    slug: 'safe-call',
    cat: 'consent-negotiation',
    desc: 'A pre-arranged check-in with a trusted person, with agreed details and an agreed response if it is missed.',
    long:
      'A safe call is set up before meeting someone new: a friend knows who you are meeting, where, and when you will contact them, and knows what to do if you do not. The arrangement only works if the second half is real — a time by which silence triggers action, and enough detail (name, profile, address, photo) for that action to be useful. It is the standard first-meeting precaution in kink and hookup contexts alike.',
    publish: true,
  },
  {
    slug: 'vetting',
    cat: 'consent-negotiation',
    desc: 'Checking a potential partner\'s reputation and references within the community before playing with them.',
    long:
      'Vetting in kink means asking people who have played with someone what that was like, rather than relying on how they present. It typically covers whether they respect limits and safewords, how they handle a scene going wrong, and whether anyone has raised concerns. Because the scene is small and reputational, references are usually available to anyone who asks — and a refusal to provide any is itself information.',
    clearQid: true,
    publish: true,
    note: 'Carried Q7923820 and the generic employment background-check article.',
  },
  {
    slug: 'meeting-for-the-first-time',
    cat: 'consent-negotiation',
    desc: 'The convention of meeting a new partner in public, clothed and without play, before any scene.',
    long:
      'A first meeting in kink is normally a coffee or a bar rather than a scene: somewhere public, with an easy exit, and no obligation to continue. It exists so both people can judge in person whether they want to go further, and it pairs with a safe call and with vetting. Treating the first meeting as automatically the first scene removes the one low-cost opportunity either person has to change their mind.',
    publish: true,
  },
  {
    slug: 'rope-compatibility-checks',
    cat: 'consent-negotiation',
    desc: 'Checks made before and during rope play for nerve compression, circulation and position tolerance.',
    long:
      'Rope compatibility covers both the body and the pairing. Physically it means establishing beforehand what a bottom\'s shoulders, wrists and knees will tolerate, and checking during the tie for numbness, tingling, colour change and cold — nerve damage from a badly placed wrap can occur in minutes and is the most common serious rope injury. Socially it means agreeing what the tie is for, since rope used for restraint, for aesthetics and for suspension carry very different risks.',
    publish: true,
  },
  {
    slug: 'trauma-awareness',
    cat: 'consent-negotiation',
    desc: 'Playing with an understanding that scenes can trigger trauma responses, and planning for it in advance.',
    long:
      'Trauma awareness in kink means recognising that intensity, restraint and power exchange can reach places a person did not know were reachable, and that a freeze or dissociative response can look like compliance. Practically it changes negotiation: asking what has gone badly before, agreeing a non-verbal signal, and treating a bottom who has gone quiet and still as a reason to stop rather than a sign things are going well. Some people use kink deliberately for cathartic processing, which is a distinct practice and not the same as being unprepared.',
    publish: true,
  },
  {
    slug: 'cuttlefish-method',
    cat: 'consent-negotiation',
    desc: 'A negotiation approach that maps interests, limits and uncertainties as a spectrum rather than a yes/no list.',
    long:
      'The cuttlefish method is a negotiation framing in which each activity is placed on a range — enthusiastic, willing, curious, uncertain, refused — instead of being ticked or crossed. The point is that most of a real answer lives in the middle, and a binary checklist forces people to round a "maybe, in the right mood, with someone I trust" up to yes or down to no. It is one of several structured negotiation tools alongside checklists and the traffic-light system.',
    publish: true,
    note: 'Had no body at all.',
  },
  {
    slug: 'white-knight',
    cat: 'consent-negotiation',
    desc: 'Someone who inserts themselves as a protector of others in the scene, often unhelpfully and without being asked.',
    long:
      'White knight is a critical term for a person who positions themselves as the defender of newcomers or of a particular partner, typically without being asked and often in a way that undermines the person they claim to protect. The pattern matters because it can look identical to genuine community safety work while removing agency from the people involved, and because it is sometimes a route to the access it claims to be guarding. Actual safety roles in a space — dungeon monitors, organisers — are appointed and accountable.',
    publish: true,
    note: 'Had no body at all.',
  },

  // ── Acts: oral ──────────────────────────────────────────────────────────
  {
    slug: 'deepthroat',
    cat: 'practices-play',
    desc: 'Taking a penis or toy far enough into the throat to pass the gag reflex.',
    long:
      'Deepthroating is oral sex taken past the back of the mouth into the throat. It usually requires deliberate practice to manage the gag reflex, and angle matters more than effort. Breathing is the practical constraint — it stops while the throat is full — so a clear non-verbal signal is agreed in advance, since speech is not available.',
    publish: true,
  },
  {
    slug: 'throat-fucking',
    cat: 'practices-play',
    desc: 'Deepthroating where the penetrating partner sets the pace and depth rather than the receiving one.',
    long:
      'Throat fucking is the active counterpart to deepthroating: control of rhythm and depth sits with the penetrating partner, often with the receiving partner\'s head held or positioned. Because the receiving partner cannot speak and may not be able to pull away, the signal for stop is worked out beforehand — a dropped object or a tap is the usual answer. It sits in rough-oral and face-fucking territory rather than ordinary oral sex.',
    publish: true,
  },
  {
    slug: 'face-fucking',
    cat: 'practices-play',
    desc: 'Rough oral sex in which the penetrating partner thrusts into the mouth while the receiver stays still.',
    long:
      'Face fucking inverts the usual dynamic of oral sex: the receiving partner holds position and the penetrating partner does the moving. It is negotiated as rough play, with depth, duration and a non-verbal stop signal set in advance, because the receiver can neither speak nor easily disengage. Gagging, watering eyes and smeared makeup are part of what draws people to it, and are also the signs a scene is at its limit.',
    publish: true,
    note: 'Previous body described "Face Fucking Inc., an adult film production company".',
  },
  {
    slug: 'oral',
    cat: 'practices-play',
    desc: 'Sex using the mouth on a partner\'s genitals — the umbrella covering fellatio, cunnilingus and analingus.',
    long:
      'Oral sex covers any stimulation of the genitals or anus with the mouth, tongue or lips. It carries a lower HIV risk than anal or vaginal sex but readily transmits gonorrhoea, syphilis, herpes and HPV, including to and from the throat, which is why oral-site testing exists and why a routine urine-only screen misses infections. Barriers — condoms and dental dams — reduce that transmission.',
    publish: true,
    note: 'Previous body: "The term oral refers to something related to the mouth."',
  },
  {
    slug: 'fucklicking',
    cat: 'practices-play',
    desc: 'Oral sex performed on a partner during or immediately after they have been penetrated by someone else.',
    long:
      'Fucklicking is oral stimulation given while another partner is penetrating, or straight afterwards, and is most often a group-sex practice. It overlaps with felching and with creampie play depending on whether ejaculate is involved. Fluid exchange makes it a higher-risk activity for STI transmission than oral sex alone.',
    publish: true,
    note: 'Had no body at all.',
  },
  {
    slug: 'tit-fucking',
    cat: 'practices-play',
    desc: 'Thrusting between a partner\'s breasts, held together to form a channel.',
    long:
      'Tit fucking, also called mammary intercourse, is a non-penetrative act in which the breasts are pressed together and used for friction. It needs lubricant and works best with the receiving partner lying back. As a non-penetrative practice it carries no pregnancy risk and low STI risk, though skin contact can still transmit herpes and HPV.',
    publish: true,
  },

  // ── Acts: manual and frictional ─────────────────────────────────────────
  {
    slug: 'masturbating',
    cat: 'practices-play',
    desc: 'Stimulating one\'s own genitals for pleasure, alone or in company.',
    long:
      'Masturbation is self-stimulation for pleasure or release. It is the most common sexual behaviour there is, carries no STI or pregnancy risk on its own, and is used deliberately in edging, orgasm control and mutual scenes. It is also how many people work out what they like well enough to ask for it.',
    publish: true,
    note: 'Had no body at all.',
  },
  {
    slug: 'mutual-masturbation',
    cat: 'practices-play',
    desc: 'Two or more people masturbating together, either themselves or each other.',
    long: null,
    publish: true,
    note: 'Existing body is accurate; only the stamp is replaced.',
  },
  {
    slug: 'jerk-off-instructions',
    cat: 'practices-play',
    desc: 'Directing a partner\'s masturbation by voice — pace, grip and whether they are allowed to finish.',
    long:
      'Jerk-off instructions, usually shortened to JOI, is verbal control of someone else\'s masturbation: telling them how to touch themselves, how fast, when to slow down and whether they may come. It is a control dynamic that needs no physical contact at all, which makes it a staple of long-distance and online play, and it pairs naturally with edging and orgasm denial.',
    publish: true,
    note: 'Had no body at all.',
  },
  {
    slug: 'frotting',
    cat: 'practices-play',
    desc: 'Rubbing genitals directly against a partner\'s, most often penis against penis.',
    long: null,
    publish: true,
    note: 'Existing body is accurate; only the stamp is replaced.',
  },
  {
    slug: 'intercrural-sex',
    cat: 'practices-play',
    desc: 'Thrusting between a partner\'s closed thighs rather than penetrating.',
    long: null,
    publish: true,
    note: 'Existing body is accurate; only the stamp is replaced.',
  },
  {
    slug: 'docking',
    cat: 'practices-play',
    desc: 'Drawing one partner\'s foreskin over the head of the other\'s penis so the two are joined.',
    long:
      'Docking requires at least one uncircumcised partner: the foreskin is stretched over the glans of the other penis, holding them together. It is a distinctly intact-specific act with a following of its own, and it is close and frictional rather than penetrative. Direct mucosal contact means it carries real STI transmission risk despite involving no penetration.',
    publish: true,
    note: 'Had no body at all.',
  },
  {
    slug: 'pompoir',
    cat: 'practices-play',
    desc: 'Using trained pelvic-floor muscles to stimulate a penetrating partner without moving the hips.',
    long:
      'Pompoir is a technique in which the receiving partner grips and releases with the pelvic floor while otherwise still, so all the movement is internal. It depends on deliberate muscle training of the same kind used in pelvic-floor rehabilitation, and it is described in South Asian and South East Asian erotic traditions long before modern sexology. It is available to anyone with a trained pelvic floor.',
    publish: true,
    note: 'Previous body framed it as something "a woman uses … to stimulate a man", which is neither necessary nor how the technique works.',
  },

  // ── Acts: anal and penetrative ──────────────────────────────────────────
  {
    slug: 'pegging',
    cat: 'practices-play',
    desc: 'Anal penetration of a man by a partner wearing a strap-on.',
    long: null,
    publish: true,
    note: 'Existing body is accurate; only the stamp is replaced.',
  },
  {
    slug: 'urethral-sounding',
    cat: 'practices-play',
    desc: 'Inserting a smooth tapered rod into the urethra for sensation.',
    long:
      'Sounding uses graduated surgical-steel rods worked slowly up in diameter. The urethra runs directly to the bladder, so this is one of the few practices where sterility is genuinely non-negotiable: unsterilised gear, insufficient lubricant or force cause infection and tearing. Purpose-made sounds and sterile lubricant are the baseline, and pain or blood means stopping.',
    publish: true,
  },
  {
    slug: 'figging',
    cat: 'practices-play',
    desc: 'Inserting a carved piece of raw ginger to produce an intense burning sensation.',
    long: null,
    publish: true,
    note: 'Existing body is accurate; only the stamp is replaced. Re-filed from Dynamics & Roles — figging is a practice, not a role.',
  },
  {
    slug: 'cuntification',
    cat: 'practices-play',
    desc: 'Feminisation play that reframes a partner\'s genitals and body in explicitly feminine terms.',
    long:
      'Cuntification is a verbal and psychological strand of feminisation play in which a partner\'s anatomy is renamed and treated as female, usually alongside humiliation or ownership dynamics. It is language-driven rather than physical, and it depends heavily on the specific words being negotiated beforehand, since the same phrase can be erotic or genuinely wounding depending on the person and their relationship to their body. It overlaps with sissification and forced feminisation.',
    publish: true,
    note: 'Had no body at all.',
  },

  // ── Acts: group ─────────────────────────────────────────────────────────
  {
    slug: 'threesome',
    cat: 'practices-play',
    desc: 'Sex between three people, in any combination of genders and pairings.',
    long: null,
    publish: true,
    note: 'Existing body is accurate; only the stamp is replaced.',
  },
  {
    slug: 'foursome',
    cat: 'practices-play',
    desc: 'Sex between four people, often but not necessarily two couples.',
    long:
      'A foursome is group sex involving four people, in any combination of pairings and orientations. It is often two couples, but need not be. As with any group scene, what is agreed beforehand — who does what with whom, and what is off the table — matters more as the number of people rises.',
    publish: true,
    note: 'Previous body opened "A foursome can refer to a type of golf match".',
  },
  {
    slug: 'moresome',
    cat: 'practices-play',
    desc: 'Group sex involving more than four people, where counting stops being the point.',
    long:
      'Moresome is the catch-all above threesome and foursome, used when a group is large or fluid enough that a precise number is not the useful description. It covers everything from a five-person scene to a party. It describes an encounter, not a relationship structure — polyamory and open relationships are separate concepts.',
    publish: true,
    note: 'Previous body defined it as "a type of non-monogamous relationship", conflating a scene with a relationship structure.',
  },
  {
    slug: 'orgy',
    cat: 'practices-play',
    desc: 'A gathering where many people have sex together, usually with partners changing throughout.',
    long:
      'An orgy is group sex at party scale, distinguished from a smaller group scene by the number of people and by the expectation that pairings shift. Organised play parties and sex clubs run them with explicit rules — barriers, consent norms, monitors — and those rules are what make a large space workable. Negotiating in advance is harder at scale, so venues usually carry the standards rather than the individuals.',
    publish: true,
    note: 'Had no body at all.',
  },
  {
    slug: 'gangbang',
    cat: 'practices-play',
    desc: 'One person having sex with several partners in turn, by arrangement.',
    long: null,
    publish: true,
    note: 'Existing body is accurate; only the stamp is replaced.',
  },
  {
    slug: 'run-a-train',
    cat: 'practices-play',
    desc: 'Slang for a gangbang: several people having sex with one person one after another.',
    long:
      'Running a train describes partners taking turns with one person in sequence. The phrase comes from African-American vernacular and is common in gay and bisexual men\'s spaces. As a consensual arrangement it is a gangbang by another name; the same words are also used to describe assault, so context and prior agreement are what separate them.',
    publish: true,
    note: 'Had no body at all.',
  },
  {
    slug: 'blowbang',
    cat: 'practices-play',
    desc: 'One person performing oral sex on several partners in turn.',
    long: null,
    publish: true,
    note: 'Existing body is accurate; only the stamp is replaced.',
  },
  {
    slug: 'bukkake',
    cat: 'practices-play',
    desc: 'Several partners ejaculating onto one person, usually the face.',
    long: null,
    publish: true,
    note: 'Existing body is accurate; only the stamp is replaced.',
  },
  {
    slug: 'air-tight',
    cat: 'practices-play',
    desc: 'A group configuration in which one person is penetrated orally, anally and vaginally at once.',
    long: null,
    publish: true,
    note: 'Existing body is accurate; only the stamp is replaced.',
  },

  // ── Acts: fluids ────────────────────────────────────────────────────────
  {
    slug: 'creampie',
    cat: 'practices-play',
    desc: 'Ejaculating inside a partner and the visible result afterwards.',
    long: null,
    publish: true,
    note: 'Existing body is accurate; only the stamp is replaced.',
  },
  {
    slug: 'facial',
    cat: 'practices-play',
    desc: 'Ejaculating onto a partner\'s face.',
    long:
      'A facial is ejaculation onto the face, often negotiated as a mildly degrading or possessive act rather than purely a physical one. Semen in the eye stings badly and can transmit infection, so where it lands is usually agreed in advance. It is a staple of pornography, which is part of why expectations about it are frequently mismatched in practice.',
    publish: true,
    note: 'Previous body described "a skincare treatment for the face, involving various techniques like steaming".',
  },
  {
    slug: 'snowballing',
    cat: 'practices-play',
    desc: 'Passing semen from one partner\'s mouth to another\'s in a kiss.',
    long: null,
    publish: true,
    note: 'Existing body is accurate; only the stamp is replaced.',
  },
  {
    slug: 'squirting',
    cat: 'practices-play',
    desc: 'The expulsion of fluid from the urethra during arousal or orgasm.',
    long:
      'Squirting is the release of fluid at or near orgasm, distinct from ordinary lubrication and varying enormously between people and occasions. Analysis of the fluid finds it comes from the bladder and the Skene\'s glands, which is why it is not the marker of a "better" orgasm it is sometimes sold as. Plenty of people never experience it, and plenty of pornography exaggerates it.',
    publish: true,
  },
  {
    slug: 'scat-play',
    cat: 'practices-play',
    desc: 'Sexual play involving faeces, and the highest-infection-risk practice in common use.',
    long:
      'Scat play, or coprophilia, is arousal involving faeces, ranging from watching to direct contact. It carries the highest infection risk of any common practice — hepatitis A, shigella, E. coli, parasites — all of which spread readily by the faecal-oral route and several of which circulate in outbreaks among men who have sex with men. Hepatitis A vaccination, gloves, barriers and thorough washing are the standard precautions, and this is a practice where a hard barrier between play partners and everything else genuinely matters.',
    publish: true,
  },

  // ── Acts: sensation and control ─────────────────────────────────────────
  {
    slug: 'edging',
    cat: 'practices-play',
    desc: 'Repeatedly approaching orgasm and stopping short of it, prolonging arousal.',
    long:
      'Edging means bringing someone to the point just before orgasm and backing off, repeatedly, sometimes for hours. Done alone it intensifies the eventual release; done with a partner holding the timing it becomes an orgasm-control dynamic, and combined with refusal it becomes denial. It is the mechanism underneath chastity play and much of JOI.',
    publish: true,
    note: 'Previous body opened "Edging can refer to various concepts, including a gardening tool, a climbing technique" — a disambiguation page rendered as a definition.',
  },
  {
    slug: 'orgasm-play',
    cat: 'practices-play',
    desc: 'Play centred on controlling whether, when and how a partner comes.',
    long:
      'Orgasm play covers denial, forced or repeated orgasm, ruined orgasms and timed permission. What unites them is that the decision belongs to someone other than the person having it, which makes it a power exchange expressed through the body rather than through protocol. Forced repetition past the point of comfort is genuinely painful, so a limit on number is usually negotiated rather than discovered.',
    publish: true,
  },
  {
    slug: 'wand-teasing',
    cat: 'practices-play',
    desc: 'Using a wand vibrator to tease and edge a restrained partner.',
    long:
      'Wand teasing pairs a powerful vibrator with restraint so the receiving partner cannot move away from or towards the sensation. Because a wand delivers far more stimulation than a hand, it is the standard tool for forced-orgasm and overstimulation scenes as well as for slow edging. Prolonged contact on one spot causes numbness, so position is varied.',
    publish: true,
  },
  {
    slug: 'nipple-play',
    cat: 'practices-play',
    desc: 'Stimulating the nipples for pleasure, from light touch to clamps and suction.',
    long: null,
    publish: true,
    note: 'Existing body is accurate; only the stamp is replaced.',
  },
  {
    slug: 'stretching',
    cat: 'practices-play',
    desc: 'Gradually widening the anus or vagina to accommodate larger insertions.',
    long:
      'Stretching is the deliberate, progressive widening of an opening using graduated plugs, dilators or hands over repeated sessions. It is how fisting and large-toy play become possible, and the method is patience rather than force: go up a size only when the current one is comfortable, use far more lubricant than seems necessary, and stop at pain. Tearing heals badly in these tissues and is entirely avoidable.',
    publish: true,
    note: 'Previous body described stretching as "a form of physical exercise where a muscle is stretched to improve its elasticity".',
  },
  {
    slug: 'teabagging',
    cat: 'practices-play',
    desc: 'Lowering the scrotum into or onto a partner\'s mouth.',
    long: null,
    publish: true,
    note: 'Existing body is accurate; only the stamp is replaced.',
  },
  {
    slug: 'queening',
    cat: 'practices-play',
    desc: 'Sitting on a partner\'s face for oral sex, with the seated partner controlling position.',
    long:
      'Queening is facesitting: the receiving partner sits astride the other\'s face, which puts pace and pressure under their control and is why it reads as a dominant position. A queening stool exists specifically to make it sustainable. Breathing is the constraint — weight can restrict the airway, and the person underneath cannot speak — so a hand signal is agreed rather than relied on being asked for.',
    publish: true,
    note: 'Previous body described "a form of performance art within drag culture", a different sense of the word entirely.',
  },
  {
    slug: 'yoni-massage',
    cat: 'practices-play',
    desc: 'Slow, non-goal-oriented massage of the vulva and vagina, drawn from tantric practice.',
    long:
      'Yoni massage is extended external and internal massage framed around relaxation and sensation rather than orgasm. It borrows its vocabulary from tantra, though most contemporary practice is a Western wellness adaptation rather than a traditional one. It is used for slow arousal, for reconnecting with sensation after trauma or surgery, and as partnered practice.',
    publish: true,
  },

  // ── Acts: setting and scenario ──────────────────────────────────────────
  {
    slug: 'dogging',
    cat: 'practices-play',
    desc: 'Meeting for sex in semi-public outdoor locations, often with onlookers.',
    long: null,
    publish: true,
    note: 'Existing body is accurate; only the stamp is replaced.',
  },
  {
    slug: 'car-play',
    cat: 'practices-play',
    desc: 'Sex in a parked car, typically in a known cruising location.',
    long: null,
    publish: true,
    note: 'Existing body is accurate; only the stamp is replaced.',
  },
  {
    slug: 'exposure-play',
    cat: 'practices-play',
    desc: 'Play built on the risk or fact of being seen, from near-public exposure to threatened outing.',
    long:
      'Exposure play uses the charge of being witnessed: being undressed where someone might see, photographed, or having a scene or identity revealed. The line that matters is between a controlled scenario and a real one — genuine non-consensual exposure involves people who never agreed, and threatened outing touches employment, family and, in many countries, safety. Digital exposure is effectively permanent, which is why it is negotiated separately from the rest.',
    publish: true,
  },
  {
    slug: 'morning-sex',
    cat: 'practices-play',
    desc: 'Sex on waking, when hormone levels and physical arousal are typically highest.',
    long:
      'Morning sex is named for the practical fact behind it: testosterone peaks around waking and many people are already physically aroused, so it needs less build-up. It also tends to be slower and less planned than sex later in the day. It is a scheduling observation rather than a technique.',
    publish: true,
  },
  {
    slug: 'breeding',
    cat: 'fetishes-interests',
    desc: 'Erotic play around insemination and impregnation, usually as fantasy rather than outcome.',
    long:
      'Breeding play centres on ejaculating inside a partner and the idea of impregnation. In queer contexts it is almost always fantasy, since pregnancy is not a possible outcome, which is what separates the kink from the biology and is why it is bound up with barrier-free sex and bareback culture. That link is the practical point: the appeal depends on the absence of a condom, so it belongs in a conversation about PrEP, U=U and testing rather than apart from one.',
    publish: true,
    note: 'Previous body was "the biological process of sexual reproduction that results in the production of offspring" — the animal-husbandry sense.',
  },
  {
    slug: 'free-use',
    cat: 'fetishes-interests',
    desc: 'A negotiated arrangement in which one partner may initiate sex at any time without asking each time.',
    long:
      'Free use is a standing-consent dynamic: the parties agree in advance that one may use the other whenever they like, so the fiction of the scene is that no permission is sought. The consent is real and given beforehand — it is the asking that is suspended, not the agreement — and it carries the usual safeword and limit structure underneath. It appeals as a total-availability fantasy and it depends entirely on the negotiation that precedes it.',
    clearQid: true,
    publish: true,
    note: 'Carried Q14075, "free content", with the body to match — the same wrong identifier the Toys cohort carried.',
  },
  {
    slug: 'mixed-wrestling',
    cat: 'fetishes-interests',
    desc: 'Erotic wrestling between partners of different genders or body types, often with a dominance framing.',
    long:
      'Mixed wrestling as a kink is a contest with an erotic charge: the appeal is the struggle, the physical overpowering and the reversal of assumptions about who will win. It ranges from playful pinning to competitive submission holds, and it overlaps with dominance play, muscle worship and smothering. Real holds cause real injury, so what is allowed and how to tap out are agreed in advance.',
    publish: true,
    note: 'Previous body described competitive mixed-gender wrestling as a sport. Re-filed from Events & Parties.',
  },
  {
    slug: 'quacking',
    cat: 'practices-play',
    desc: 'Slang for using a Hitachi-style wand on a partner until they are overstimulated.',
    long:
      'Quacking is scene slang for relentless wand stimulation, named for the noise the toy makes at speed. It belongs to overstimulation and forced-orgasm play rather than teasing, since the point is to continue past the first orgasm. Overstimulation is genuinely uncomfortable, so a limit is negotiated before rather than discovered during.',
    publish: true,
    note: 'Had no body at all. Attestation for this term is thin, and the definition is written from its use in scene contexts rather than from a reference source.',
  },
  {
    slug: 'testicular-sex',
    cat: 'practices-play',
    desc: 'Play focused on the testicles — handling, weighting, squeezing and impact.',
    long:
      'Testicular play covers everything done to the testicles for sensation, from gentle handling and tugging through stretchers and weights to squeezing and impact in CBT. Sensitivity is extreme and injury is easy, so force is escalated slowly and torsion — a testicle rotating on its cord — is a surgical emergency rather than an intense sensation to work through. Sudden severe pain, swelling or nausea means stopping and seeking care.',
    publish: true,
    note: 'Previous body defined it as "the sex assigned at birth based on the presence of testes" — an unrelated and, on this platform, actively wrong claim about intersex and trans people.',
  },
  {
    slug: 'sexual-positions',
    cat: 'sex-positions',
    desc: 'The umbrella term for the physical configurations partners take during sex.',
    long:
      'Sexual positions describe how bodies are arranged during sex — who is above, behind, seated or standing, and which contact each arrangement makes available. Which ones work depends on anatomy, height difference, mobility and stamina far more than on any list, and most named positions are variations on a handful of basic configurations. This platform files individual positions under their own entries.',
    publish: true,
    note: 'Had no body at all and was filed under ORIENTATION. Re-filed to Positions, the stop that exists for exactly this.',
  },
];

/** Rows deliberately kept in an 18+ stop, and rows deliberately un-gated. */
export const STAYS_ADULT = ['subspace', 'sub-frenzy', 'dom-frenzy'];
export const DELIBERATELY_UNGATED = [
  'after-scene-drop',
  'safe-call',
  'vetting',
  'meeting-for-the-first-time',
  'rope-compatibility-checks',
  'trauma-awareness',
  'cuttlefish-method',
  'white-knight',
];

/**
 * The cohort narrative, emitted verbatim into the migration header. It lives
 * here rather than in the generator because it is a fact about THESE rows.
 * `{{nClear}}` and friends are substituted with the live counts at generate
 * time, so the prose cannot claim a figure the VALUES no longer support.
 */
export const MIGRATION_HEADER = `-- WHY THIS FINISHES A BACKLOG. tag_hygiene_stats()
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
-- Empty on 12. {{nClear}} identifiers are cleared and NONE is re-resolved: a
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
-- {{nKeepLong}} rows keep their existing long_description because it is already correct;
-- only their stamp is replaced.
--
`;
