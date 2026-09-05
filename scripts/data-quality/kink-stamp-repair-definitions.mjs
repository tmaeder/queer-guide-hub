/**
 * Hand-written replacements for the 61 kink glossary rows whose `description`
 * is a BULK-IMPORT STAMP rather than a definition.
 *
 * WHAT IS WRONG, MEASURED ON PROD 2026-09-05
 * ------------------------------------------
 * 41 active rows carry the literal string `'Toys tag'` as their description and
 * 20 carry `'Philia tag'`. Both are counted by
 * `tag_hygiene_stats().placeholder_description_active` (121 corpus-wide, so this
 * cohort is half of a tracked backlog) under the rule stated in the header of
 * 20261007163100: a short description shared by more than five tags is an import
 * stamp, not a definition.
 *
 * A STAMP IS WORSE THAN A BLANK. It is non-null, so it satisfies
 * `tag_has_prose()`; `enforce_tag_thin_page_gate` therefore does not fire, the
 * fill sweep's work list does not select the row, and
 * `indexable_without_description` cannot see it. The row reads as finished. This
 * is the same failure as the "No information available" prose retracted in
 * 20261012090000 — a stamp reads as content, a blank is honest and self-heals.
 *
 * THE STAMP IS NOT THE WORST PART, and this file exists because of the rest.
 * `long_description` on this cohort is frequently prose about a DIFFERENT
 * ENTITY, produced by the pre-guard name-lookup enrichment path that
 * 20261008100000 repaired. That repair cleared the wrong QIDs. It did not
 * always clear what they had already written, and it never touched aliases. So
 * three limbs of the same chimera survive:
 *
 *   1. PROSE LEFT BEHIND AFTER THE QID WAS CLEARED (measured: 2 rows).
 *      `tag_wikidata_repair_audit` records `collar` -> Q37558810 "Collar" (a
 *      family name) and `humbler` -> Q123735487 "Humblers" (a family name),
 *      both `disposition='cleared'` with `previous_long_description` NULL —
 *      i.e. the identifier was retracted and the prose it produced was not.
 *      /tags/collar today opens "The term Collar can refer to a family name or
 *      surname." The six rows in the same audit batch whose prose WAS retracted
 *      (bat, hashira, manties, paddle, speculum, st-andrews-cross) are the ones
 *      now sitting with an empty `long_description`.
 *
 *   2. QIDs THE REPAIR COULD NOT CATCH, because the entity class is plausible.
 *      Verified live against wbgetentities on 2026-09-05:
 *        crops        Q235352      "crop"            plant grown for profit
 *        pinwheel     Q14371       "Pinwheel Galaxy" spiral galaxy in Ursa Major
 *        impact-tools Q130321232   US patent 11247321
 *        ovipositor   Q868460      insect egg-laying organ
 *      This is the wrong-SENSE class that `tag-wiki-guard.ts` added its third
 *      gate for: a crop is not a person, place or journal, so the class arm
 *      passes and only a human reading the page can tell.
 *
 *   3. ALIASES NOBODY REVISITED. `flogger` carries eight aliases naming the
 *      Soviet fighter aircraft ("MiG-23 Flogger", "Mikoyan-Gurevich MiG-23",
 *      "YF 113"); `pinwheel` carries "Messier 101" and "Arp 26"; `ovipositor`
 *      carries "Legestachel" and "Legebohrer"; `crops` carries "Feldfrucht" and
 *      "cosecha agrícola". These are LATENT, NOT LIVE — all are
 *      `alias_type='multilingual'`, display is approved-only since
 *      20261012090000, and none has a `search_synonyms` bridge row (measured:
 *      0 of 35 across the seven affected slugs). They are removed here because
 *      they are wrong, not because they are leaking.
 *
 * A fourth group is not a chimera but is still not a glossary entry: prose
 * written about the GENERIC sense of the word on a page filed under a kink
 * stop. `straitjacket` describes psychiatric restraint, `stocks` describes
 * Solon's law code, `urethral-sound` says the device "should only be used under
 * medical supervision", `chastity-belt` says such devices are "more mythical
 * than factual" and "not commonly used in modern times", and the six clothing
 * rows describe the materials with no reference to fetish wear at all. All are
 * rewritten.
 *
 * A fifth group is consent boilerplate, which `TAG_STYLE_SYSTEM` bans outright
 * ("never pad with consent/safety boilerplate"). Ten rows end on some variant of
 * "As with any fetish, it's essential to prioritize consent and respect in all
 * interactions." Removed. Where a term has a REAL and specific safety or consent
 * fact — breath restriction, sleep play, weight gain, jade eggs — that fact is
 * stated concretely instead, because a specific warning is information and a
 * generic one is filler.
 *
 * ONE FACTUAL ERROR is corrected: `microphilia` was defined as "a sexual
 * interest in individuals who are short or small in stature". It is the
 * size-fantasy counterpart of macrophilia — attraction to miniature people —
 * not an attraction to short adults.
 *
 * VOICE
 * -----
 * `supabase/functions/_shared/tag-style.ts` `TAG_STYLE_SYSTEM`: direct, factual,
 * written for a queer audience, kink described frankly and without euphemism or
 * moralising, no second person, no marketing words, no consent boilerplate.
 * `description` is one sentence — it is the lede and the search snippet.
 * `long` is 2-4 sentences.
 *
 * FIELDS
 * ------
 *   slug       existing row (all 61 exist and are active)
 *   name       only when the current name is wrong; omitted otherwise
 *   newSlug    only when the name change should move the URL; emits a redirect
 *   cat        target `tag_categories.slug`; ALWAYS set, because re-filing is
 *              half the repair (36 of 41 pieces of equipment are not in Gear)
 *   desc       replaces the stamp. Never null.
 *   long       replaces `long_description`. null = the existing body is correct
 *              and is kept.
 *   clearQid   true = the stored identifier is provably the wrong entity. The
 *              QID is set to NULL and NOT re-resolved: a plausible-but-wrong id
 *              regenerates wrong data into tag_medical_codes, broader edges and
 *              the Elsewhere rail every week, a null one regenerates nothing.
 *   dropAlias  alias_name values to delete, verbatim.
 *   publish    true = human_reviewed + verification_status='reviewed' +
 *              seo_indexable. Every definition below was written by hand, so the
 *              flag is truthful. See the migration header for the four
 *              conditions publishing actually requires.
 */

/** @type {Array<{slug:string,name?:string,newSlug?:string,cat:string,desc:string,long:string|null,clearQid?:boolean,dropAlias?:string[],publish:boolean,note?:string}>} */
export const REPAIRS = [
  // ── Equipment: restraint ────────────────────────────────────────────────
  {
    slug: 'collar',
    cat: 'gear-aesthetics',
    desc: 'A band worn around the neck, in kink both a restraint fitting and the central symbol of an ownership dynamic.',
    long:
      'A collar is worn around the throat and may carry a D-ring for a leash or tether. Its meaning is rarely only practical: in dominance and submission a collar most often marks a negotiated relationship, and the act of putting one on has its own name, collaring. Types range from a soft everyday "day collar" that reads as ordinary jewellery to heavy locking posture collars used in scene. What a given collar means is set by the people involved, not by the hardware.',
    clearQid: false,
    publish: true,
    note: 'Chimera prose: QID Q37558810 ("Collar", a family name) was cleared by 20261008100000 but the prose it produced was left, so the page opened "The term Collar can refer to a family name or surname."',
  },
  {
    slug: 'restraints',
    cat: 'gear-aesthetics',
    desc: 'The general category of gear used to hold a partner in place — cuffs, rope, straps, tape and locking hardware.',
    long:
      'Restraints covers anything that limits movement by design, from padded leather cuffs and buckled straps to rope, bondage tape and steel. Choice is usually a trade-off between how secure a restraint is and how quickly it can be removed, which is why scenes that use locking hardware normally keep a key or cutter within reach. Restraint that bears weight, crosses a joint or presses on the neck is a different order of risk from restraint that simply holds a wrist.',
    publish: true,
  },
  {
    slug: 'straitjacket',
    cat: 'gear-aesthetics',
    desc: 'A sleeved jacket that crosses and fastens the arms across the chest, used in bondage for full upper-body restraint.',
    long:
      'A straitjacket has extended sleeves that cross the wearer\'s front and buckle behind the back, immobilising both arms as a unit. In kink it is valued for how total and how visible the restraint is, and for the helplessness of being held without any single limb being tied. It originates as a psychiatric restraint, a history the fetish sense borrows deliberately. Because the arms cannot be used to break a fall or clear an airway, a person in one is not left alone.',
    publish: true,
    note: 'Existing prose described only the psychiatric device — the generic sense on a page filed under a kink stop.',
  },
  {
    slug: 'stocks',
    cat: 'gear-aesthetics',
    desc: 'A hinged frame that closes around the wrists, ankles or neck to hold someone bent and exposed.',
    long:
      'Stocks are a rigid frame — historically wood, now often steel or acrylic — with cut-outs that close around limbs and lock. In kink they hold a bottom in a fixed, exposed position and hand access to the whole body to whoever is playing with them, which is the point. The design is taken from a real instrument of public punishment, and the humiliation of being displayed in one is part of what the scene is drawing on. Bent-over positions load the lower back and restrict breathing, so time in stocks is usually kept short.',
    publish: true,
    note: 'Existing prose was the historical punishment article (Solon\'s law code) with no kink sense at all.',
  },
  {
    slug: 'st-andrews-cross',
    cat: 'gear-aesthetics',
    desc: 'An X-shaped upright frame with anchor points at each corner, used to restrain someone standing and spread.',
    long:
      'A St Andrew\'s Cross is two beams crossed in an X, tall enough to take an adult standing, with cuffs or rings at the four ends. It holds a bottom spread and upright with the whole back or front presented, which makes it the standard fixture for impact play in a dungeon. It is the most recognisable piece of furniture in most public play spaces. Standing restraint can cause fainting, so a cross is normally used where someone can be brought down quickly.',
    publish: true,
    note: 'Prose was retracted by 20261008100000 (QID Q102392 = flag of Scotland). Row has had an empty body since.',
  },
  {
    slug: 'spreader-bar',
    cat: 'gear-aesthetics',
    desc: 'A rigid bar with a cuff at each end that holds the ankles or wrists apart at a fixed distance.',
    long:
      'A spreader bar fixes the distance between two limbs instead of binding them together, so it forces a position open rather than closing it down. Ankle bars hold the legs apart and make standing unsteady; wrist bars hold the arms wide. Adjustable models let the spread be set before or during a scene. Because it removes the ability to close the legs or brace, a spreader bar changes the balance of a scene as much as it changes the body.',
    publish: true,
    note: 'Was filed under Events & Parties, which also left it is_adult=false.',
  },
  {
    slug: 'hashira',
    cat: 'gear-aesthetics',
    desc: 'A pillar or post used as the anchor point for rope bondage.',
    long:
      'Hashira is the Japanese word for a pillar or column, used in rope practice for the upright post a person is tied to or against. Traditional Japanese rooms supplied one; purpose-built rope spaces reproduce it as a free-standing post or a bolted timber. Tying to a hashira gives a fixed vertical line to work from and lets a rigger use the post itself as part of the tie. Any anchor that will take a suspended or leaning body is a load-bearing question before it is an aesthetic one.',
    publish: true,
    note: 'Prose was retracted by 20261008100000 (QID Q3925165 = Hashirama Senju, a Naruto character).',
  },

  // ── Equipment: impact ───────────────────────────────────────────────────
  {
    slug: 'cane',
    cat: 'gear-aesthetics',
    desc: 'A thin flexible rod, usually rattan or acrylic, that delivers a narrow stinging line of pain.',
    long:
      'A cane concentrates force along a very small area, which is why it stings sharply and marks in distinct parallel lines rather than bruising broadly. Rattan is the traditional material and is light and forgiving; acrylic and delrin are heavier and bite harder. Caning is generally treated as an advanced impact skill because the margin between a good stroke and a wrapping one that hits the hip or kidney is small. Strokes are aimed at the buttocks and upper thighs, where there is muscle over bone.',
    publish: true,
  },
  {
    slug: 'crops',
    name: 'Riding Crop',
    newSlug: 'riding-crop',
    cat: 'gear-aesthetics',
    desc: 'A short riding whip with a leather flap at the tip, used for sharp, precisely placed strikes.',
    long:
      'A riding crop is a stiff shaft ending in a small leather keeper or tongue. The shaft carries the force and the flap makes the sound, so a crop can be used lightly for a loud crack that stings very little, or swung to leave a distinct rectangular mark. Its precision makes it a common first impact toy: it is easy to aim and easy to read. The tip is also used without striking at all, to point, lift a chin or trace skin.',
    clearQid: true,
    dropAlias: ['Feldfrucht', 'culture', 'cultivo', 'producciones agricolas', 'cosecha agrícola', 'cosecha'],
    publish: true,
    note: 'Was named "Crops" and carried Q235352 (crop, a plant grown for profit) with six agricultural aliases; the body was the agronomy article. Renamed to the object it was always meant to be.',
  },
  {
    slug: 'flogger',
    cat: 'gear-aesthetics',
    desc: 'A multi-tailed whip whose falls spread impact across a wide area, producing thud rather than sting.',
    long:
      'A flogger is a handle carrying many tails, or falls. Because force is shared across every tail, a flogger delivers a deep thuddy impact instead of the sharp line a cane or crop leaves, and it is much more forgiving of imperfect aim. Weight and material set the character: soft deerskin is gentle, heavy oiled leather is thumpy, and rubber or synthetic falls bite. Floggers are usually landed on the back, buttocks and thighs, keeping the tail ends off the kidneys and away from the wrap around the ribs.',
    dropAlias: [
      'Mikojan-Gurewitsch MiG-23',
      'MiG-23 Flogger',
      'MiG-23',
      'Mikoyan-Gurevich MiG-23',
      'Mikoyan-Gourevitch MiG-23',
      'MiG23',
      'YF 113',
      'Mikoyan MiG-23',
    ],
    publish: true,
    note: 'Carried eight aliases naming the Soviet MiG-23 fighter aircraft, NATO reporting name "Flogger". Latent, not live: multilingual type, no search_synonyms bridge row.',
  },
  {
    slug: 'paddle',
    cat: 'gear-aesthetics',
    desc: 'A flat rigid implement, usually leather or wood, that spreads impact over a broad surface.',
    long:
      'A paddle is a flat blade on a handle. The wide face spreads force, so a paddle bruises and warms rather than cutting a line the way a cane does, and it is loud. Leather paddles are relatively soft; wood, acrylic and slotted or studded faces escalate quickly. Paddling stays on the buttocks, which is the one area built to absorb it.',
    publish: true,
    note: 'Prose was retracted by 20261008100000 (QID Q7123347 = Paddle River, Alberta).',
  },
  {
    slug: 'bat',
    cat: 'gear-aesthetics',
    desc: 'A short, broad impact toy shaped like a bat or club, made to deliver heavy thud.',
    long:
      'A bat is a thick padded or leather-covered implement, heavier and blunter than a paddle, used where a bottom wants deep impact rather than surface sting. The weight does the work, so strokes are slower and land with more force per swing. Like every heavy thuddy toy it stays on large muscle — buttocks and upper thighs — and away from the spine, kidneys and joints.',
    publish: true,
    note: 'Prose was retracted by 20261008100000 (QID Q22889 = Bath, England).',
  },
  {
    slug: 'impact-tools',
    cat: 'gear-aesthetics',
    desc: 'The umbrella term for implements used in impact play — paddles, floggers, canes, crops, straps and hands.',
    long:
      'Impact tools covers everything used to strike a partner in negotiated play. They are usually sorted by the sensation they produce rather than their shape: thuddy tools such as heavy floggers and bats spread force and land deep, while stingy tools such as canes and crops concentrate it in a narrow line. Most scenes move between the two, often warming up with thud before introducing sting. The choice of tool sets which parts of the body are in play, because each has a different margin for error.',
    clearQid: true,
    publish: true,
    note: 'Carried Q130321232, a US patent titled "Impact tools with rigidly coupled impact mechanisms"; the body described software for social and environmental causes.',
  },

  // ── Equipment: genital and sensation ────────────────────────────────────
  {
    slug: 'chastity-belt',
    cat: 'gear-aesthetics',
    desc: 'A locking belt worn around the hips that blocks genital access, used in orgasm-control and denial play.',
    long:
      'A chastity belt is a waist band with a locking shield or crotch strap that prevents the wearer touching or being touched. In kink it is a working piece of gear for denial and control dynamics, usually worn by agreement for a set period with the key held by a partner. Full belts are less common than cages because they are harder to wear discreetly for long stretches. The medieval chastity belt of popular history is largely a myth; the modern object is a contemporary one.',
    publish: true,
    note: 'Existing prose called such devices "more mythical than factual" and "not commonly used in modern times" — the historical claim, on a page about current practice.',
  },
  {
    slug: 'chastity-cage',
    cat: 'gear-aesthetics',
    desc: 'A locking device worn over the penis that prevents erection and orgasm, central to denial and control play.',
    long:
      'A chastity cage is a rigid or flexible enclosure held on by a ring behind the scrotum and closed with a lock. It makes erection uncomfortable or impossible and puts the timing of release in someone else\'s hands, which is the appeal in orgasm-control and ownership dynamics. Fit is the whole problem: a ring that is too tight restricts circulation and one that is too loose lets the device pull off. Long-term wear needs regular cleaning and inspection, and numbness, discolouration or swelling means it comes off.',
    publish: true,
  },
  {
    slug: 'humbler',
    cat: 'gear-aesthetics',
    desc: 'A hinged wooden or acrylic clamp that traps the scrotum behind the thighs, forcing the wearer to stay bent forward.',
    long:
      'A humbler closes around the top of the scrotum and locks behind the thighs, so the testicles are held back between the legs. Standing upright then pulls hard on them, which means the wearer must stay bent or kneeling — the restraint is enforced by their own posture rather than by anything holding them down. It is used in CBT and humiliation scenes for exactly that reason. Circulation is cut over time, so a humbler is worn for short periods and removed if there is numbness or colour change.',
    clearQid: false,
    publish: true,
    note: 'Chimera prose: QID Q123735487 ("Humblers", a family name) was cleared but the prose it produced was left, so the page opened "Humbler is a family name with recorded occurrences."',
  },
  {
    slug: 'nipple-clamps',
    cat: 'gear-aesthetics',
    desc: 'Adjustable clamps applied to the nipples to pinch, restrict blood flow and heighten sensation.',
    long: null,
    publish: true,
    note: 'Existing body is accurate and specific; only the stamp is replaced.',
  },
  {
    slug: 'urethral-sound',
    cat: 'gear-aesthetics',
    desc: 'A smooth tapered rod inserted into the urethra for sensation play.',
    long:
      'A sound is a polished, gently curved rod, originally a urological instrument for dilating the urethra and used in kink for the intense and unfamiliar sensation of internal stimulation. Sounds come in graduated diameters and are worked up gradually. This is one of the few practices where sterility is not optional: the urethra runs directly to the bladder, so unsterilised gear, no lubricant or force will cause infection or tearing. Purpose-made surgical-steel sounds, sterile lubricant and patience are the baseline.',
    publish: true,
    note: 'Existing prose framed it purely as a medical device to be used "only under medical supervision" — the generic sense.',
  },
  {
    slug: 'dilator',
    cat: 'gear-aesthetics',
    desc: 'A graduated insertable used to stretch and maintain the vagina, anus or a surgical opening.',
    long:
      'A dilator is a smooth insertable, usually sold as a set in ascending sizes, used to widen an opening gradually over repeated sessions. In trans healthcare a dilation routine maintains depth and width after vaginoplasty and is a prescribed part of aftercare, not a kink. The same objects are used for anal training, for vaginismus, and for stretching play. In every case the method is the same: go up a size only when the current one is comfortable, and use plenty of lubricant.',
    publish: true,
    note: 'Existing prose was the generic medical-instrument disambiguation, including vasodilators and the dilator naris muscle.',
  },
  {
    slug: 'speculum',
    cat: 'gear-aesthetics',
    desc: 'A hinged instrument that opens and holds open the vagina or anus, used in medical play.',
    long:
      'A speculum is inserted closed and then cranked open, holding an opening wide so it can be looked into. In medical play the clinical character of the object is the point — the examination, the exposure and the loss of privacy carry the scene more than the physical sensation does. Steel speculums are reusable and can be warmed or chilled; disposable plastic ones lock with an audible ratchet. Opening too far or too fast tears tissue, so it is widened slowly and released the same way.',
    publish: true,
    note: 'Prose was retracted by 20261008100000 (QID Q7575349 = Speculum, the medieval-studies journal).',
  },
  {
    slug: 'pinwheel',
    cat: 'gear-aesthetics',
    desc: 'A handled wheel of fine sharp spokes rolled over skin to produce pricking sensation without breaking it.',
    long:
      'A pinwheel, also called a Wartenberg wheel after the neurologist who introduced it for testing nerve response, is a small spiked wheel on a handle. Rolled over skin it produces a bright pricking line that reads as much sharper than it is, which makes it a staple of sensation play and of blindfolded scenes where anticipation does most of the work. Pressure decides everything: light passes tickle, heavy ones break skin. It is a sensation toy, not a cutting one, and it is cleaned between partners because it can draw blood.',
    clearQid: true,
    dropAlias: ['Messier 101', 'Arp 26', 'M101', 'galaxie du Moulinet', 'Galaxia espiral M101'],
    publish: true,
    note: 'Carried Q14371, the Pinwheel Galaxy, with five astronomy aliases; the body was the galaxy article. Near-duplicate of the existing `wartenberg-wheel` row — flagged for a later merge rather than merged here, because both carry content and a merge picks a loser.',
  },
  {
    slug: 'e-stim-machine',
    cat: 'gear-aesthetics',
    desc: 'A power unit that drives electrical current through electrodes placed on or in the body for sensation play.',
    long:
      'An e-stim machine generates the waveform that electrodes deliver, with channels, intensity and pattern set at the box. Sensation ranges from a faint buzz to sharp involuntary muscle contraction, and it is unlike anything mechanical, which is why it has its own following. The single hard rule is that current must not cross the chest: electrodes stay below the waist or on one limb, never one hand to the other, because a path through the heart can be fatal. Units built for e-stim play are used rather than improvised or medical TENS gear, and anyone with a pacemaker or implanted electronics does not use it at all.',
    publish: true,
    note: 'Existing prose was generic electrotherapy ending on "consult a medical professional"; the one specific and load-bearing fact — no current across the chest — was absent.',
  },
  {
    slug: 'insertables',
    cat: 'gear-aesthetics',
    desc: 'The general category of toys designed to go inside the body — plugs, dildos, beads, eggs and sounds.',
    long:
      'Insertables covers any toy made to be put inside the vagina, anus or urethra. Two properties separate a safe one from an improvised object: a non-porous body-safe material such as silicone, steel or borosilicate glass, and, for anything anal, a flared base or retrieval loop, because the rectum draws objects upward and an unflared toy can be lost past the point of self-retrieval. Porous materials cannot be sterilised and are used with condoms or not at all.',
    publish: true,
  },
  {
    slug: 'ovipositor',
    cat: 'gear-aesthetics',
    desc: 'A fantasy insertable modelled on an egg-laying organ, used to deposit gelatine eggs inside a partner.',
    long:
      'An ovipositor is a silicone toy, usually shaped as a tentacle or insect organ, with a hollow channel that pushes soft gelatine eggs into the body one at a time. It belongs to the monster and alien-fantasy corner of kink, where the appeal is the scenario as much as the sensation. Eggs are made from gelatine so they dissolve; commercial moulds and recipes exist for exactly that reason. As with any anal toy the body of the ovipositor needs a flared base.',
    clearQid: true,
    dropAlias: [
      'Legeapparat',
      'Legestachel',
      'Legebohrer',
      'Legeröhre',
      'Oviscapte',
      'Oviposeur',
      'Ovipositeur',
      'Oviscapto',
    ],
    publish: true,
    note: 'Carried Q868460, the insect anatomical organ, with eight entomology aliases; the body was the entomology article.',
  },
  {
    slug: 'dildo',
    cat: 'gear-aesthetics',
    desc: 'A solid insertable toy made for penetration, with or without a phallic shape.',
    long:
      'A dildo is a non-vibrating insertable used for vaginal or anal penetration, by hand or worn in a harness. Silicone, glass and steel are the common body-safe materials; silicone is soft and grippy, glass and steel are rigid and hold temperature. Shapes run from realistic to abstract, and size is far less important than base design — anything used anally needs a flared base. It is among the oldest known sex toys, with carved examples tens of thousands of years old.',
    publish: true,
  },
  {
    slug: 'strap-on',
    cat: 'gear-aesthetics',
    desc: 'A dildo worn in a harness so it can be used to penetrate a partner.',
    long: null,
    publish: true,
    note: 'Existing body is accurate; only the stamp is replaced.',
  },
  {
    slug: 'vibrator',
    cat: 'gear-aesthetics',
    desc: 'A powered toy that delivers vibration for stimulation, used externally or internally.',
    long:
      'A vibrator produces oscillation at a range of frequencies, from broad rumbly patterns that carry into tissue to fine buzzy ones that stay on the surface. Wand, bullet, insertable and wearable forms all exist, and many are built to be used with a partner or driven remotely. Rumble tends to suit clitoral and prostate stimulation better than buzz. It is the most widely owned sex toy there is.',
    publish: true,
  },
  {
    slug: 'sex-swing',
    cat: 'gear-aesthetics',
    desc: 'A suspended harness that takes a partner\'s weight, holding them in positions the body cannot otherwise sustain.',
    long: null,
    publish: true,
    note: 'Existing body is accurate; only the stamp is replaced.',
  },
  {
    slug: 'fucking-machine',
    cat: 'gear-aesthetics',
    desc: 'A powered machine that drives a dildo in a repeating stroke, with speed and depth set mechanically.',
    long:
      'A fucking machine converts motor rotation into linear thrust, so it can maintain a rate and depth no person can hold. That relentlessness is the appeal: it does not tire and it does not respond, which suits both orgasm-forcing scenes and objectification play. Machines range from small consumer units to heavy adjustable frames. Because the stroke does not react to the person on it, depth is set before use and stays within reach of whoever is running it.',
    publish: true,
    note: 'Was filed under Slang & Language, which also left it is_adult=false.',
  },
  {
    slug: 'dick-on-a-stick',
    cat: 'gear-aesthetics',
    desc: 'A dildo mounted on a rigid handle or pole so it can be worked at a distance.',
    long:
      'A dick on a stick is a dildo fixed to a shaft rather than a harness, giving leverage and reach and letting one person control penetration without being pressed against their partner. It is often preferred where a harness is impractical, where a scene calls for distance between the two people, or simply for the control the extra length gives. Base and material rules are the same as any insertable.',
    publish: true,
  },
  {
    slug: 'yoni-egg',
    cat: 'gear-aesthetics',
    desc: 'A small egg-shaped insert worn vaginally, marketed for pelvic-floor training.',
    long:
      'A yoni egg is a smooth ovoid, commonly sold in jade, obsidian or rose quartz, intended to be worn internally. The wellness claims made for them — hormonal balance, detoxification, improved energy — have no clinical support, and gynaecologists have warned specifically against the porous stone versions, which cannot be sterilised and are not appropriate for prolonged wear. Pelvic-floor training itself is well evidenced and is done with body-safe silicone or medical-grade weights. The stone ones are best read as a wellness product rather than a clinical one.',
    publish: true,
    note: 'Existing prose described Kegel exercises generically and repeated the marketing framing without the safety finding.',
  },
  {
    slug: 'vacuum-bed',
    cat: 'gear-aesthetics',
    desc: 'A latex sheet frame that seals around the body and is pumped down, holding the occupant rigid in vacuum.',
    long:
      'A vacuum bed is two latex sheets in a frame; the occupant lies between them, air is pumped out, and atmospheric pressure moulds the latex tightly to their whole body. The result is total encasement and near-total immobility, with the shape of the body rendered in relief. Breathing is the entire safety question: a breathing tube is mandatory, the pump has to be reachable or attended, and the occupant is never left alone, because they cannot free themselves and cannot easily signal.',
    publish: true,
    note: 'Existing body was four sentences that said only that the device is used in BDSM.',
  },

  // ── Equipment: material and clothing ────────────────────────────────────
  {
    slug: 'latex-clothing',
    cat: 'gear-aesthetics',
    desc: 'Garments made from sheet rubber, worn skin-tight for their look, smell and the sensation of encasement.',
    long:
      'Latex clothing is cut and glued from sheet rubber rather than sewn, which is why it fits like a second skin and why it is expensive. The appeal is sensory as much as visual: the squeeze, the heat it traps, the smell and the high shine when polished. It needs dressing aids to get into, silicone or talc, and it stains permanently on contact with copper or brass. Latex allergy is common enough that it is worth establishing before a partner is wrapped in it.',
    publish: true,
    note: 'Existing prose described industrial latex, Mackintoshes and gas masks with no reference to fetish wear.',
  },
  {
    slug: 'leather-clothing',
    cat: 'gear-aesthetics',
    desc: 'Garments made from animal hide, and the defining uniform of the leather subculture.',
    long:
      'Leather clothing in a queer context carries more than material: leather is the founding aesthetic of a subculture that grew out of post-war motorcycle clubs and became one of the oldest organised strands of gay male community, with its own titles, clubs, protocols and flag. Harnesses, chaps, vests, caps and boots all read as specific signals within it. Leather is heavy, durable and takes on the shape of its wearer over years, which is part of why an old vest carries meaning.',
    publish: true,
    note: 'Existing prose was a generic material description.',
  },
  {
    slug: 'pvc-clothing',
    cat: 'gear-aesthetics',
    desc: 'Shiny plastic-coated fabric garments worn as a cheaper, more forgiving alternative to latex.',
    long:
      'PVC clothing is fabric with a polyvinyl chloride coating, giving a high-gloss surface often mistaken for patent leather. It is sewn rather than glued, so it is far cheaper than latex, easier to put on and much more durable, at the cost of the skin-tight fit and the smell that draw people to rubber. It does not breathe, which makes it hot over a long night. It is a common entry point into fetish wear for exactly these reasons.',
    publish: true,
  },
  {
    slug: 'vinyl-clothing',
    cat: 'gear-aesthetics',
    desc: 'Glossy plastic-finish garments, in practice the same fetish-wear category as PVC.',
    long:
      'Vinyl clothing describes garments with a wet-looking lacquered surface; in fetish retail the word is used more or less interchangeably with PVC, and the distinction is usually one of finish and marketing rather than material. The draw is the light — vinyl reads hard and reflective under club lighting in a way matte fabric does not. Like PVC it is sewn, affordable and non-breathable.',
    publish: true,
  },
  {
    slug: 'spandex-clothing',
    cat: 'gear-aesthetics',
    desc: 'Skin-tight elastic garments — zentai, lycra suits and sportswear — worn as fetish wear.',
    long:
      'Spandex clothing covers stretch garments worn for the compression and the way they render the whole body as a smooth continuous surface. Full-body zentai suits extend that to the hands, feet and face, removing identity along with skin, which is why they sit close to objectification and anonymity play. Sportswear fetish overlaps heavily: lycra shorts, singlets and swim gear carry their own associations. It is cheap, widely available and easy to wear compared with rubber.',
    publish: true,
  },
  {
    slug: 'fur-clothing',
    cat: 'gear-aesthetics',
    desc: 'Garments made from animal pelt, worn for the sensation of fur against skin and the luxury it signals.',
    long:
      'Fur as fetish wear is about touch and status: the drag of pelt across bare skin is a distinct sensation used in teasing and sensory play, and fur reads as wealth and indulgence in ways that suit dominant presentation. It is separate from furry fandom, which concerns anthropomorphic characters rather than the material. Synthetic fur is common and carries none of the ethical questions of the real thing.',
    publish: true,
    note: 'Existing prose was the generic material history.',
  },
  {
    slug: 'manties',
    cat: 'gear-aesthetics',
    desc: 'Women\'s-style underwear worn by men, as lingerie fetish or as everyday preference.',
    long:
      'Manties is a portmanteau of "man" and "panties" for feminine-cut underwear worn by men, whether lace, satin or sheer. Motivation varies and the word carries no single one: for some it is a lingerie fetish, for some part of feminisation play, and for many simply what they find comfortable and like wearing. Brands cutting feminine styles for male anatomy are now an ordinary part of the underwear market.',
    publish: true,
    note: 'Prose was retracted by 20261008100000 (QID Q1164724 = Mantias, an Athenian).',
  },
  {
    slug: 'curry-comb',
    cat: 'gear-aesthetics',
    desc: 'A horse-grooming comb used in pony play to groom a human pony in role.',
    long:
      'A curry comb is a real piece of stable equipment — a toothed rubber or metal disc used in circles to lift dirt from a horse\'s coat. In pony play it is used on a human pony for the same ritual, and it does the same thing a stable groom does: it establishes care, ownership and the handler\'s role through unhurried physical attention. Grooming is often the calm bracketing part of a pony scene rather than its intensity. Metal combs are made for hide, not human skin, and rubber ones are the usual choice.',
    publish: true,
    note: 'Existing prose was the equestrian article with no pony-play context, which on this page reads as an unexplained horse-care entry.',
  },

  // ── Practices ───────────────────────────────────────────────────────────
  {
    slug: 'inflatable-ball',
    cat: 'gear-aesthetics',
    desc: 'An inflatable ball gag, expanded in the mouth by a hand pump to fill it progressively.',
    long:
      'An inflatable gag is a rubber bladder held in the mouth by a strap and inflated with a bulb pump, so the wearer\'s mouth is filled gradually rather than all at once. Over-inflation is the specific risk: the bladder can be pumped past what the jaw can accommodate, and it must be deflatable instantly by whoever is holding the pump. Like every gag it removes speech, so a non-verbal signal replaces the safeword.',
    clearQid: true,
    publish: true,
    note: 'Carried Q97722170 ("inflatable ball", described only as a commodity) with the alias "ballon gonflable" and a body about parties and sports — i.e. a beach ball. Read as gear on a kink stop this is the inflatable gag; recorded here rather than deleted, and the QID is cleared rather than re-pointed.',
  },

  // ── Philia cohort: attraction to a body part or feature ─────────────────
  {
    slug: 'ass-fetish',
    cat: 'fetishes-interests',
    desc: 'A strong and specific sexual attraction to the buttocks.',
    long:
      'An ass fetish is a form of partialism, meaning arousal centred on one part of the body rather than the whole person. It may focus on size, shape, movement or presentation, and it drives practices from worship and grinding to rimming and spanking. Partialism of this kind is extremely common and is not in itself a disorder.',
    publish: true,
    note: 'Was filed under Slang & Language, which also left it is_adult=false — a fetish page with no age gate.',
  },
  {
    slug: 'nasophilia',
    cat: 'fetishes-interests',
    desc: 'Sexual attraction focused on the nose.',
    long:
      'Nasophilia is partialism directed at the nose, whether its shape, size or the sensation of touching it. Like other partialisms it may be the main focus of arousal or one element among others. It is uncommon enough to be poorly documented, which means most descriptions of it are extrapolated from better-studied partialisms rather than observed.',
    publish: true,
    note: 'Existing prose was unusually and gratuitously explicit relative to every comparable entry.',
  },
  {
    slug: 'pregnancy-fetish',
    cat: 'fetishes-interests',
    desc: 'Sexual attraction to pregnancy, or to the appearance and physical changes of being pregnant.',
    long:
      'A pregnancy fetish, sometimes called maiesiophilia, may centre on the pregnant body, on lactation, or on the idea of impregnation itself. In queer contexts it frequently appears as fantasy rather than circumstance — breeding play and impregnation roleplay between people for whom pregnancy is not a possible outcome. Attraction to a pregnant partner is distinct from attraction to the concept, and the two are often conflated.',
    publish: true,
    note: 'Was filed under Slang & Language, which also left it is_adult=false.',
  },
  {
    slug: 'macrophilia',
    cat: 'fetishes-interests',
    desc: 'Sexual attraction to giants, or to the fantasy of a partner of enormous size.',
    long:
      'Macrophilia is a size-fantasy kink built on the scale difference between a giant figure and a normal-sized one. It is almost entirely imaginative — expressed through art, writing, animation and roleplay rather than physical practice — and overlaps with dominance and submission, since scale so directly encodes power. Its inverse is microphilia, attraction to miniature people; many people into one are into both.',
    publish: true,
  },
  {
    slug: 'microphilia',
    cat: 'fetishes-interests',
    desc: 'Sexual attraction to miniature people, the size-fantasy inverse of macrophilia.',
    long:
      'Microphilia is arousal centred on a partner imagined at a tiny scale, whether as the smaller party or as the ordinary-sized one holding them. Like macrophilia it lives in art, writing and roleplay rather than practice, and the scale difference usually carries a power dynamic with it. It is not an attraction to short adults, which is an ordinary body-type preference and a different thing entirely.',
    publish: true,
    note: 'Existing prose defined it as "a sexual interest in individuals who are short or small in stature", which is factually the wrong concept.',
  },
  {
    slug: 'giantess-fetish',
    cat: 'fetishes-interests',
    desc: 'Macrophilia focused specifically on a giant woman.',
    long:
      'A giantess fetish is the most widely represented branch of macrophilia, centred on a woman of enormous scale and usually on the power that follows from it — being held, dominated, or simply dwarfed. It is expressed overwhelmingly through art, animation and written fantasy. In queer contexts it appears across gender lines and is not tied to the orientation of the person into it.',
    publish: true,
    note: 'Was filed under Slang & Language, which also left it is_adult=false.',
  },
  {
    slug: 'teratophilia',
    cat: 'fetishes-interests',
    desc: 'Sexual attraction to monsters and non-human or deformed figures.',
    long:
      'Teratophilia, from the Greek teras for monster, covers attraction to creatures rather than people — demons, aliens, beasts and the monstrous generally. It is expressed almost entirely through fiction, art and roleplay, and it has an established queer readership, partly because monster narratives have so often been where queerness was coded in horror. It overlaps with xenophilia and with ovipositor play.',
    publish: true,
  },
  {
    slug: 'xenophilia',
    cat: 'fetishes-interests',
    desc: 'Sexual attraction to alien or non-human beings.',
    long:
      'In kink and fandom, xenophilia is attraction to the alien — extraterrestrials and non-human intelligences — and sits alongside teratophilia within monster-fancying more broadly. It is a fiction-driven interest, expressed through art, writing and roleplay. The word has an unrelated everyday meaning, an affinity for foreign people and cultures, which is the antonym of xenophobia; the two senses share nothing but the root.',
    clearQid: true,
    publish: true,
    note: 'Carried Q144125 (love of foreign cultures) and prose to match — the generic dictionary sense on a page filed under Fetishes. This is the wrong-SENSE class that tag-wiki-guard.ts added its third gate for. The QID is cleared rather than re-pointed.',
  },

  // ── Philia cohort: attraction to an act, object or state ────────────────
  {
    slug: 'algophilia',
    cat: 'fetishes-interests',
    desc: 'Deriving sexual pleasure from pain, whether received or inflicted.',
    long:
      'Algophilia names arousal from pain itself, from the Greek algos. It is the underlying response that masochism and sadism organise into roles, and it is why impact, clamps, wax and needles work as erotic practices at all. Pain that is wanted and pain that is not are processed very differently, which is the whole distinction between negotiated pain play and injury.',
    publish: true,
    note: 'Existing prose described sadomasochism in general and the Marquis de Sade rather than the term.',
  },
  {
    slug: 'auralism',
    cat: 'fetishes-interests',
    desc: 'Arousal driven primarily by sound — voices, breathing, moaning or spoken words.',
    long:
      'Auralism centres desire on what is heard rather than seen. It covers arousal from a partner\'s voice, from the sounds of sex, from dirty talk and from audio erotica, and it is the reason phone sex, voice notes and audio porn have their own dedicated audiences. For some people sound is one channel among several; for auralists it is the primary one.',
    publish: true,
  },
  {
    slug: 'dacryphilia',
    cat: 'fetishes-interests',
    desc: 'Arousal from a partner\'s tears or crying.',
    long:
      'Dacryphilia is arousal in response to crying — the sight of tears, the sound of sobbing, or the emotional exposure that produces them. It usually appears inside a dominance dynamic, where the vulnerability being reached matters more than the tears themselves, and it overlaps with humiliation and with cathartic pain play. Crying is also an ordinary drop signal, so scenes built around it depend heavily on being able to tell the two apart.',
    publish: true,
  },
  {
    slug: 'somnophilia',
    cat: 'fetishes-interests',
    desc: 'Arousal from a sleeping or unconscious partner, played consensually as pre-negotiated sleep play.',
    long:
      'Somnophilia is arousal centred on someone asleep or apparently asleep. As kink it is a consensual-non-consent scenario: the sleep is agreed in advance, or roleplayed, and consent is established while everyone is awake and able to give it. The distinction is not a technicality — a genuinely unconscious person cannot consent, and contact with one is sexual assault, which is why this is negotiated ahead of time and why intoxication is not a substitute for the roleplay.',
    publish: true,
    note: 'Existing prose called it "a predatory paraphilia" without distinguishing the consensual practice from the crime, which is the only distinction that matters here.',
  },
  {
    slug: 'eproctophilia',
    cat: 'fetishes-interests',
    desc: 'Sexual arousal from flatulence.',
    long:
      'Eproctophilia is arousal in response to farting, whether the sound, the smell or the intimacy and embarrassment of it. It sits close to humiliation play and to other bodily-function kinks, and it is one of the few paraphilias to have been the subject of a published case study. It is rare and largely undocumented beyond that.',
    publish: true,
    note: 'Existing prose was two sentences of DSM classification padding and one sentence of content.',
  },
  {
    slug: 'klismaphilia',
    cat: 'fetishes-interests',
    desc: 'Sexual arousal from enemas and from being filled with liquid.',
    long:
      'Klismaphilia is arousal centred on receiving or administering an enema — the fullness, the loss of control over the body, and the clinical or caretaking framing that usually surrounds it. It overlaps with medical play and with control dynamics. Volume, water temperature and frequency are the practical constraints: large or repeated enemas disturb electrolyte balance, and plain warm water is used rather than soap or additives.',
    publish: true,
  },
  {
    slug: 'diaper-fetish',
    cat: 'fetishes-interests',
    desc: 'Sexual or comfort interest in wearing or using diapers, distinct from but often alongside age play.',
    long:
      'A diaper fetish centres on the garment and on what wearing it means — incontinence, dependence, being cared for, or the physical sensation itself. It is one half of ABDL, adult baby / diaper lover, and the two halves are genuinely separable: many diaper lovers have no interest in age regression, and many adult babies are not primarily interested in diapers. For a substantial number of people the appeal is regressive comfort rather than sex.',
    publish: true,
  },
  {
    slug: 'feedism',
    cat: 'fetishes-interests',
    desc: 'A kink centred on feeding, being fed and deliberate weight gain, organised around feeder and feedee roles.',
    long:
      'Feedism pairs a feeder, who provides food and encourages gain, with a feedee, who eats and gains. The charge comes from the transfer of control and from the visible change in the body over time, which makes it a long-arc dynamic rather than a scene-length one. It overlaps with fat admiration but is not the same thing: admiring a fat partner involves no gain. Sustained deliberate gain carries real metabolic and cardiac consequences, which is the part most often left out of how the kink is described.',
    publish: true,
    note: 'Existing prose was effectively a refusal — "As there are no provided sources… More information and resources are needed" — a variant the `refusal_prose_active` sentinel does not match, because it only looks for "no information available".',
  },
  {
    slug: 'looner',
    cat: 'fetishes-interests',
    desc: 'Someone with a balloon fetish, aroused by inflating, handling or popping balloons.',
    long:
      'Looners are people whose kink centres on balloons. The community divides itself into poppers, who want the balloon burst, and non-poppers, who want it kept intact, and that split is the main thing to establish before playing with someone. The appeal runs through texture, smell, the sound and the tension of inflation, and often through the anticipation of a pop that may or may not come. Latex allergy is the practical limit.',
    publish: true,
  },
  {
    slug: 'plushophilia',
    cat: 'fetishes-interests',
    desc: 'Sexual attraction to stuffed animals and plush toys.',
    long:
      'Plushophilia is arousal centred on plush toys, whether for their texture, their form or the character they represent. Some plushophiles modify toys for sexual use; for others the interest stays affectionate and non-genital. It has an association with furry fandom through shared iconography, but the two are distinct: furry concerns anthropomorphic characters and identity, plushophilia concerns the objects.',
    publish: true,
  },
  {
    slug: 'rubberism',
    cat: 'fetishes-interests',
    desc: 'A fetish for rubber and latex, spanning the material, the garments and the encased look.',
    long:
      'Rubberism is attraction to rubber itself — the shine, the smell, the grip against skin and the sealed feeling of being encased. Rubbermen are an established strand of gay male fetish culture with their own clubs, events and dress codes, running parallel to leather and sharing much of its social structure. It ranges from a single garment worn to a club through to full encasement in hoods and suits. Latex allergy is the one hard limit.',
    publish: true,
  },
  {
    slug: 'uniform-fetish',
    cat: 'fetishes-interests',
    desc: 'Sexual attraction to uniforms and to the authority or role they signal.',
    long:
      'A uniform fetish is arousal at what a uniform represents as much as how it looks — rank, discipline, anonymity, membership. Military, police, medical, clerical, sports and service uniforms all have their followings, and each carries a different set of associations to play with. In gay male fetish culture uniform is a long-established scene with its own clubs and nights, adjacent to leather and rubber. It is the standard basis for authority-figure roleplay.',
    publish: true,
    note: 'Was filed under Slang & Language, which also left it is_adult=false.',
  },
];

/** Slugs whose stored `long_description` is kept because it is already correct. */
export const KEEP_LONG = REPAIRS.filter((r) => r.long === null).map((r) => r.slug);

/** Slugs whose Wikidata identifier is provably the wrong entity and is cleared. */
export const CLEAR_QID = REPAIRS.filter((r) => r.clearQid).map((r) => r.slug);

/**
 * The cohort narrative, emitted verbatim into the migration header by
 * generate-kink-stamp-repair-migration.mjs. It lives here rather than in the
 * generator because it is a fact about THESE rows, and a shared generator
 * that hardcoded it would stamp cohort 1's findings onto cohort 2.
 */
export const MIGRATION_HEADER = `-- WHY THE STAMP MATTERS. 41 active rows carried the literal string 'Toys tag'
-- as their description and 20 carried 'Philia tag'. Both are counted by
-- tag_hygiene_stats().placeholder_description_active (121 corpus-wide before
-- this migration, so this cohort is half of a tracked backlog). A stamp is
-- WORSE than a blank: it is non-null, so tag_has_prose() is satisfied,
-- enforce_tag_thin_page_gate does not fire, the fill sweep never selects the
-- row and indexable_without_description cannot see it. The row reads as
-- finished. Identical reasoning to the "No information available" prose nulled
-- by 20261012090000.
--
-- THE STAMP WAS NOT THE WORST PART. long_description on this cohort is
-- frequently prose about a DIFFERENT ENTITY, left by the pre-guard name-lookup
-- enrichment path that 20261008100000 repaired. That repair cleared the wrong
-- identifiers; it did not always clear what they had written, and it never
-- touched aliases. Three limbs survived, all measured on prod 2026-09-05:
--
--   1. PROSE LEFT AFTER THE QID WAS CLEARED — 2 rows. tag_wikidata_repair_audit
--      shows collar -> Q37558810 ("Collar", a family name) and humbler ->
--      Q123735487 ("Humblers", a family name), both disposition='cleared' with
--      previous_long_description NULL: the identifier was retracted and its
--      prose was not. /tags/collar opened "The term Collar can refer to a
--      family name or surname." The six rows in the same audit batch whose
--      prose WAS retracted (bat, hashira, manties, paddle, speculum,
--      st-andrews-cross) are the ones now sitting with an empty body.
--
--   2. QIDs THE REPAIR STRUCTURALLY COULD NOT CATCH — {{nClear}} rows, cleared here.
--      Verified live against wbgetentities:
--        crops           Q235352     "crop"             a plant grown for profit
--        pinwheel        Q14371      "Pinwheel Galaxy"  spiral galaxy, Ursa Major
--        impact-tools    Q130321232  US patent 11247321
--        ovipositor      Q868460     insect egg-laying organ
--        inflatable-ball Q97722170   "inflatable ball", a commodity
--        xenophilia      Q144125     "free"/affinity for foreign cultures
--      None is a person, place or journal, so the class arm of the namesake
--      repair passes. This is the wrong-SENSE class that tag-wiki-guard.ts
--      added its third gate ('generic-sense') for, and only a human reading the
--      page can find it.
--
--   3. ALIASES NOBODY REVISITED — {{nAlias}} deleted here. flogger carried eight naming
--      the Soviet MiG-23 fighter (NATO reporting name "Flogger"); pinwheel
--      carried "Messier 101" and "Arp 26"; ovipositor carried "Legestachel";
--      crops carried "cosecha agrícola". These were LATENT, NOT LIVE — all
--      alias_type='multilingual', display has been approved-only since
--      20261012090000, and none had a search_synonyms bridge row (measured: 0
--      of 35 across the seven affected slugs). They are removed because they
--      are wrong, not because they were leaking.
--
-- NO QID IS RE-RESOLVED. Every one above is set to NULL and left there. A
-- plausible-but-wrong identifier regenerates wrong data into tag_medical_codes,
-- broader edges and the "Elsewhere" rail every week; a null one regenerates
-- nothing. Prefer NULL to a guess — the rule 20261008100000 established.
--
-- RE-FILING IS HALF THE REPAIR. Gear held 79 tags while 36 of the 41 pieces of
-- equipment sat in Fetishes (23), Dynamics & Roles (6), Sexual Health (4),
-- Events & Parties (spreader-bar) and Slang & Language (fucking-machine) — the
-- same kind mismatch the 2026-08-29 taxonomy rebuild fixed for the rest of the
-- corpus. Category is written as category_id ONLY: the BEFORE trigger derives
-- the category text mirror and the AFTER trigger moves the junction row.
-- Writing the text, or inserting a junction row, propagates nothing.
--
-- THE RE-FILE TIGHTENS THE AGE GATE, IT DOES NOT LOOSEN IT. is_adult is derived
-- from the junction by unified_tags_recompute_is_adult() and is never written
-- by hand here. Every target stop (Gear, Fetishes, Practices & Play) is in that
-- function's adult set, and six rows that were is_adult=false because they were
-- misfiled outside Sex & Kink — ass-fetish, giantess-fetish, pregnancy-fetish,
-- uniform-fetish (Slang & Language), spreader-bar (Events & Parties),
-- fucking-machine (Slang & Language) — become adult-gated. The final assertion
-- checks that no row came out un-gated rather than assuming it.
--
-- PUBLISHING NEEDS FOUR THINGS, NOT ONE. prose present (or
-- enforce_tag_thin_page_gate stamps 'thin'), human_reviewed=true (or
-- enforce_tag_seo_sensitivity_gate forces seo_indexable false, because every
-- row here is adult), verification_status='reviewed' (or
-- unified_tags_public_gated_read hides a sensitive row from anon entirely — it
-- is verification_status, NOT seo_indexable, that shows a sensitive term to a
-- signed-out reader), and seo_indexable=true. All four are set. human_reviewed
-- is truthful: every definition was written by hand for this migration.
--
-- {{nKeepLong}} rows keep their existing long_description because it is already correct
-- (nipple-clamps, strap-on, sex-swing); only their stamp is replaced.
--
-- {{nRename}} row is renamed: "Crops" -> "Riding Crop", slug crops -> riding-crop. The
-- row was the agriculture article under a kink stop; the object it was always
-- meant to be is on the List of BDSM equipment. The slug write emits a redirect
-- through log_unified_tag_slug_redirect().
--
`;
