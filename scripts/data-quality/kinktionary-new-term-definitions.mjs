/**
 * Definitions for Kinktionary terms that have no tag in `unified_tags`.
 *
 * PROVENANCE IS PART OF THE DATA, NOT A COMMENT.
 *
 * Every entry carries `sourced`:
 *
 *   sourced: true   The term is documented independently of the Kinktionary —
 *                   standard clinical, queer-community or subcultural
 *                   vocabulary — and the definition is written from that
 *                   general knowledge. NOT copied from FetLife: the Kinktionary
 *                   is licensed NON-COMMERCIAL and queer.guide is commercial,
 *                   so its prose may not be reproduced or adapted here. Only
 *                   its TERM LIST was used, as a signal for which entries are
 *                   missing.
 *
 *   sourced: false  The term is a FetLife-specific coinage with no attestation
 *                   anywhere else. The definition is INFERRED FROM THE NAME and
 *                   the section it sits in. It is a reasoned guess, not a fact,
 *                   and it is recorded as such in `tag_sources.source_type =
 *                   'editorial:inferred-from-name'`.
 *
 * NOTHING HERE IS PUBLISHED ON CREATION. Rows are written with
 * seo_indexable=false, human_reviewed=false and verification_status='unverified'
 * so they remain invisible to crawlers until a human approves them. That is
 * deliberate: a machine-written definition of an identity or role term is a
 * draft, and this program spent its life retracting prose that was published as
 * though it were not.
 *
 * WHAT "UNPUBLISHED" ACTUALLY COSTS DEPENDS ON `sensitive`, AND THIS HEADER
 * OVERSTATED IT UNTIL 2026-09-04. It said the rows stay "usable for tagging,
 * browsing and site search". True of the non-sensitive ones. FALSE of the
 * sensitive ones: `unified_tags_public_gated_read` admits anon only when the row
 * is non-sensitive OR `verification_status` is 'reviewed'/'locked', so a
 * sensitive+unverified row is not anon-readable AT ALL — not browsable, not in
 * anon site search, not on its own /tags/:slug page. Measured on prod
 * 2026-09-03: 101 of the ~297 rows this program created are in that state, and
 * every one HARD 404'd for a signed-out visitor while rendering normally for a
 * signed-in one. The 404 was fixed in 20261220113000 (the page now offers a
 * sign-in gate, which is the honest answer); the invisibility is unchanged and
 * intended. `verification_status` is therefore the lever that publishes a
 * sensitive term to anon at all, and `seo_indexable`/`human_reviewed` alone do
 * not do it.
 *
 * `adult` and `sensitive` follow the existing corpus conventions; when in doubt
 * the stricter flag is set, because the cost of over-flagging is a filter and
 * the cost of under-flagging is exposure — and, per the paragraph above, a
 * larger cost than that phrasing implied: `sensitive` also withholds the term
 * from every signed-out reader until an editor reviews it.
 *
 * TWO TERMS ARE ABSENT FROM THIS FILE, and neither is a settled exclusion:
 * `footjob` and `anorgasmia` already exist in `unified_tags` as DEPRECATED
 * rows, so creating them here would produce a second row for the same concept —
 * which is what the migrations assert against. Both were culled by the
 * 2026-06-05 orphan sweep ("no entity assignments, relations, synonyms, or
 * aliases"), the same sweep 20261211100000 revived `femdom`, `voyeur` and
 * `pretzel` from on the reasoning that a glossary term has no entity
 * assignments by nature. They were therefore revive CANDIDATES on identical
 * grounds, not terms this file had rejected.
 *
 * They were dispositioned separately in 20261217100000, and they did not land
 * the same way — the difference is the alias each slug is shadowed by, which an
 * anon read of `unified_tags` cannot see because RLS hides non-active rows:
 *
 *   `footjob`     REVIVED. Its alias pointed at `foot-worship`, and that alias
 *                 was wrong: Q107417158 "stimulation of the penis with the feet"
 *                 is an act, Q463859 "foot fetishism" is an attraction. The act
 *                 was genuinely missing from the glossary. Revived unpublished,
 *                 with the placeholder description "Sexual activity tag"
 *                 replaced, and the wrong aliases deleted.
 *
 *   `anorgasmia`  HELD BACK — a merge candidate, not a revival. Its alias points
 *                 at the ACTIVE tag `orgasmic-dysfunction`, which carries THE
 *                 SAME Wikidata item (Q1772397), is seo_indexable and
 *                 human_reviewed, and whose own long_description opens
 *                 "Anorgasmia is a type of sexual dysfunction…". The concept is
 *                 published already, under another slug. Same disposition as the
 *                 `genderfluid` / `gloryhole` entries in
 *                 generate-kinktionary-revival-migrations.mjs's HOLD_BACK.
 */

/** @typedef {{slug:string,name:string,cat:string,kind?:string,adult?:boolean,sensitive?:boolean,sourced:boolean,desc:string,long:string}} Term */

/** @type {Term[]} */
export const TERMS = [
  // ─────────────────────────── orientation & gender ───────────────────────────
  {
    slug: 'demimasc', name: 'Demimasc', cat: 'gender-identity', sourced: true,
    desc: 'A gender identity in which a person is partially, but not wholly, masculine.',
    long: 'Demimasc describes someone who identifies partly with masculinity and partly with something else — another gender, no gender, or a fluid mix. It sits in the same family as demiboy and demigirl, where the "demi-" prefix marks a partial rather than complete identification. Being demimasc says nothing about a person\'s pronouns, presentation or assigned sex at birth.',
  },
  {
    slug: 'transbian', name: 'Transbian', cat: 'sexual-orientation', sourced: true,
    desc: 'A trans woman or transfeminine person who is a lesbian.',
    long: 'Transbian is a self-descriptor combining "trans" and "lesbian", used by trans women and transfeminine people who are attracted to women. It is a term of community self-identification rather than a clinical category, and like most reclaimed vocabulary it is appropriate coming from people it describes.',
  },
  {
    slug: 'homocurious', name: 'Homocurious', cat: 'questioning-labels', sourced: true,
    desc: 'Someone who mainly identifies as straight but is curious about same-sex attraction or experience.',
    long: 'Homocurious describes a person who generally considers themselves heterosexual while remaining open to, or actively exploring, attraction to the same gender. It parallels bi-curious and is usually a stage of self-description rather than a fixed identity; some people later adopt another label and some do not.',
  },
  {
    slug: 'pancurious', name: 'Pancurious', cat: 'questioning-labels', sourced: true,
    desc: 'Someone exploring whether pansexuality describes their attraction.',
    long: 'Pancurious describes a person who is considering or exploring attraction that is not limited by gender, without yet claiming pansexual as an identity. As with other "-curious" terms it marks an open question rather than a settled answer.',
  },
  {
    slug: 'vegansexual', name: 'Vegansexual', cat: 'sexual-orientation', sourced: true,
    desc: 'A person who chooses sexual partners only among other vegans.',
    long: 'Vegansexual describes someone whose choice of sexual partners is limited to other vegans, usually as an extension of an ethical commitment rather than a claim about attraction itself. The term was documented in New Zealand research in the mid-2000s and is a partner-selection preference rather than a sexual orientation in the usual sense.',
  },
  {
    slug: 'quoisexual', name: 'Quoisexual', cat: 'sexual-orientation', sourced: true,
    desc: 'A person for whom the distinction between sexual and other attraction does not apply or make sense.',
    long: 'Quoisexual — from the French "quoi", meaning "what" — describes someone who cannot or does not separate sexual attraction from other kinds of attraction, or who finds the question itself unanswerable for them. It sits on the asexual spectrum and is the sexual counterpart of quoiromantic. It is a statement about the framework not fitting, rather than about the level of attraction.',
  },
  {
    slug: 'quoiromantic', name: 'Quoiromantic', cat: 'sexual-orientation', sourced: true,
    desc: 'A person for whom the distinction between romantic and platonic attraction does not apply or make sense.',
    long: 'Quoiromantic, also called WTFromantic, describes someone who cannot distinguish romantic attraction from friendship or other closeness, or who finds that distinction meaningless for them. It sits on the aromantic spectrum. Like quoisexual, it describes a mismatch with the usual categories rather than an absence of feeling.',
  },
  {
    slug: 'aplatonic', name: 'Aplatonic', cat: 'sexual-orientation', sourced: true,
    desc: 'A person who experiences little or no platonic attraction — the pull toward friendship.',
    long: 'Aplatonic people feel little or no desire to form friendships or close platonic bonds, in the same way an aromantic person feels little or no romantic attraction. It does not mean disliking people or being unable to maintain relationships; it describes the absence of a particular pull. The term comes from the aromantic and asexual communities, where attraction is routinely separated into distinct types.',
  },
  {
    slug: 'hijra', name: 'Hijra', cat: 'gender-identity', sourced: true,
    desc: 'A recognised third-gender community in South Asia, with centuries of documented history.',
    long: 'Hijra refers to a third-gender community across India, Pakistan, Bangladesh and Nepal, generally comprising people assigned male at birth who live in a feminine gender role, alongside some intersex people. Hijra communities have their own kinship structures, and their presence is documented over centuries. India, Nepal, Pakistan and Bangladesh have each granted legal recognition to a third gender in recent decades. Hijra is a specific cultural identity, not a synonym for transgender, and should not be used as a general translation.',
  },

  // ────────────────────── relationships & polyamory ──────────────────────
  {
    slug: 'polycule', name: 'Polycule', cat: 'relationship-structures', sourced: true,
    desc: 'The connected network of people linked by romantic or sexual relationships in a polyamorous group.',
    long: 'A polycule is the whole web of people joined directly or indirectly by relationships — partners, partners\' partners, and so on. The word blends "poly" with "molecule", after the way such networks are drawn as diagrams. Polycules vary enormously: some function as a close unit, others are simply a map of who is connected to whom.',
  },
  {
    slug: 'consensual-non-monogamy', name: 'Consensual Non-Monogamy', cat: 'relationship-structures', sourced: true,
    desc: 'Any relationship structure where partners agree that more than one romantic or sexual relationship is permitted.',
    long: 'Consensual non-monogamy, often shortened to CNM or ENM (ethical non-monogamy), is the umbrella for polyamory, open relationships, swinging, relationship anarchy and similar arrangements. The defining feature is informed agreement between everyone involved, which is what separates it from cheating. It describes a structure, not a level of commitment.',
  },
  {
    slug: 'new-relationship-energy-nre', name: 'New Relationship Energy (NRE)', cat: 'relationship-structures', sourced: true,
    desc: 'The intense excitement and preoccupation common in the early stage of a new relationship.',
    long: 'New Relationship Energy describes the heightened attention, euphoria and urgency people often feel at the start of a relationship. The term is used widely in polyamorous communities because NRE with a new partner can unbalance existing relationships if it is not named and managed. It is generally understood as a temporary phase rather than a measure of how much a relationship matters.',
  },
  {
    slug: 'nesting-metamours', name: 'Nesting Metamours', cat: 'relationship-structures', sourced: true,
    desc: 'Metamours who share a home — partners of the same person who also live together.',
    long: 'A metamour is your partner\'s partner. Nesting metamours are metamours who also share a household, whether or not they are romantically involved with each other. The arrangement raises practical questions about space, finances and privacy that metamours living apart do not face.',
  },
  {
    slug: 'squish', name: 'Squish', cat: 'relationship-structures', sourced: true,
    desc: 'An intense desire for friendship with someone — the platonic counterpart of a crush.',
    long: 'A squish is a strong pull toward friendship or close platonic connection with a particular person, without romantic or sexual desire. The term comes from the aromantic community, where separating types of attraction is standard, and gives a name to a feeling that English otherwise leaves to the vocabulary of romance.',
  },

  // ──────────────────────── sexual activities ────────────────────────
  {
    slug: 'frottage', name: 'Frottage', cat: 'practices-play', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual rubbing of the body against a partner, usually while clothed or without penetration.',
    long: 'Frottage covers sexual activity in which people rub their bodies together for stimulation rather than engaging in penetration. Between men it is sometimes called frot. It carries a much lower risk of transmitting sexually transmitted infections than penetrative sex, which is one reason it appears in safer-sex guidance. The related term frotteurism describes non-consensual rubbing against another person and is a criminal act, not a practice.',
  },
  {
    slug: 'dry-humping', name: 'Dry Humping', cat: 'practices-play', adult: true, sensitive: true, sourced: true,
    desc: 'Rubbing the genitals against a partner or object while clothed.',
    long: 'Dry humping is sexual rubbing that keeps clothing on. It is a common form of contact for people avoiding penetration, and carries a low risk of transmitting sexually transmitted infections while clothing remains a barrier.',
  },
  {
    slug: '69-position', name: '69 Position', cat: 'sex-positions', adult: true, sensitive: true, sourced: true,
    desc: 'A position in which two people perform oral sex on each other at the same time.',
    long: 'Named for the shape the numerals suggest, the 69 position has each partner oriented head-to-foot so both can give and receive oral sex simultaneously. It works with any combination of bodies, and comfort usually depends more on height difference and support than on anatomy.',
  },
  {
    slug: 'ear-licking', name: 'Ear Licking', cat: 'practices-play', adult: true, sensitive: true, sourced: true,
    desc: 'Oral stimulation of a partner\'s ear.',
    long: 'The outer ear and the skin around it are densely supplied with nerve endings, which is why licking, breathing on or lightly biting the ear is a common part of foreplay. Some people find it intensely pleasurable and others find it uncomfortable, so it is worth asking.',
  },
  {
    slug: 'hotdogging', name: 'Hotdogging', cat: 'practices-play', adult: true, sensitive: true, sourced: true,
    desc: 'Rubbing the penis between a partner\'s buttocks without penetration.',
    long: 'Hotdogging refers to sliding the penis between the buttocks or thighs rather than penetrating. Like other forms of frottage it carries substantially lower infection risk than penetrative sex.',
  },
  {
    slug: 'jilling-off', name: 'Jilling Off', cat: 'practices-play', adult: true, sensitive: true, sourced: true,
    desc: 'Female masturbation — the counterpart to "jacking off".',
    long: 'Jilling off is informal slang for masturbation by women and people with vulvas, coined as a counterpart to the male-coded "jacking off". The term is playful rather than clinical.',
  },
  {
    slug: 'blumpkin', name: 'Blumpkin', cat: 'practices-play', adult: true, sensitive: true, sourced: true,
    desc: 'Receiving oral sex while sitting on a toilet and defecating.',
    long: 'A blumpkin is a slang term for receiving fellatio while seated on a toilet using it. The term appears far more often in comedy and internet slang than as a described practice.',
  },
  {
    slug: 'rusty-trombone', name: 'Rusty Trombone', cat: 'practices-play', adult: true, sensitive: true, sourced: true,
    desc: 'Simultaneous anilingus and manual stimulation of the penis, performed from behind.',
    long: 'The rusty trombone is a slang term for a combined act in which one partner performs anilingus while reaching around to stimulate the other\'s penis by hand, the arm motion suggesting a trombone slide. As with any oral-anal contact, barriers substantially reduce the risk of transmitting gastrointestinal infections and hepatitis A.',
  },

  // ──────────────────────── philias & fetishes ────────────────────────
  {
    slug: 'abasiophilia', name: 'Abasiophilia', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual attraction to people with impaired mobility, especially those using braces, casts or wheelchairs.',
    long: 'Abasiophilia is attraction to people with limited mobility or to mobility aids such as leg braces, casts and wheelchairs. As with any attraction directed at a body or a device, the distinction that matters in practice is whether disabled people are treated as partners with their own agency or as objects of the interest.',
  },
  {
    slug: 'agoraphilia', name: 'Agoraphilia', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual arousal from sex in public or open spaces.',
    long: 'Agoraphilia is arousal connected to having sex outdoors or in public places. The consent of everyone present is the governing issue: public sex where uninvolved people can see is illegal in most jurisdictions and is a consent violation regardless of the law, which is why the interest is usually practised at private outdoor locations or dedicated events.',
  },
  {
    slug: 'amychophilia', name: 'Amychophilia', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual arousal from being scratched, or from scratching a partner.',
    long: 'Amychophilia is arousal from scratching — giving, receiving or the marks left behind. It overlaps with edge play and sensation play. Broken skin carries infection risk in both directions, so nails, hygiene and aftercare matter.',
  },
  {
    slug: 'emetophilia', name: 'Emetophilia', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual arousal from vomiting or from watching others vomit.',
    long: 'Emetophilia, sometimes called Roman showers, is arousal connected to vomiting. It carries genuine physical risk: repeated induced vomiting damages tooth enamel and the oesophagus and can cause electrolyte disturbance, and vomit is an infection vector. It is also easily confused with, and can mask, an eating disorder.',
  },
  {
    slug: 'scopophilia', name: 'Scopophilia', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual pleasure derived from looking — the arousal of watching.',
    long: 'Scopophilia is pleasure taken in looking, and appears both in psychoanalytic writing and in film theory, where Laura Mulvey used it in her account of the gaze. In a kink context it overlaps with voyeurism, with the same governing condition: the person being watched has agreed to it.',
  },
  {
    slug: 'martymachlia', name: 'Martymachlia', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual arousal from being watched by others during sex.',
    long: 'Martymachlia is arousal from having an audience — the complement of voyeurism. It is a common reason people attend play parties and dedicated venues, where being watched is an agreed part of the setting rather than something imposed on bystanders.',
  },
  {
    slug: 'narratophilia', name: 'Narratophilia', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual arousal from hearing or telling erotic words and stories.',
    long: 'Narratophilia is arousal driven by language — dirty talk, read or spoken erotica, or narrated fantasy. It is one of the interests that translates most easily to distance and text, and it underpins much of audio erotica.',
  },
  {
    slug: 'melolagnia', name: 'Melolagnia', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual arousal from music.',
    long: 'Melolagnia is arousal produced by music itself, rather than by lyrics or associated imagery. It shades into the widely reported experience of music producing strong physical responses, sometimes called frisson.',
  },
  {
    slug: 'dormaphilia', name: 'Dormaphilia', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual arousal connected to a sleeping partner.',
    long: 'Dormaphilia is arousal connected to sleep — a partner asleep, or the appearance of sleep. Consent is the whole of the matter here: a sleeping person cannot consent in the moment, so any practice in this area depends entirely on explicit agreement negotiated in advance while both people are awake, and on a clear means of withdrawing it.',
  },
  {
    slug: 'onychophilia', name: 'Onychophilia', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual attraction to fingernails or toenails.',
    long: 'Onychophilia is attraction focused on nails — their length, shape, colour or the sensation of them. It frequently appears alongside hand and foot fetishism.',
  },
  {
    slug: 'pubephilia', name: 'Pubephilia', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual attraction to pubic hair.',
    long: 'Pubephilia is attraction focused on pubic hair — its presence, quantity or styling. It sits alongside the broader trichophilia, which covers hair generally.',
  },
  {
    slug: 'armpit-fetish', name: 'Armpit Fetish', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual attraction to armpits, sometimes called maschalagnia.',
    long: 'An armpit fetish is attraction focused on the underarm — its appearance, hair or scent. It overlaps with scent-based interests, and hygiene preferences vary widely between people who share it.',
  },
  {
    slug: 'belly-button-fetish', name: 'Belly Button Fetish', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual attraction to the navel, also called alvinolagnia.',
    long: 'A belly button fetish is attraction focused on the navel and the surrounding stomach, whether through looking, touching or play directed there.',
  },
  {
    slug: 'ear-fetish', name: 'Ear Fetish', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual attraction to ears.',
    long: 'An ear fetish is attraction focused on the ears — their shape, piercings, or stimulation of them. It often overlaps with interests in sound, whispering and breath.',
  },
  {
    slug: 'neck-fetish', name: 'Neck Fetish', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual attraction to the neck and throat.',
    long: 'A neck fetish is attraction focused on the neck — its appearance, or kissing, biting and marking there. It is distinct from breath play or choking, which carry serious physical risk and are a separate practice with their own safety requirements.',
  },
  {
    slug: 'glasses-fetish', name: 'Glasses Fetish', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual attraction to people wearing glasses.',
    long: 'A glasses fetish is attraction to eyewear and to partners wearing it. It sits with other clothing and accessory-based interests, where the object contributes to the appeal rather than being incidental.',
  },
  {
    slug: 'nylon-fetish', name: 'Nylon Fetish', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual attraction to nylon garments, especially hosiery.',
    long: 'A nylon fetish is attraction to the material — tights, stockings and similar garments — for their texture, sheen and sound as much as their appearance. It is one of the longest-documented material fetishes.',
  },
  {
    slug: 'stockings-fetish', name: 'Stockings Fetish', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual attraction to stockings and the way they are worn.',
    long: 'A stockings fetish is attraction focused on stockings, suspenders and hold-ups — how they look, how they feel, and often the ritual of putting them on or removing them.',
  },
  {
    slug: 'smoking-fetish', name: 'Smoking Fetish', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual attraction to the act or imagery of smoking, sometimes called capnolagnia.',
    long: 'A smoking fetish is arousal connected to smoking — watching a partner smoke, the gestures involved, or the associated imagery. The health harms of tobacco apply regardless of context, and some people who share the interest keep it to imagery for that reason.',
  },
  {
    slug: 'balloon-fetish', name: 'Balloon Fetish', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual attraction to balloons, often called looning.',
    long: 'A balloon fetish, known in its own community as looning, is arousal connected to balloons — inflating them, the texture and sound, and for some the anticipation or moment of popping. Participants generally divide into "poppers" and "non-poppers" by whether the burst is part of the appeal. Latex allergy is a practical consideration.',
  },
  {
    slug: 'cast-fetish', name: 'Cast Fetish', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual attraction to orthopaedic casts and braces.',
    long: 'A cast fetish is attraction to plaster or fibreglass casts, braces and splints, whether worn by a partner or oneself. It overlaps with abasiophilia. Applying a real cast without medical need carries genuine risk of circulation and skin injury.',
  },
  {
    slug: 'robot-fetish', name: 'Robot Fetish', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual attraction to robots, androids or people acting mechanically.',
    long: 'A robot fetish, sometimes called technosexuality or ASFR, covers attraction to robots and androids in fiction and imagery, and to partners who take on mechanical or programmed behaviour in roleplay. It overlaps with transformation and objectification interests.',
  },
  {
    slug: 'transformation-fetish', name: 'Transformation Fetish', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual attraction to the idea of a body or identity being changed into something else.',
    long: 'A transformation fetish centres on change itself — a body, gender, species or role becoming something different. It is overwhelmingly a fantasy and fiction interest, expressed in writing and art, and it covers a wide range from gradual bodily change to instantaneous transformation.',
  },
  {
    slug: 'cum-fetish', name: 'Cum Fetish', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual attraction focused on semen.',
    long: 'A cum fetish is arousal focused on semen — its appearance, taste, or where it ends up. Semen transmits HIV and several other sexually transmitted infections, so the usual risk-reduction questions about testing, PrEP and barriers apply.',
  },
  {
    slug: 'wetlook', name: 'Wetlook', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual attraction to people in wet clothing.',
    long: 'Wetlook is arousal from seeing people fully clothed while soaked — in a pool, shower, rain or sea. The clothing staying on is the point; the interest is distinct from wet-and-messy play, which uses substances other than water.',
  },
  {
    slug: 'agonophilia', name: 'Agonophilia', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Sexual arousal from a partner pretending to struggle or resist.',
    long: 'Agonophilia is arousal from simulated struggle or resistance. In practice it is a form of consensual non-consent, which depends completely on negotiation done in advance, an agreed safeword or signal that works when speech is restricted, and aftercare. Without those it is not this practice.',
  },
  {
    slug: 'bimbofication', name: 'Bimbofication', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'A transformation fantasy of becoming, or making someone, exaggeratedly feminine and hypersexual.',
    long: 'Bimbofication is a transformation kink in which a person is imagined or roleplayed as becoming stereotypically hyperfeminine and hypersexual. It is most often a fantasy and aesthetic, and it is practised both as something done to a submissive partner and as a self-directed identity that some people embrace on their own terms.',
  },

  // ──────────────────────── gay & kink subculture roles ────────────────────────
  {
    slug: 'power-top', name: 'Power Top', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: true,
    desc: 'Someone who tops with particular energy, stamina or forcefulness.',
    long: 'A power top is a partner who takes the penetrative role assertively and vigorously. The term describes intensity and style rather than a distinct role, and it is used mainly in gay male contexts.',
  },
  {
    slug: 'total-top', name: 'Total Top', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: true,
    desc: 'Someone who only ever takes the penetrative role.',
    long: 'A total top exclusively tops and does not bottom. The term marks the absence of versatility rather than any judgement about it.',
  },
  {
    slug: 'total-bottom', name: 'Total Bottom', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: true,
    desc: 'Someone who only ever takes the receptive role.',
    long: 'A total bottom exclusively bottoms and does not top. As with total top, it describes a fixed preference rather than a hierarchy.',
  },
  {
    slug: 'vers-top', name: 'Vers Top', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: true,
    desc: 'A versatile partner who prefers topping.',
    long: 'Vers top describes someone comfortable in both roles who leans toward topping. The term exists because "versatile" alone says nothing about which way a person leans, which matters when people are matching.',
  },
  {
    slug: 'vers-bottom', name: 'Vers Bottom', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: true,
    desc: 'A versatile partner who prefers bottoming.',
    long: 'Vers bottom describes someone comfortable in both roles who leans toward bottoming — the counterpart of vers top.',
  },
  {
    slug: 'muscle-bear', name: 'Muscle Bear', cat: 'subcultures', sourced: true,
    desc: 'A muscular, typically hairy man within bear subculture.',
    long: 'Muscle bear describes a man in bear culture who is muscular as well as hairy and solidly built. Bear subculture has a dense vocabulary of body types — bear, cub, otter, wolf, chub — and muscle bear marks the intersection of bear aesthetics with a built physique.',
  },
  {
    slug: 'twink-chaser', name: 'Twink Chaser', cat: 'subcultures', sourced: true,
    desc: 'Someone, usually an older man, who is specifically attracted to twinks.',
    long: 'A twink chaser is a person attracted specifically to twinks — young-looking, slim, typically smooth men. "Chaser" is used across gay subcultures for directed attraction to a body type, and it carries a mildly loaded edge depending on who is using it.',
  },
  {
    slug: 'cub-chaser', name: 'Cub Chaser', cat: 'subcultures', sourced: true,
    desc: 'Someone attracted specifically to cubs — younger or smaller men in bear subculture.',
    long: 'A cub chaser is attracted to cubs, meaning younger or smaller bear-identified men. It parallels the other "-chaser" terms in bear and gay subcultural vocabulary.',
  },
  {
    slug: 'otter-chaser', name: 'Otter Chaser', cat: 'subcultures', sourced: true,
    desc: 'Someone attracted specifically to otters — slim, hairy men.',
    long: 'An otter chaser is attracted to otters, meaning lean and hairy men, a body type that sits between twink and bear in the subculture\'s vocabulary.',
  },
  {
    slug: 'silver-fox-chaser', name: 'Silver Fox Chaser', cat: 'subcultures', sourced: true,
    desc: 'Someone attracted specifically to attractive older, grey-haired men.',
    long: 'A silver fox chaser is attracted to older men with grey or silver hair. It overlaps with daddy-directed attraction, with the emphasis on age and appearance rather than on a dominant role.',
  },
  {
    slug: 'muscle-chaser', name: 'Muscle Chaser', cat: 'subcultures', sourced: true,
    desc: 'Someone attracted specifically to heavily muscular partners.',
    long: 'A muscle chaser is attracted to visibly built, muscular bodies. It overlaps with muscle worship, which is the practice rather than the preference.',
  },
  {
    slug: 'daddy-chaser', name: 'Daddy Chaser', cat: 'subcultures', adult: true, sensitive: true, sourced: true,
    desc: 'Someone attracted specifically to daddies — older or dominant, typically masculine partners.',
    long: 'A daddy chaser is drawn to partners who present as daddies, which may mean older, larger, more established or more dominant depending on the community. Unlike silver fox, the term usually carries a suggestion of role as well as appearance.',
  },
  {
    slug: 'pantyboy', name: 'Pantyboy', cat: 'expression-presentation', adult: true, sensitive: true, sourced: true,
    desc: 'A man or masculine person who wears women\'s underwear, often as part of kink or self-expression.',
    long: 'Pantyboy describes a man or masculine-presenting person who wears panties, whether privately, as part of a feminisation dynamic, or simply because he likes them. It is a self-descriptor as often as it is a role assigned in play, and it says nothing on its own about the wearer\'s gender or orientation.',
  },
  {
    slug: 'boywife', name: 'Boywife', cat: 'expression-presentation', sourced: true,
    desc: 'A feminine or submissive masculine partner occupying a wife-like role.',
    long: 'Boywife is an internet-native term for a masculine-presenting person, often young and queer, who takes a domestic or feminine partner role. It is used mostly as affectionate self-description and plays on the mismatch between "boy" and "wife" rather than asserting a gender identity.',
  },
  {
    slug: 'side-piece', name: 'Side Piece', cat: 'relationship-structures', sourced: true,
    desc: 'A secondary partner outside someone\'s primary relationship.',
    long: 'Side piece refers to a person someone is involved with alongside a main relationship. In common use it usually implies the primary partner does not know, which distinguishes it from the negotiated secondary partners of consensual non-monogamy. The term is informal and often dismissive.',
  },
  {
    slug: 'thot', name: 'Thot', cat: 'slang-terminology', sensitive: true, sourced: true,
    desc: 'A derogatory slang term for a promiscuous woman, sometimes reclaimed.',
    long: 'Thot originated in African American Vernacular English as an acronym for "that ho over there" and spread widely through internet culture as an insult aimed mainly at women perceived as promiscuous. Like several such terms it has been partly reclaimed and used self-referentially, but it remains pejorative in most contexts.',
  },
  {
    slug: 'littlespace', name: 'Littlespace', cat: 'bdsm-power-exchange', sensitive: true, sourced: true,
    desc: 'The headspace a person enters when regressing to a childlike state in age play.',
    long: 'Littlespace is the mental state someone occupies while in a "little" role — relaxed, dependent and childlike. It is not always sexual: many people use it for comfort, stress relief or as part of a caregiver dynamic. Entering and leaving littlespace can be disorienting, which is why aftercare and a reliable way to signal distress matter, and why the caregiver role carries real responsibility.',
  },
  {
    slug: 'middlespace', name: 'Middlespace', cat: 'bdsm-power-exchange', sensitive: true, sourced: true,
    desc: 'A regressed headspace pitched at an older age than littlespace, roughly adolescent.',
    long: 'Middlespace is the counterpart to littlespace for people who regress to a "middle" role — broadly adolescent rather than young child. Middles often want more independence and negotiation within the dynamic than littles do, and the same aftercare and signalling considerations apply.',
  },
  {
    slug: 'muir-cap', name: 'Muir Cap', cat: 'gear-aesthetics', sourced: true,
    desc: 'The peaked leather cap that became the defining headwear of leather subculture.',
    long: 'The Muir cap is a stiff peaked leather cap, originally a motorcycle style made by the Muir company, that became the signature headwear of gay leather culture from the 1950s onward. In some traditional leather settings its wearing is governed by protocol and earned rather than simply bought.',
  },

  // ──────────────────────── practices & play ────────────────────────
  {
    slug: 'funishment', name: 'Funishment', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: true,
    desc: 'A "punishment" both partners enjoy, given for fun rather than correction.',
    long: 'Funishment is a play punishment given because both people want it, not because a rule was broken. Naming it separately matters in disciplinary dynamics: treating enjoyable play as real correction undermines actual punishment, and treating real correction as funishment can leave a submissive confused about what is being asked of them.',
  },
  {
    slug: 'over-the-knee-otk-spanking', name: 'Over-the-Knee (OTK) Spanking', cat: 'practices-play', adult: true, sensitive: true, sourced: true,
    desc: 'Spanking with the receiving partner draped across the giver\'s lap.',
    long: 'Over-the-knee spanking is the classic position for hand spanking, with the receiver across the giver\'s lap. The position offers close physical contact and control, and it keeps the strikes to the safest area — the fleshy part of the buttocks, away from the tailbone, kidneys and lower spine.',
  },
  {
    slug: 'chastity-key-holding', name: 'Chastity Key Holding', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: true,
    desc: 'Holding the key to a partner\'s chastity device, controlling their access to release.',
    long: 'A key holder keeps the key to a locked chastity device, which makes them responsible for when the wearer is released. The role carries real duties: devices must be removable promptly in an emergency, prolonged wear risks skin damage and circulation problems, and remote or long-distance arrangements need an agreed contingency if the holder becomes unreachable.',
  },
  {
    slug: 'inspection-play', name: 'Inspection Play', cat: 'practices-play', adult: true, sensitive: true, sourced: true,
    desc: 'Roleplay in which one partner formally examines another\'s body.',
    long: 'Inspection play is a scene in which a dominant partner examines a submissive\'s body in a structured, often ritualised way. It overlaps with medical play and with military or institutional roleplay, and its charge usually comes from exposure and scrutiny rather than from sensation.',
  },
  {
    slug: 'group-worship', name: 'Group Worship', cat: 'practices-play', adult: true, sensitive: true, sourced: true,
    desc: 'A scene in which several people direct adoration at one person.',
    long: 'Group worship is a scene where multiple participants focus attention and adoration on a single person — a body part, the whole body, or the person\'s dominance. It scales up body worship, and the added participants make negotiation and a clear scene lead more important, not less.',
  },
  {
    slug: 'non-sexual-kink', name: 'Non-Sexual Kink', cat: 'kink-community', sensitive: true, sourced: true,
    desc: 'Kink practised without sexual contact or intent.',
    long: 'A great deal of kink is not sexual. Rope, impact, service, protocol and age play are all practised by people who take satisfaction, focus or connection from them without any sexual element. Assuming kink is always sexual misreads what many practitioners are doing and can make negotiation harder.',
  },
  {
    slug: 'soft-kink', name: 'Soft Kink', cat: 'kink-community', sensitive: true, sourced: true,
    desc: 'Lower-intensity kink, often an entry point for newcomers.',
    long: 'Soft kink is an informal label for lower-intensity practices — light restraint, blindfolds, gentle impact, teasing. The boundary is subjective and shifts with experience; what counts as soft for one person is not a fixed category.',
  },
  {
    slug: 'power-neutral', name: 'Power Neutral', cat: 'bdsm-power-exchange', sensitive: true, sourced: true,
    desc: 'Kink practised without any power exchange between participants.',
    long: 'Power neutral describes play where no one is dominant or submissive — partners engage in sensation, rope or other activity as equals. It gives a name to a position that the dominant/submissive/switch vocabulary otherwise leaves out.',
  },
  {
    slug: 'cowification', name: 'Cowification', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'A transformation kink centred on being turned into, or treated as, a cow.',
    long: 'Cowification is a transformation and objectification fantasy in which a person is treated as livestock, usually involving milking imagery, and often overlapping with lactation and pet-play interests. It is generally roleplay and aesthetic rather than physical transformation.',
  },
  {
    slug: 'dumbification', name: 'Dumbification', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'An erotic fantasy of intelligence or awareness being reduced.',
    long: 'Dumbification is a kink in which a person is imagined or roleplayed as becoming less able to think clearly. It overlaps with bimbofication and with hypnosis and mind-control fantasies, and it is almost entirely a matter of framing and language rather than anything physical.',
  },
  {
    slug: 'forcefem', name: 'Forcefem', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Consensual roleplay of being compelled into a feminine presentation.',
    long: 'Forcefem, short for forced feminisation, is a kink in which a partner is roleplayed as being compelled to present femininely. The "force" is a fiction agreed in advance. Worth separating from gender identity: some people who enjoy it are exploring gender and some are not, and it is not evidence either way about a partner being trans.',
  },
  {
    slug: 'forcemasc', name: 'Forcemasc', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: true,
    desc: 'Consensual roleplay of being compelled into a masculine presentation.',
    long: 'Forcemasc is the counterpart of forcefem: roleplay in which a partner is treated as being made to present masculinely. As with forcefem, the compulsion is agreed fiction, and it should not be read as a statement about the person\'s gender.',
  },
  {
    slug: 'forced-gagging', name: 'Forced Gagging', cat: 'practices-play', adult: true, sensitive: true, sourced: true,
    desc: 'Consensual play involving the gag reflex, usually during deep oral sex.',
    long: 'Forced gagging is play that deliberately triggers the gag reflex. It carries real risks — vomiting and aspiration among them — so it needs a non-verbal safe signal agreed in advance, since a gagging person cannot speak, and it is unwise on a full stomach.',
  },

  // ──────────────────────── health ────────────────────────
  {
    slug: 'hot-tub-folliculitis', name: 'Hot Tub Folliculitis', cat: 'health', sourced: true,
    desc: 'An itchy rash caused by Pseudomonas bacteria in inadequately treated hot tubs.',
    long: 'Hot tub folliculitis is a skin infection of the hair follicles caused by Pseudomonas aeruginosa, which survives in warm water that is not properly chlorinated. It appears a day or two after exposure as an itchy bumpy rash, typically worst where a swimsuit held water against the skin. It usually clears on its own within a week or two; persistent or spreading cases, or illness alongside it, warrant medical advice. It is relevant to venues with pools and hot tubs, where water treatment is the control.',
  },
  {
    slug: 'porn-induced-erectile-dysfunction-pied', name: 'Porn-Induced Erectile Dysfunction (PIED)', cat: 'sexual-health', sensitive: true, sourced: true,
    desc: 'A contested claim that heavy pornography use causes erectile difficulty with partners.',
    long: 'PIED is the proposal that frequent pornography use can lead to difficulty achieving erection with a partner. It is widely discussed online but remains scientifically contested: the evidence base is limited and largely self-reported, and it is not an established diagnosis. Erectile difficulty has well-documented physical causes — cardiovascular disease and diabetes among them — that are worth excluding first, since erectile dysfunction is sometimes the earliest sign of a serious condition.',
  },
  {
    slug: 'testicular-health-and-care', name: 'Testicular Health and Care', cat: 'health', sourced: true,
    desc: 'Routine care and self-examination of the testicles.',
    long: 'Testicular self-examination means becoming familiar with the normal size, weight and texture of your testicles so that changes are noticeable. Testicular cancer is most common in men between roughly 15 and 45 and is highly treatable when found early, so a new painless lump, swelling or a change in firmness should be checked promptly. Sudden severe pain is different: it can indicate testicular torsion, which is a medical emergency requiring immediate attention.',
  },
  {
    slug: 'small-penis-positivity', name: 'Small Penis Positivity', cat: 'sexual-health', sensitive: true, sourced: true,
    desc: 'Affirming that penis size does not determine worth, desirability or sexual capability.',
    long: 'Small penis positivity pushes back on the widespread assumption that size determines sexual value. Measured average erect length is around 13 centimetres, well below what pornography and cultural messaging imply, and anxiety about size is a common source of genuine distress. It stands in direct contrast to small penis humiliation, which is a consensual kink built on the same cultural material — the difference being that one is a chosen scene and the other is an everyday message people do not consent to.',
  },
  {
    slug: 'venereophobia', name: 'Venereophobia', cat: 'mental-health', sensitive: true, sourced: true,
    desc: 'Persistent, disproportionate fear of contracting a sexually transmitted infection.',
    long: 'Venereophobia is anxiety about sexually transmitted infections severe enough to cause distress or interfere with life — repeated testing despite negative results, avoidance of intimacy, or checking behaviours. It is treatable, and it is distinct from the ordinary caution that leads people to test regularly and use protection. Where the fear persists after negative results, it is anxiety that needs addressing rather than more testing.',
  },

  // ──────────────────────── safety, community, culture ────────────────────────
  {
    slug: 'doxxing', name: 'Doxxing', cat: 'physical-digital-safety', sourced: true,
    desc: 'Publishing someone\'s private identifying information without consent, usually to enable harassment.',
    long: 'Doxxing is the release of private information — legal name, address, workplace, family details — with the effect or intent of exposing someone to harassment. For LGBTQ+ people it frequently means involuntary outing, and can put jobs, housing, immigration status and physical safety at risk, especially in places where being queer is criminalised. Anyone using a scene name or separate profile should assume linkage between identities is the thing worth protecting.',
  },
  {
    slug: 'awareness-team', name: 'Awareness Team', cat: 'safety-consent', sourced: true,
    desc: 'Designated people at an event responsible for handling consent violations and safety concerns.',
    long: 'An awareness team is a clearly identified group at a party, club or festival whom attendees can approach about a consent violation, harassment or feeling unsafe. Having named people with the authority to act — rather than leaving it to whoever is nearby — is one of the practical markers of an event that takes consent seriously. The term is most established in European party and kink scenes.',
  },
  {
    slug: 'cuddle-party', name: 'Cuddle Party', cat: 'events-scene', sourced: true,
    desc: 'A structured, explicitly non-sexual event for consensual platonic touch.',
    long: 'A cuddle party is a facilitated gathering for non-sexual affectionate touch, run to a set of ground rules: clothes stay on, every touch is asked for and can be refused, and a "no" needs no justification. The format was formalised in New York in 2004 and has since spread widely. The rules are the point — it functions as much as consent practice as it does as an event.',
  },
  {
    slug: 'nudist-gathering', name: 'Nudist Gathering', cat: 'events-scene', sensitive: true, sourced: true,
    desc: 'An organised event where participants are nude, typically non-sexual.',
    long: 'A nudist or naturist gathering is an event where being unclothed is the norm — at a beach, resort, club or organised meet. Established naturist settings are explicitly non-sexual and usually have firm rules about photography and staring. Legal status varies sharply by country and even by beach, so local rules are worth checking before travelling.',
  },
  {
    slug: 'key-party', name: 'Key Party', cat: 'events-scene', adult: true, sensitive: true, sourced: true,
    desc: 'A partner-swapping party where pairings are decided at random by drawing keys.',
    long: 'At a key party, attendees place their keys in a bowl and each draws one at random to determine who they go home with. Strongly associated with 1970s suburban swinging in the United States, it appears more often now as a cultural reference than as a common practice. As with any group setting, the arrangement only works where everyone has genuinely agreed in advance.',
  },
  {
    slug: '420-day', name: '420 Day', cat: 'events-scene', sensitive: true, sourced: true,
    desc: 'An annual cannabis observance held on 20 April.',
    long: '420 Day is marked on 20 April as a cannabis counterculture observance, with public gatherings in many cities. The number traces to a group of California students in the early 1970s who used "420" as a meeting time, and it spread through Grateful Dead fan networks. Cannabis remains illegal in many jurisdictions, and travellers should not assume tolerance at an event implies legality.',
  },
  {
    slug: 'international-fetish-day', name: 'International Fetish Day', cat: 'events-scene', sensitive: true, sourced: true,
    desc: 'An annual day supporting fetish and BDSM communities, held in January.',
    long: 'International Fetish Day is observed on the third Friday of January. It grew out of a UK campaign against the Criminal Justice and Immigration Act 2008, which criminalised possession of "extreme pornography", and was originally marked by wearing something fetish-related in public as a visibility action — the "Perverts Wear Purple" campaign.',
  },
  {
    slug: 'story-of-o', name: 'Story of O', cat: 'art-literature-zines', adult: true, sensitive: true, sourced: true,
    desc: 'The 1954 French erotic novel by Anne Desclos, foundational to modern BDSM literature.',
    long: 'Histoire d\'O was published in 1954 under the pen name Pauline Réage; the author was later revealed to be Anne Desclos. It follows a woman\'s progressive submission and is among the most influential works in BDSM literature, both for its imagery and for the debates it provoked about consent, agency and whether it reads as liberation or its opposite. It was written by a woman, which was itself contested for decades.',
  },
  {
    slug: 'fifty-shades-of-grey', name: 'Fifty Shades of Grey', cat: 'media-film-music', sensitive: true, sourced: true,
    desc: 'The 2011 E. L. James novel that brought BDSM imagery into mainstream culture.',
    long: 'Fifty Shades of Grey began as Twilight fan fiction and became one of the best-selling novels of its decade, followed by sequels and films. Its cultural effect is genuine — it brought kink into ordinary conversation and sold a great many restraints — but it is widely criticised within kink communities for depicting a relationship that ignores negotiation and consent, and for presenting controlling behaviour as romance.',
  },
  {
    slug: 'the-omegaverse', name: 'The Omegaverse', cat: 'art-literature-zines', adult: true, sensitive: true, sourced: true,
    desc: 'A fan-fiction genre built on an alpha/beta/omega social and biological hierarchy.',
    long: 'The Omegaverse, or A/B/O, is a fan-fiction setting in which people belong to secondary sexes — alpha, beta or omega — with associated dynamics such as heats, ruts, scent bonding and mating. It began in Supernatural fandom around 2010 and spread widely, particularly in male/male romance. It has since become a commercial genre in its own right.',
  },
  {
    slug: 'dark-romance', name: 'Dark Romance', cat: 'art-literature-zines', adult: true, sensitive: true, sourced: true,
    desc: 'A romance genre featuring morally compromised protagonists and coercive or violent themes.',
    long: 'Dark romance is a romance subgenre whose relationships involve captivity, coercion, revenge or violence, usually with a possessive antihero. Readers generally treat it as fantasy explicitly separated from real relationship standards, and the genre relies heavily on content warnings for that reason.',
  },
  {
    slug: 'asmr', name: 'ASMR', cat: 'media-film-music', sourced: true,
    desc: 'A tingling sensation on the scalp and neck triggered by certain sounds or attention.',
    long: 'Autonomous Sensory Meridian Response describes a pleasant tingling that begins on the scalp and travels down the neck and spine, commonly triggered by whispering, tapping, close personal attention or careful repetitive sounds. It supports a very large body of video and audio content. Most people who seek it out describe it as relaxing rather than sexual, though a minority experience it erotically, and the two uses coexist.',
  },
  {
    slug: 'bagpiping', name: 'Bagpiping', cat: 'practices-play', adult: true, sensitive: true, sourced: true,
    desc: 'Slang for rubbing a penis in a partner\'s armpit.',
    long: 'Bagpiping is slang for using the armpit for penetrative-style stimulation, the name coming from the arm position it requires. It frequently overlaps with armpit fetishism.',
  },

  // ───────────────────── gender & orientation microlabels ─────────────────────
  {
    slug: 'omnigender', name: 'Omnigender', cat: 'gender-identity', sourced: true,
    desc: 'A gender identity encompassing all genders rather than one.',
    long: 'Omnigender describes someone whose gender includes every gender rather than sitting at one point. It differs from pangender mainly by community usage rather than by definition, and both are distinct from agender, which is the absence of gender. Whether the genders are experienced simultaneously or in turn varies by person.',
  },
  {
    slug: 'pivotgender', name: 'Pivotgender', cat: 'gender-identity', sourced: false,
    desc: 'A gender identity that turns around a fixed anchor while the rest shifts.',
    long: 'Pivotgender appears to describe a gender that has one constant reference point with the remainder moving around it, so the person is neither wholly static nor wholly fluid. The reading is drawn from the word itself; the term is not attested outside community glossaries and the definition is a reasoned guess pending review by someone who uses it.',
  },
  {
    slug: 'maverick', name: 'Maverick', cat: 'gender-identity', sourced: true,
    desc: 'A nonbinary gender defined on its own terms rather than by reference to the binary.',
    long: 'Maverick is a nonbinary identity for people whose gender cannot be described as partly male, partly female, or in between, because it does not use the binary as a reference frame at all. It was coined within autistic nonbinary communities, where the vocabulary of masculine and feminine often fails to describe anything a person recognises.',
  },
  {
    slug: 'faggot', name: 'Faggot', cat: 'sexual-orientation', adult: true, sensitive: true, sourced: true,
    desc: 'A slur for a gay man, reclaimed by some as a self-descriptor and as a kink role.',
    long: 'Faggot is an English slur for gay men with a long history of use in violence and harassment. Some gay and queer people reclaim it as a defiant self-description, and in kink it also names a submissive role built around that reclamation. Reclamation is first-person only: it belongs to the people it is used against, and it is not a word for anyone else to apply to them.',
  },
  {
    slug: 'almondsexual', name: 'Almondsexual', cat: 'sexual-orientation', sourced: false,
    desc: 'An orientation microlabel whose meaning is not attested outside community glossaries.',
    long: 'Almondsexual is listed as an orientation microlabel but has no documented definition anywhere it can be checked, and the name gives no reliable clue to what it describes. Rather than invent a meaning, this entry records that the term is in use and that its definition is unknown until someone who uses it supplies one.',
  },
  {
    slug: 'animesexual', name: 'Animesexual', cat: 'sexual-orientation', sourced: false,
    desc: 'Attraction directed at anime characters rather than at real people.',
    long: 'Animesexual reads as a label for people whose sexual attraction is directed at animated characters, placing it near fictosexual. The reading follows from the name; the term is not documented outside community glossaries, so this definition is a reasoned guess.',
  },
  {
    slug: 'cratosexual', name: 'Cratosexual', cat: 'sexual-orientation', sourced: false,
    desc: 'Attraction to power or authority itself rather than to a gender.',
    long: 'From the Greek kratos, power. The name points to attraction organised around power, strength or authority rather than around a partner\'s gender, which would make it an orientation-shaped statement of what is more often described as a D/s preference. The reading is inferred from the root and awaits confirmation.',
  },
  {
    slug: 'demiflexible', name: 'Demiflexible', cat: 'sexual-orientation', sourced: false,
    desc: 'Mostly attracted to one gender, with occasional flexibility toward others.',
    long: 'Demiflexible combines the demi- prefix with flexible, suggesting someone whose attraction sits mainly with one gender but is not closed to others. It sits near heteroflexible and homoflexible. The reading is drawn from the name and is not independently documented.',
  },
  {
    slug: 'kinksexual', name: 'Kinksexual', cat: 'sexual-orientation', sourced: false,
    desc: 'Someone for whom kink, not gender, is the axis their attraction runs along.',
    long: 'Kinksexual reads as a label for people whose sexual attraction is organised around kink rather than around a partner\'s gender or body, closer to how an orientation works than to a preference. Some people do describe kink identity in exactly those terms, and the label appears to name that. Inferred from the term; not otherwise documented.',
  },
  {
    slug: 'mutosexual', name: 'Mutosexual', cat: 'sexual-orientation', sourced: false,
    desc: 'An orientation microlabel whose meaning is not attested outside community glossaries.',
    long: 'Mutosexual is listed as an orientation microlabel. The Latin root muto-, meaning change, suggests something about shifting attraction, but that is a guess from etymology alone and could equally be wrong. The term is not documented anywhere it can be checked, and it is recorded here without a confident definition rather than with an invented one.',
  },
  {
    slug: 'myrsexual', name: 'Myrsexual', cat: 'sexual-orientation', sourced: false,
    desc: 'Attraction experienced as many distinct orientations at once.',
    long: 'Myrsexual appears to derive from myriad and to describe someone who holds several orientations simultaneously rather than one. It belongs to the same family of multi-orientation microlabels as polysexual and omnisexual, though it is not interchangeable with either. Inferred from the name.',
  },
  {
    slug: 'sadosexual', name: 'Sadosexual', cat: 'sexual-orientation', adult: true, sensitive: true, sourced: false,
    desc: 'Someone whose sexuality is organised around inflicting pain rather than around gender.',
    long: 'Sadosexual reads as a label for people for whom sadism is not a preference layered on top of a sexuality but is the sexuality itself. Framing it as an orientation is a claim about how central it is, not a clinical statement. The reading is inferred from the name; consent and negotiation apply exactly as they do to any sadistic practice.',
  },
  {
    slug: 'scrosexuality', name: 'Scrosexuality', cat: 'sexual-orientation', sourced: false,
    desc: 'An orientation microlabel whose meaning is not attested outside community glossaries.',
    long: 'Scrosexuality is listed as an orientation but has no documented definition that can be checked and no root that reliably indicates its meaning. It is recorded so the term exists in the glossary, with its definition left open rather than guessed.',
  },
  {
    slug: 'platoniromantic', name: 'Platoniromantic', cat: 'sexual-orientation', sourced: false,
    desc: 'Someone who cannot cleanly separate platonic from romantic attraction.',
    long: 'Platoniromantic names an experience in which the line between deep friendship and romantic feeling does not resolve: the attraction is real but does not sort into either category. It sits alongside quoiromantic, which makes a similar claim about the usefulness of the romantic and platonic distinction. Inferred from the name.',
  },

  // ─────────────────────── relationships & structures ────────────────────────
  {
    slug: 'best-friend', name: 'Best Friend', cat: 'relationship-structures', sourced: true,
    desc: 'The closest person in someone\'s life who is not a romantic or sexual partner.',
    long: 'A best friend is the person someone is closest to outside a romantic or sexual relationship. For many queer people the role carries weight a partner-centred model does not account for: best friends are often the people who provide housing, care, emergency contact and continuity, particularly where family of origin has withdrawn. Some relationship structures name the role explicitly rather than treating it as secondary by default.',
  },
  {
    slug: 'clan', name: 'Clan', cat: 'relationship-structures', sourced: false,
    desc: 'A large chosen-family group organised around shared kink or community identity.',
    long: 'Clan appears to name a chosen-family unit larger and looser than a household or polycule, bound by shared identity, leadership or scene rather than by a defined set of relationships between every member. The reading follows from ordinary usage of the word; the specific community sense is not otherwise documented.',
  },
  {
    slug: 'ddlg-kink-dynamic', name: 'DDlg Kink Dynamic', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: true,
    desc: 'A daddy-dom and little-girl age-play power dynamic between consenting adults.',
    long: 'DDlg pairs a caregiver role with a regressed or little role, mixing authority, nurture and structure. It is a dynamic between adults; the little role is a headspace, not a claim about age, and the vocabulary describes the feel of the relationship rather than its participants. Practitioners distinguish it sharply from anything involving actual minors, and communities police that line hard.',
  },
  {
    slug: 'homance', name: 'Homance', cat: 'relationship-structures', sourced: true,
    desc: 'An intense non-romantic bond between men, close to romance in everything but sex.',
    long: 'Homance describes a friendship between men carrying the intimacy, exclusivity and emotional intensity usually reserved for romance, without being sexual. Where the joke word bromance keeps a defensive distance, homance is often used more sincerely, including by queer men naming a bond that a romantic label would misdescribe.',
  },
  {
    slug: 'in-service-to', name: 'In Service To', cat: 'bdsm-power-exchange', sourced: true,
    desc: 'The standard phrasing for a submissive\'s committed service relationship to a specific person.',
    long: 'To be in service to someone is to hold an ongoing, negotiated obligation to meet their needs, whether domestic, protocol, sexual or a mix, within a specific relationship rather than as a general disposition. The phrasing is deliberate: it names the person served, which is why service-oriented submissives use it in place of a bare role label.',
  },
  {
    slug: 'ommer', name: 'Ommer', cat: 'relationships-family', sourced: true,
    desc: 'A gender-neutral word for a parent\'s sibling, in place of aunt or uncle.',
    long: 'Ommer is a gender-neutral kinship term for a parent\'s sibling, adapted from Scandinavian usage into English by nonbinary people and their families. English has no neutral word in that slot, and ommer fills it alongside coinages like pibling, with nibling covering the reciprocal relation.',
  },
  {
    slug: 'primal-mate', name: 'Primal Mate', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A committed partner within primal play, framed in animal-pairing terms.',
    long: 'Primal mate reads as the ongoing-partner role inside primal play, where interaction is instinctive and non-verbal rather than protocol-driven, and the relationship is framed in the language of mating rather than of ownership or service. Inferred from the term; the framing is a mode of play between consenting adults, not a claim about how humans work.',
  },
  {
    slug: 'sister-slut', name: 'Sister Slut', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: false,
    desc: 'A submissive who shares a service or sexual role with others as siblings.',
    long: 'Sister slut appears to name a submissive who is one of several serving the same dominant and who relates to the others as siblings rather than as rivals. It sits alongside the sibling framing already common in leather families. Inferred from the name.',
  },
  {
    slug: 'switchuationship', name: 'Switchuationship', cat: 'relationship-structures', sourced: false,
    desc: 'An undefined relationship between two switches where roles are never settled.',
    long: 'A portmanteau of switch and situationship: a connection in which neither the relationship status nor who tops is ever pinned down, and both keep moving. The reading follows from the construction; the term is playful and is not documented outside community usage.',
  },
  {
    slug: 'step-sister', name: 'Step-Sister', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: true,
    desc: 'A role-play framing borrowed from a pornography genre, played between adults.',
    long: 'Step-sister is a role-play scenario drawn from a pornography genre built on non-blood family framing. It is played between consenting adults and its appeal is the transgression of a taboo without any of the substance of one, since the participants are unrelated. The framing is fiction the whole way down, which is what distinguishes it from anything it superficially resembles.',
  },
  {
    slug: 'stray', name: 'Stray', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A pet-play role for someone unclaimed and not attached to a handler.',
    long: 'Stray reads as a pet-play identity for someone who has no owner or handler, independent by choice or simply not yet claimed, in contrast to a pet in a settled dynamic. The reading follows from the word and from how pet-play vocabulary otherwise works. Not independently documented.',
  },
  {
    slug: 'latex-family', name: 'Latex Family', cat: 'gear-aesthetics', adult: true, sourced: false,
    desc: 'A chosen-family group organised around shared latex fetishism.',
    long: 'Latex family appears to name a chosen-family unit whose shared ground is latex rather than leather: the same structure as a leather family, which mentors and confers standing within its own tradition, transposed onto a different material culture. Inferred from the term.',
  },
  {
    slug: 'affini', name: 'Affini', cat: 'subcultures', sourced: true,
    desc: 'The plant-based alien species of the Human Domestication Guide setting.',
    long: 'The Affini are a species of sapient plant-like aliens in the Human Domestication Guide, a shared science-fiction setting popular in transgender and kink fandom. They take human companions, called florets, into affectionate but total care. The setting is used to explore surrender, transformation and being kept, and its vocabulary has spread beyond the stories themselves.',
  },
  {
    slug: 'floret-flort', name: 'Floret / Flort', cat: 'subcultures', sourced: true,
    desc: 'A human companion of an Affini in the Human Domestication Guide setting; flort is the neutral form.',
    long: 'A floret is a human taken as a companion by an Affini in the Human Domestication Guide setting, cared for completely and no longer responsible for themselves. Floret is the feminine form and flort the gender-neutral one. Outside the fiction people use the words for a real dynamic of total care and surrender, which is why they appear in kink vocabulary at all.',
  },

  // ──────────────────────── dynamics & roles (A–F) ────────────────────────────
  {
    slug: 'aftercare-specialist', name: 'Aftercare Specialist', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'Someone whose role in a scene or a space is looking after people afterwards.',
    long: 'Aftercare specialist reads as a role for someone who takes responsibility for the come-down rather than for the scene itself: warmth, food, water, quiet company and a check that the other person is landing safely. At play parties the function often exists informally, and naming it makes it something a person can offer rather than something everyone assumes someone else is doing. Inferred from the term.',
  },
  {
    slug: 'alpha-brat', name: 'Alpha Brat', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A brat who leads the other brats rather than only resisting a dominant.',
    long: 'Alpha brat reads as a brat with standing among other brats, setting the tone for the mischief rather than acting alone. Bratting is resistance played for the pleasure of being overcome; an alpha brat is the one who organises it. Inferred from the term.',
  },
  {
    slug: 'anaconda', name: 'Anaconda', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A rope top whose style is slow, constricting full-body binding.',
    long: 'Anaconda reads as a rope role named for the snake: binding that closes gradually and tightens around the whole body rather than fixing a limb to a point. The reading follows from the name and from rope vocabulary, and the term is not otherwise documented. Constrictive full-body ties carry real circulation and breathing risk and are not a beginner practice.',
  },
  {
    slug: 'antagonizer', name: 'Antagonizer', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'Someone who provokes their partner deliberately as their contribution to a scene.',
    long: 'Antagonizer reads as a role built on provocation: winding a partner up on purpose so that the reaction is the point. It overlaps with bratting but is framed from the provoker\'s side rather than the resister\'s, and it can be played from either end of a dynamic. Inferred from the term.',
  },
  {
    slug: 'anthropologist', name: 'Anthropologist', cat: 'kink-community', sourced: false,
    desc: 'Someone whose engagement with a scene is observation and study rather than play.',
    long: 'Anthropologist reads as a self-deprecating label for someone present in kink spaces mainly to watch, learn and understand how the community works rather than to play. It is close to how many newcomers describe their first year, and unlike voyeurism it is not framed as erotic. Inferred from the term.',
  },
  {
    slug: 'alpha-woman', name: 'Alpha Woman', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A woman who takes the leading role in a dynamic as a matter of identity.',
    long: 'Alpha woman reads as a dominant identity for women framed around natural leadership rather than around technique or protocol. It sits near matriarch and femdom without being interchangeable with either: femdom names the direction of the power, alpha woman names the disposition behind it. Inferred from the term.',
  },
  {
    slug: 'anal-whore', name: 'Anal Whore', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: false,
    desc: 'A self-applied role for someone who wants anal sex enthusiastically and often.',
    long: 'Anal whore is a self-applied role centred on receptive anal sex, using the reclaimed vocabulary of sluttiness that runs through much kink self-description. It is a term of enthusiasm from the inside, not a description to apply to anyone else. Inferred from the term.',
  },
  {
    slug: 'auralist', name: 'Auralist', cat: 'fetishes-interests', adult: true, sourced: false,
    desc: 'Someone for whom sound and voice are the primary erotic channel.',
    long: 'Auralist reads as a label for people whose arousal runs through hearing first: voice, breath, spoken instruction, audio erotica or the sounds a partner makes. It overlaps with narratophilia, which is specifically about erotic language rather than sound in general. Inferred from the term.',
  },
  {
    slug: 'bite-risk', name: 'Bite Risk', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A warning-as-identity for a primal or pet-play partner who bites.',
    long: 'Bite risk reads as a half-joking self-label warning that the person bites when played with, worn by primal and pet-play types where biting is part of the vocabulary. Like most such labels it functions as disclosure: it tells a prospective partner what to negotiate about. Inferred from the term.',
  },
  {
    slug: 'bratty-little', name: 'Bratty Little', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'Someone whose little headspace is defiant rather than compliant.',
    long: 'Bratty little combines age-play regression with bratting: the little role is present, but expressed as testing limits and refusing instructions rather than as compliance and comfort-seeking. Both are adult headspaces. Inferred from the composed term.',
  },
  {
    slug: 'bratty-switch', name: 'Bratty Switch', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A switch who brings bratting to both ends of the dynamic.',
    long: 'A bratty switch takes both dominant and submissive roles and brings the same provoking, playful resistance to each — bratting up as a submissive and being deliberately winding as a dominant. Inferred from the composed term.',
  },
  {
    slug: 'bunnygirl', name: 'Bunnygirl', cat: 'bdsm-power-exchange', adult: true, sourced: true,
    desc: 'A feminine pet-play identity built on rabbit characteristics.',
    long: 'Bunnygirl is a pet-play persona drawing on rabbit imagery: skittish, soft, easily startled, often paired with ears and a tail. It sits in the same family as kittengirl and puppygirl, and the persona is a headspace rather than a costume, though gear usually supports it. In some usage it also borrows from the cocktail-lounge bunny aesthetic.',
  },
  {
    slug: 'chaos-creature', name: 'Chaos Creature', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A self-label for someone whose play is unpredictable and feral rather than structured.',
    long: 'Chaos creature reads as a self-description for someone who does not run to protocol: play is instinctive, disorderly and hard to predict, and that is the appeal rather than a failure of discipline. It is one of a family of chaos-prefixed self-labels used more for flavour than for structure. Inferred from the term.',
  },
  {
    slug: 'chaos-cutie', name: 'Chaos Cutie', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A softer variant of the chaos self-label: disruptive, but sweet with it.',
    long: 'Chaos cutie pairs disorder with cuteness — someone who causes trouble and is forgiven for it, which is itself the dynamic. It belongs to the same informal family as chaos creature and chaos princess. Inferred from the term.',
  },
  {
    slug: 'charge-master-charge-mistress', name: 'Charge Master / Charge Mistress', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A dominant role in electrical play, named for the charge rather than the implement.',
    long: 'Charge master and charge mistress read as gendered forms of a dominant role specialising in electrical play — violet wands, TENS units and similar. Electrical play has hard physical limits: current is kept below the waist and away from the chest, and never used on anyone with a pacemaker or a heart condition. Inferred from the term; the safety constraints are not.',
  },
  {
    slug: 'chaos-princess', name: 'Chaos Princess', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A princess-role variant whose demands are deliberately disruptive.',
    long: 'Chaos princess combines the princess role, where being served and indulged is the point, with deliberate disorder — entitled and unpredictable at once. Inferred from the composed term.',
  },
  {
    slug: 'cigarette-top', name: 'Cigarette Top', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: false,
    desc: 'A dominant role centred on smoking, ash and cigarette play.',
    long: 'Cigarette top reads as the dominant side of smoking fetishism, where the cigarette is the focus of the scene through smoke, ash, and in some practice deliberate burns. Burn play causes real injury and infection risk and is at the far edge of edge play; the smoking aesthetic and actual burns are separate practices with very different consequences. Inferred from the term.',
  },
  {
    slug: 'clown-handler', name: 'Clown Handler', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'The counterpart role to a clown persona in fool or circus-themed play.',
    long: 'Clown handler reads as the managing role opposite a clown persona, in the same relational shape as a pet and their handler. Clown and harlequin personas turn foolishness and performance into a submissive or trickster role, and the handler is the one who directs it. Inferred from the term.',
  },
  {
    slug: 'cock-enthusiast', name: 'Cock Enthusiast', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A cheerful self-label for someone with a pronounced enthusiasm for penises.',
    long: 'Cock enthusiast reads as a light self-description rather than a role in a dynamic: it states a preference plainly and with humour, and says nothing about whether the person is dominant, submissive or neither. Inferred from the term.',
  },
  {
    slug: 'conditional-sub', name: 'Conditional Sub', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'Someone who submits only to specific people or under specific conditions.',
    long: 'Conditional sub reads as a submissive whose submission is not a general disposition but is granted under stated conditions — to a particular person, in a particular context, or once particular terms are met. Naming it forestalls the assumption that a submissive submits to anyone who asks. Inferred from the term.',
  },
  {
    slug: 'connection-whore', name: 'Connection Whore', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A self-label for someone who plays for intimacy rather than for sensation.',
    long: 'Connection whore reads as a self-description for someone whose appetite is for the closeness a scene produces rather than for the technique or the sensation in it: they would rather have a slow scene with someone they are connected to than an impressive one with a stranger. Inferred from the term.',
  },
  {
    slug: 'courtesan', name: 'Courtesan', cat: 'bdsm-power-exchange', adult: true, sourced: true,
    desc: 'Historically a companion to wealthy patrons; used in kink for a cultivated, service-oriented role.',
    long: 'A courtesan was historically a companion to wealthy or noble patrons, offering conversation, culture and social presence as much as sex, and often holding standing and independence unusual for women of the period. In kink the word names a role built on that model: refinement, hospitality and attentive service rather than obedience, closer to a companion than to a servant.',
  },
  {
    slug: 'cuddlee', name: 'Cuddlee', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'The receiving side of a cuddling dynamic.',
    long: 'Cuddlee names the person being held in a cuddling dynamic, as against the cuddler doing the holding. The pairing formalises non-sexual touch as something with roles and preferences, which matters for people who want physical closeness explicitly separated from sex. Inferred from the term.',
  },
  {
    slug: 'cuddler', name: 'Cuddler', cat: 'bdsm-power-exchange', sourced: true,
    desc: 'Someone who gives affectionate non-sexual physical closeness.',
    long: 'A cuddler is the holding side of a cuddling dynamic: warmth, weight and steady contact offered without sex being the destination. Professional cuddling exists as a service, and within kink the role is often part of aftercare or a standalone need in its own right. Non-sexual touch still requires consent and negotiation.',
  },
  {
    slug: 'cuddle-switch', name: 'Cuddle Switch', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'Someone who both gives and receives in a cuddling dynamic.',
    long: 'Cuddle switch is the switch position of the cuddler and cuddlee pair: comfortable being held and holding, and moving between the two within one session or across a relationship. Inferred from the composed term.',
  },
  {
    slug: 'cunnilinguist', name: 'Cunnilinguist', cat: 'bdsm-power-exchange', adult: true, sourced: true,
    desc: 'A punning self-label for someone skilled at and devoted to oral sex on a vulva.',
    long: 'Cunnilinguist puns on linguist to name someone who considers oral sex on a vulva a practised craft rather than an incidental act. It is a self-applied label expressing both enthusiasm and a claim to competence, and it says nothing about the person\'s role in a power dynamic.',
  },
  {
    slug: 'denied-slave', name: 'Denied Slave', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A slave role whose defining condition is long-term orgasm denial.',
    long: 'Denied slave reads as a total-power-exchange role in which the submissive\'s orgasm is permanently controlled and mostly withheld, so denial is the ongoing state rather than an occasional scene. Long-term denial and chastity need attention to hygiene, circulation and mental state, and a stated way out. Inferred from the term.',
  },
  {
    slug: 'dirty-girl', name: 'Dirty Girl', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: false,
    desc: 'A feminine self-label built on reclaiming sexual shame as pleasure.',
    long: 'Dirty girl reads as a self-applied role that takes the language used to shame women for wanting sex and wears it as appetite instead. Like most reclaimed vocabulary it works from the inside and not as a description applied by others. Inferred from the term.',
  },
  {
    slug: 'divine', name: 'Divine', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A dominant role framed as an object of worship rather than a commander.',
    long: 'Divine reads as a dominant identity built on reverence: the submissive\'s posture is devotional and the dominant\'s authority comes from being adored rather than from giving orders. It sits alongside goddess and deity roles and pairs naturally with worship-style service. Inferred from the term.',
  },
  {
    slug: 'dogboy', name: 'Dogboy', cat: 'bdsm-power-exchange', adult: true, sourced: true,
    desc: 'A masculine pet-play identity built on canine behaviour and headspace.',
    long: 'Dogboy is a pet-play persona in which someone takes on canine behaviour, posture and mindset: loyalty, eagerness, non-verbal communication and a handler to answer to. It overlaps with pup play, which has its own gear culture and a substantial gay-leather history; dogboy is used both inside and outside that tradition. The headspace is the point, and gear supports it rather than defining it.',
  },
  {
    slug: 'doggirl', name: 'Doggirl', cat: 'bdsm-power-exchange', adult: true, sourced: true,
    desc: 'A feminine pet-play identity built on canine behaviour and headspace.',
    long: 'Doggirl is the feminine counterpart to dogboy: a pet-play persona built on canine behaviour, devotion and non-verbal communication, usually paired with a handler or owner. As with all pet play the persona is a headspace between consenting adults and gear supports it rather than constituting it.',
  },
  {
    slug: 'elder-brat', name: 'Elder Brat', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A long-standing brat with seniority in the community.',
    long: 'Elder brat reads as a title of affectionate seniority: someone who has been bratting for years, knows the community and its history, and mentors newer brats without giving up the role. Inferred from the term.',
  },
  {
    slug: 'electro-slut', name: 'Electro Slut', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'An enthusiastic bottom for electrical play.',
    long: 'Electro slut reads as a self-applied bottom label for someone who seeks out electrical play — violet wands, TENS units, e-stim — with enthusiasm. The safety constraints are fixed regardless of enthusiasm: current stays below the waist, never crosses the chest, and is never used on anyone with a pacemaker or a heart condition. Inferred from the term.',
  },
  {
    slug: 'emotional-support-sub', name: 'Emotional Support Sub', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A submissive whose service is primarily emotional care.',
    long: 'Emotional support sub reads as a service role in which the work is steadiness and care rather than domestic tasks or protocol: being present, absorbing stress, and holding a dominant\'s difficult days. The name borrows the emotional-support-animal construction as a joke, but the labour it describes is real and needs the same reciprocity as any other service arrangement. Inferred from the term.',
  },
  {
    slug: 'escape-artist', name: 'Escape Artist', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A bondage bottom whose pleasure is in trying to get out.',
    long: 'Escape artist reads as a bondage bottom who treats the tie as a puzzle and a contest, testing whether they can get free rather than settling into stillness. It requires a top who ties accordingly and safety cutters within reach, since struggling against rope tightens it and raises the circulation risk. Inferred from the term.',
  },
  {
    slug: 'fairy-gay-mother', name: 'Fairy Gay Mother', cat: 'kink-community', sourced: true,
    desc: 'An older queer person who guides someone newly out through queer life.',
    long: 'A fairy gay mother is the queer version of the fairy godmother: the older or more experienced person who takes someone newly out in hand and shows them how any of it works, from the bars to the vocabulary to the relationships. The role is a real fixture of queer community life, filling the gap left where families of origin do not, and the joke in the name does not make the mentorship less serious.',
  },
  {
    slug: 'femboydom', name: 'Femboydom', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A dominant who is feminine-presenting and masculine-identified.',
    long: 'Femboydom reads as a dominant role held by a femboy: feminine presentation, masculine identity, and authority exercised without the presentation being read as submission. The label exists because the assumption that femininity implies submission is common enough to need contradicting explicitly. Inferred from the composed term.',
  },
  {
    slug: 'femdom', name: 'Femdom', cat: 'bdsm-power-exchange', adult: true, sourced: true,
    desc: 'Female domination: a woman or feminine person in the dominant role.',
    long: 'Femdom is the standard shorthand for female dominance, covering both the practice and the identity. It names the direction of the power rather than a style, so it spans everything from strict protocol to sadism to sensual control. It carries its own long-standing commercial and community history, including professional domination, and overlaps with but is not the same as matriarchy or female-led relationships.',
  },
  {
    slug: 'feral-princess-feral-prince', name: 'Feral Princess / Feral Prince', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A role combining royal entitlement with primal, uncivilised behaviour.',
    long: 'Feral princess and feral prince read as roles that pair the pampered, indulged framing of royalty with primal play\'s wildness: adored and untamed at once, expecting to be served without behaving well about it. Inferred from the term.',
  },
  {
    slug: 'firefly', name: 'Firefly', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A light, elusive play role named for the insect.',
    long: 'Firefly reads as a self-label for someone bright, brief and hard to hold onto in play — present in flashes rather than settled into a long dynamic. The reading is drawn from the imagery alone and the term is not otherwise documented. Some usage may instead relate it to fire play, which would be a different meaning entirely.',
  },
  {
    slug: 'fire-masochist', name: 'Fire Masochist', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: false,
    desc: 'A bottom who seeks out the sensation of fire play.',
    long: 'Fire masochist reads as a bottom whose preferred sensation is fire play: brief controlled flame on the skin, usually with alcohol and a damp cloth to extinguish. Fire play is edge play with a real burn risk and demands a top who knows the technique, a fire blanket and clear escape from the area. Inferred from the term; the safety requirements are not.',
  },
  {
    slug: 'fire-sadist', name: 'Fire Sadist', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: false,
    desc: 'A top who specialises in fire play.',
    long: 'Fire sadist reads as the top counterpart to a fire masochist: someone who has learned to apply controlled flame to skin as a sensation practice. Fire play requires training, fuel discipline, a fire blanket, hair and clothing management, and a bottom who has consented to a technique with a genuine burn risk. Inferred from the term; the requirements are not.',
  },
  {
    slug: 'first-girl', name: 'First Girl', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'The senior submissive in a household with several.',
    long: 'First girl reads as a rank within a poly or household dynamic: the longest-standing or highest-standing submissive, often with responsibility for the others. It parallels the alpha designation in hierarchical polyamory, and like all such ranks it works only where everyone agrees what it means. Inferred from the term.',
  },
  {
    slug: 'fisting-daddy-fisting-mommy', name: 'Fisting Daddy / Fisting Mommy', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A caregiver-framed top who specialises in fisting.',
    long: 'Fisting daddy and fisting mommy read as caregiver-styled top roles specialising in fisting, where the framing is patient and instructive rather than harsh. Fisting requires long preparation, copious lubricant, short nails or gloves, and constant communication; injury from rushing is the main risk. Inferred from the term; the practice requirements are not.',
  },
  {
    slug: 'fisting-prince-fisting-princess', name: 'Fisting Prince / Fisting Princess', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A bottom identity for someone who takes fisting with pride.',
    long: 'Fisting prince and fisting princess read as bottom-side identities carrying the royal framing already common in kink self-description: taking fisting is treated as an accomplishment rather than merely an act. The practice needs preparation, lubricant and unhurried pacing. Inferred from the term.',
  },
  {
    slug: 'fisting-switch', name: 'Fisting Switch', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'Someone who both gives and receives fisting.',
    long: 'Fisting switch reads as someone comfortable on both sides of fisting rather than fixed as top or bottom. Inferred from the composed term; the same preparation, lubricant and pacing apply in either direction.',
  },

  // ──────────────────────── dynamics & roles (F–P) ────────────────────────────
  {
    slug: 'fluffer', name: 'Fluffer', cat: 'bdsm-power-exchange', adult: true, sourced: true,
    desc: 'Someone whose job on a porn set is keeping a performer aroused between takes.',
    long: 'A fluffer is a crew role from pornography production: the person who keeps a performer erect and ready during the long gaps between shots. The job is less common than its reputation suggests, having largely been displaced by erectile medication and by performers managing it themselves. The word has since been borrowed into kink for the same function in a group scene, and more loosely for anyone who warms someone up for someone else.',
  },
  {
    slug: 'food-mommy', name: 'Food Mommy', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A caregiver role centred on feeding and nourishing a partner.',
    long: 'Food mommy reads as a caregiver dynamic in which feeding is the primary expression of care: cooking, providing and watching someone eat. It touches on feeding-related kink but the framing is nurturing rather than about weight or gluttony. Food dynamics need care where eating disorders are in play. Inferred from the term.',
  },
  {
    slug: 'fuckslut', name: 'Fuckslut', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: false,
    desc: 'A blunt self-applied label for someone with an enthusiastic appetite for sex.',
    long: 'Fuckslut is a self-applied role using the reclaimed vocabulary of sluttiness at its bluntest. As with the rest of that family it is an expression of appetite from the inside and not a description for anyone else to apply. Inferred from the term.',
  },
  {
    slug: 'gag-slut', name: 'Gag Slut', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: false,
    desc: 'A bottom who specifically enjoys being gagged.',
    long: 'Gag slut reads as a bottom label for someone whose particular pleasure is being gagged and silenced. Gags remove speech, so a non-verbal safe signal — a dropped object, a hand squeeze — has to be agreed before one goes in, and a gagged person can never be left alone. Inferred from the term; the safety rule is standard.',
  },
  {
    slug: 'gangbang-slut', name: 'Gangbang Slut', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: false,
    desc: 'A self-applied label for someone who enjoys being the focus of group sex.',
    long: 'Gangbang slut reads as a self-applied role for someone whose appetite is to be the centre of a group scene. Group scenes need explicit negotiation on numbers, acts, barriers and how anyone stops the scene, since the person at the centre is the least able to manage the room. Inferred from the term.',
  },
  {
    slug: 'gear-fetishist', name: 'Gear Fetishist', cat: 'fetishes-interests', adult: true, sourced: true,
    desc: 'Someone whose fetish is the equipment itself rather than an act.',
    long: 'A gear fetishist is aroused by kit — leather, rubber, harnesses, uniforms, boots, sports and industrial equipment — as the object of the fetish rather than as a prop for something else. Gear cultures carry their own codes and events, and for many people the material is what the scene is about, not the acts done while wearing it.',
  },
  {
    slug: 'gentle-dom-me', name: 'Gentle Dom(me)', cat: 'bdsm-power-exchange', sourced: true,
    desc: 'A dominant whose authority is expressed through warmth rather than harshness.',
    long: 'A gentle dominant holds real authority but exercises it through praise, patience and care rather than through severity, degradation or pain. The style is not softer in the sense of less controlling — the control is total and the tone is kind. It is often what people mean when they say they want to submit but not to be hurt.',
  },
  {
    slug: 'gentle-femdom', name: 'Gentle Femdom', cat: 'bdsm-power-exchange', adult: true, sourced: true,
    desc: 'Female domination in a warm, praising register rather than a strict one.',
    long: 'Gentle femdom combines female dominance with a nurturing style: encouragement and praise instead of humiliation, guidance instead of orders barked. It emerged partly as a corrective to a commercial image of femdom fixed on severity, and it is one of the more widely used style labels in the vocabulary.',
  },
  {
    slug: 'giggle-bottom', name: 'Giggle Bottom', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A bottom whose response to a scene is laughter rather than solemnity.',
    long: 'Giggle bottom reads as a bottom who laughs their way through play — nervous, delighted or both — rather than sinking into intensity. Naming it is useful because laughter is easily misread as not taking a scene seriously, when for some people it is simply what submission sounds like. Inferred from the term.',
  },
  {
    slug: 'giggle-masochist', name: 'Giggle Masochist', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A masochist who laughs at pain rather than gasping.',
    long: 'Giggle masochist reads as someone whose response to painful sensation is laughter. It is the same disconnection between expected and actual response as giggle bottom, applied specifically to pain, and a top has to learn to read it since it does not signal what it appears to. Inferred from the term.',
  },
  {
    slug: 'grappler', name: 'Grappler', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'Someone whose play is physical wrestling and struggle.',
    long: 'Grappler reads as a role for someone who plays through bodily contest — wrestling, pinning, resisting — rather than through implements or protocol. It sits close to primal play and to consensual non-consent, and it needs the ordinary safeguards of contact sport as well as those of kink: agreed limits on strikes and joints, and a way to tap out that both people will honour. Inferred from the term.',
  },
  {
    slug: 'grizzly-bear', name: 'Grizzly Bear', cat: 'subcultures', sourced: true,
    desc: 'A large, notably hairy and often greying bear within gay bear culture.',
    long: 'Grizzly bear is one of the many descriptors gay bear culture uses for body and hair type: bigger, hairier and often older or grey, at the more imposing end of the bear spectrum. The vocabulary is affectionate and self-applied, and the categories are loose rather than policed.',
  },
  {
    slug: 'guardian', name: 'Guardian', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A protective dominant role whose authority is framed as duty of care.',
    long: 'Guardian reads as a dominant identity built around protection rather than command: the authority exists because someone is being kept safe by it. It sits near daddy and caregiver roles without the family framing, and it also describes the role some people take at events, watching over a partner who is deep in a scene. Inferred from the term.',
  },
  {
    slug: 'helper', name: 'Helper', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A service role defined by being useful rather than by obedience.',
    long: 'Helper reads as a low-protocol service role: the satisfaction comes from being of practical use — carrying, fetching, tidying, assisting at an event — rather than from submission as such. It is a common entry point for people who find service comfortable long before they find obedience so. Inferred from the term.',
  },
  {
    slug: 'hippie', name: 'Hippie', cat: 'subcultures', sourced: true,
    desc: 'A counterculture identity of communal living, free love and anti-authoritarianism.',
    long: 'Hippie names the 1960s counterculture and its descendants: communal living, environmentalism, psychedelics, pacifism and a rejection of sexual convention that fed directly into later open-relationship and polyamory practice. Within kink and poly communities the label is still used for people whose approach to sex and relationships comes from that lineage rather than from BDSM tradition.',
  },
  {
    slug: 'honey-pot', name: 'Honey Pot', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'Someone who draws a partner in for someone else, or who is the lure in a scene.',
    long: 'Honey pot reads as a role built on being the attraction: the person who draws someone in, whether for a couple seeking a third or as the bait in a planned scenario. The espionage sense of the phrase — a person used to lure a target — is the source of the imagery. Any such arrangement is only a scene if everyone involved has actually agreed to it. Inferred from the term.',
  },
  {
    slug: 'hubull', name: 'Hubull', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A husband who also takes the bull role in his own relationship.',
    long: 'Hubull appears to be a portmanteau of husband and bull, naming a man who is both the partner and the dominant sexual figure in a dynamic where those are usually separate people. In cuckolding vocabulary the bull is the outside partner, so the term reads as a deliberate collapsing of that distinction. Inferred from the construction.',
  },
  {
    slug: 'kink-slut', name: 'Kink Slut', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A self-label for someone indiscriminately enthusiastic about kink itself.',
    long: 'Kink slut reads as a self-description for someone whose appetite is for kink broadly rather than for one practice: eager to try most things, not fixed on a specialty. Inferred from the term.',
  },
  {
    slug: 'latex-mistress', name: 'Latex Mistress', cat: 'bdsm-power-exchange', adult: true, sourced: true,
    desc: 'A female dominant whose practice and presentation centre on latex.',
    long: 'Latex mistress names a female dominant for whom rubber is central: her own presentation, the gear she puts a submissive into, or both. Latex carries its own aesthetic tradition in fetish photography and clubwear, and the material itself is often the fetish rather than a costume for something else. Latex garments need dressing aids and care, and latex allergy is common enough to ask about.',
  },
  {
    slug: 'latex-toy', name: 'Latex Toy', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A submissive role built on being encased in rubber and used as an object.',
    long: 'Latex toy reads as an objectification role in which rubber encasement is what turns a person into a thing to be used: the material removes individuality and the role is built on that. Full encasement restricts heat loss and can restrict breathing, so temperature, hydration and constant monitoring are not optional. Inferred from the term; the constraints are not.',
  },
  {
    slug: 'leather-mistress', name: 'Leather Mistress', cat: 'bdsm-power-exchange', adult: true, sourced: true,
    desc: 'A female dominant working within the leather tradition.',
    long: 'Leather mistress names a female dominant located in leather culture specifically — a tradition with its own history, protocols, titles and lineage growing out of post-war motorcycle clubs and gay leather bars, later joined by women\'s and pansexual leather communities. The label carries more than a material preference: it places someone within that tradition and its expectations of mentorship and earned standing.',
  },
  {
    slug: 'lover-boy', name: 'Lover Boy', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A masculine role built on romance and attentiveness rather than dominance.',
    long: 'Lover boy reads as a role for a man whose contribution is romance, affection and attentiveness rather than authority — sweetness as the offering. Inferred from the term.',
  },
  {
    slug: 'matriarch', name: 'Matriarch', cat: 'bdsm-power-exchange', sourced: true,
    desc: 'A woman who heads a family or household and holds authority over it.',
    long: 'A matriarch is the female head of a family or household, holding authority over its structure and decisions. In kink and chosen-family contexts the word names a woman who leads a leather family, household or polycule, which makes it broader than a scene role: the authority is standing, ongoing and social rather than something switched on for play.',
  },
  {
    slug: 'meatbag', name: 'Meatbag', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: false,
    desc: 'A self-applied objectification label reducing oneself to a body.',
    long: 'Meatbag reads as an objectification self-label at its bluntest: the person is a body to be used, with the word doing the dehumanising deliberately. Objectification play depends on the humanity being fully restored afterwards, which is what aftercare is for in this kind of scene. Inferred from the term.',
  },
  {
    slug: 'merman', name: 'Merman', cat: 'subcultures', sourced: true,
    desc: 'The male counterpart of a mermaid; also a swimming and performance subculture.',
    long: 'A merman is the male form of the mermaid, and beyond the folklore the word names a real subculture of people who swim in monofins and tails, perform, and build an identity around it. It carries particular resonance in queer communities, where the mermaid figure has long been claimed as an image of transformation and of a body remade to suit its element.',
  },
  {
    slug: 'minx', name: 'Minx', cat: 'bdsm-power-exchange', sourced: true,
    desc: 'A flirtatious, mischievous and knowingly provoking feminine role.',
    long: 'Minx is an old English word for a bold, flirtatious woman, historically used to disapprove and now used mostly with affection. In kink it names a role built on teasing and mischief: provoking a partner for the pleasure of the response, close to bratting but lighter and more flirtatious than defiant.',
  },
  {
    slug: 'monsterfucker', name: 'Monsterfucker', cat: 'fetishes-interests', adult: true, sourced: true,
    desc: 'Someone attracted to monsters and non-human creatures in fiction.',
    long: 'Monsterfucker is a self-applied fandom label for people drawn to monsters, beasts and other non-human figures in fiction and art. It is a substantial current in fan writing and illustration, and it is generally worn with humour. The attraction is to the fictional creature and the strangeness it represents, which is what separates it from teratophilia framed as a clinical category.',
  },
  {
    slug: 'mouse', name: 'Mouse', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A small, timid pet-play or submissive persona.',
    long: 'Mouse reads as a persona built on smallness and timidity: quiet, easily startled, hiding rather than defying. It appears both as a pet-play animal identity and as a general submissive self-description, and it contrasts directly with bratting. Inferred from the term.',
  },
  {
    slug: 'muscle-slut', name: 'Muscle Slut', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'Someone whose desire is organised around muscular bodies, their own or others.',
    long: 'Muscle slut reads as a self-label for someone whose sexuality centres on muscularity — being muscular and displaying it, wanting muscular partners, or both. It sits near muscle worship, where the body itself is the object of devotion. Inferred from the term.',
  },
  {
    slug: 'muva', name: 'Muva', cat: 'bdsm-power-exchange', sourced: true,
    desc: 'A stylised spelling of mother used as a title of admiration in ballroom and drag culture.',
    long: 'Muva is a stylised form of mother drawn from Black queer ballroom and drag vernacular, where a house mother leads and protects a chosen family. Used as an address it is a compliment of the highest order, marking someone as the one others look up to. It has since spread far beyond ballroom, which is worth naming: the word carries a specific Black queer history with it.',
  },
  {
    slug: 'mxstress', name: 'Mxstress', cat: 'bdsm-power-exchange', sourced: true,
    desc: 'A gender-neutral honorific for a dominant, built from Mx and mistress.',
    long: 'Mxstress adapts mistress using the gender-neutral honorific Mx, giving nonbinary dominants a title that fits. Honorifics matter in kink because they encode both the dynamic and the person\'s gender, and the standard set offered only master and mistress; mxstress, along with forms like maestress and Sir used neutrally, fills the gap.',
  },
  {
    slug: 'oral-slave', name: 'Oral Slave', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A submissive whose service is specifically oral sex.',
    long: 'Oral slave reads as a service role in which oral sex on demand is the defining obligation. As with any total-service framing, the word slave describes a negotiated arrangement between consenting adults with limits and an exit, however absolute the language sounds. Inferred from the term.',
  },
  {
    slug: 'papa-bear', name: 'Papa Bear', cat: 'subcultures', sourced: true,
    desc: 'An older, protective bear who takes a paternal role in the community.',
    long: 'Papa bear names an older man in gay bear culture who takes a caring, paternal role toward younger men — mentorship and protection rather than authority. It sits alongside the daddy vocabulary but is warmer and less explicitly about dominance, and it belongs to bear culture\'s particular affection for size, hair and age.',
  },
  {
    slug: 'pegging-princess', name: 'Pegging Princess', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A receiving role in pegging framed as being adored while taken.',
    long: 'Pegging princess reads as a receptive role in pegging carrying the royal framing common in kink self-description: being pegged is something to be proud of and be indulged for rather than something to be shamed about. Pegging needs a harness that fits, plenty of lubricant and unhurried pacing. Inferred from the term.',
  },
  {
    slug: 'pegging-slut', name: 'Pegging Slut', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A self-label for someone who enthusiastically seeks out being pegged.',
    long: 'Pegging slut reads as a self-applied label for someone with an appetite for receiving pegging specifically. The label is one of the more common ways men name a desire that a lot of cultural pressure works against admitting to. Inferred from the term.',
  },
  {
    slug: 'pet-trainer', name: 'Pet Trainer', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'The handler role in pet play, specialising in teaching behaviour.',
    long: 'Pet trainer reads as the handler side of pet play with the emphasis on instruction: teaching commands, postures and behaviours to someone in a pet headspace. It sits alongside handler and owner, differing in what the role is for rather than in where the authority sits. Inferred from the term.',
  },
  {
    slug: 'pleasure-sadomasochist', name: 'Pleasure Sadomasochist', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'Someone whose sadomasochism is about pleasure rather than suffering.',
    long: 'Pleasure sadomasochist reads as a distinction within sadomasochism: the interest is in sensation experienced as good rather than in suffering endured, so intensity is pursued for how it feels rather than for what it costs. The contrast is with people for whom the suffering itself is the point. Inferred from the term.',
  },
  {
    slug: 'porcelain-doll', name: 'Porcelain Doll', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A doll-play persona built on fragility and being handled with care.',
    long: 'Porcelain doll reads as a doll persona whose defining quality is delicacy: the person is precious, breakable and handled carefully, which makes it a gentler variant of objectification than the mannequin or toy framings. Inferred from the term.',
  },
  {
    slug: 'praise-princess', name: 'Praise Princess', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A submissive whose motivation is praise rather than correction.',
    long: 'Praise princess reads as a submissive role driven by approval: doing well in order to be told so, with praise carrying the weight that punishment carries in other dynamics. Praise kink is widely recognised in its own right, and this is its role-shaped form. Inferred from the term.',
  },
  {
    slug: 'pretzel', name: 'Pretzel', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A flexible bottom who enjoys being folded into demanding positions.',
    long: 'Pretzel reads as a self-label for a bottom whose flexibility is the offering: comfortable being bent, folded and tied into positions most people could not hold. Predicament bondage and demanding rope positions both draw on it. Joint strain and circulation are the limits to watch. Inferred from the term.',
  },
  {
    slug: 'priestex', name: 'Priestex', cat: 'bdsm-power-exchange', sourced: true,
    desc: 'A gender-neutral form of priest or priestess.',
    long: 'Priestex applies the gender-neutral -ex ending, as in latinx, to priest and priestess, giving nonbinary people a term for a religious or ritual role. In kink it appears where ritual and devotional framing is used, and the coinage exists for the same reason mxstress does: the standard vocabulary offers only a gendered pair.',
  },
  {
    slug: 'primal-pet', name: 'Primal Pet', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A pet-play identity played wild and instinctive rather than trained.',
    long: 'Primal pet reads as the meeting point of pet play and primal play: an animal headspace that is feral rather than obedient, closer to a wild creature than to a trained companion. Inferred from the composed term.',
  },
  {
    slug: 'princess-domme', name: 'Princess Domme', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A dominant whose authority is expressed as entitlement to be served and adored.',
    long: 'Princess domme reads as a dominant style built on being indulged rather than on commanding: the submissive\'s role is to provide, pamper and adore, and the authority comes from expecting it as a right. It sits close to findom and to worship dynamics. Inferred from the term.',
  },

  // ──────────────────────── dynamics & roles (P–Z) ────────────────────────────
  {
    slug: 'princette', name: 'Princette', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A gender-neutral or diminutive form of prince and princess.',
    long: 'Princette reads as a coinage for people who want the pampered, adored framing of the princess role without its gendering, or in a smaller and more affectionate register. It belongs to the same impulse as mxstress and priestex: an established role whose only available names are a gendered pair. Inferred from the construction.',
  },
  {
    slug: 'punching-bag', name: 'Punching Bag', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: false,
    desc: 'A bottom who takes strikes in rough body play.',
    long: 'Punching bag reads as a self-applied bottom role for someone who takes punches and body blows rather than implement strikes. Rough body play needs a top who knows which areas are survivable — never the head, kidneys, spine or floating ribs — and a bottom who can still signal. Inferred from the term; the anatomy is not.',
  },
  {
    slug: 'puppeteer', name: 'Puppeteer', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A dominant who moves and poses a partner as an object.',
    long: 'Puppeteer reads as a dominant role centred on physical control of a partner\'s body: positioning, moving and posing them rather than instructing them to move themselves. It pairs with doll and marionette bottom roles and sits within objectification play. Inferred from the term.',
  },
  {
    slug: 'pussy-worshipper', name: 'Pussy Worshipper', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'Someone whose devotion is directed at a partner\'s vulva.',
    long: 'Pussy worshipper reads as a devotional role in which the vulva is the object of reverence, expressed through oral service and ritual. It parallels other worship dynamics such as foot and body worship, where the point is adoration rather than reciprocity. Inferred from the term.',
  },
  {
    slug: 'ritual-object', name: 'Ritual Object', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'An objectification role in which the person functions as an item used in ceremony.',
    long: 'Ritual object reads as an objectification role placed in a ceremonial frame: the person becomes an altar, a vessel or an instrument used within a rite rather than a piece of furniture. It draws on the overlap between kink and ritual practice, where structure and reverence do much of the work. Inferred from the term.',
  },
  {
    slug: 'sadist-bait', name: 'Sadist Bait', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: false,
    desc: 'A self-label for a bottom who attracts sadists and enjoys doing so.',
    long: 'Sadist bait reads as a self-description worn with some pride: the person\'s reactions, appetite or manner draw sadists to them, and that is the intent. It is disclosure as much as boast, telling prospective partners what the person is looking for. Inferred from the term.',
  },
  {
    slug: 'sadistic-dom-me', name: 'Sadistic Dom(me)', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: true,
    desc: 'A dominant whose authority is expressed through inflicting pain.',
    long: 'A sadistic dominant combines two things that are often confused and are not the same: dominance is about control, sadism is about pain. Someone who is both directs a submissive and takes pleasure in hurting them, which is a narrower proposition than either alone. The distinction matters in negotiation, because a submissive who wants to obey does not necessarily want to be hurt.',
  },
  {
    slug: 'scent-freak', name: 'Scent Freak', cat: 'fetishes-interests', adult: true, sourced: false,
    desc: 'Someone whose arousal runs primarily through smell.',
    long: 'Scent freak reads as a self-label for someone whose erotic response is driven by smell — body odour, sweat, worn clothing, leather or rubber. It overlaps with olfactophilia as a clinical term, and with the well-established gear practice of trading worn items. Inferred from the term.',
  },
  {
    slug: 'selective-nympho', name: 'Selective Nympho', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'Someone with a very high sex drive that is directed at very few people.',
    long: 'Selective nympho reads as a self-description resolving an apparent contradiction: an intense appetite for sex combined with a narrow set of people it applies to. It is close to what demisexual describes, framed through drive rather than through attraction. Inferred from the term.',
  },
  {
    slug: 'service-dom-me', name: 'Service Dom(me)', cat: 'bdsm-power-exchange', sourced: true,
    desc: 'A dominant who directs a scene in order to give the submissive what they need.',
    long: 'A service dominant holds the controlling role but orients the whole scene around the submissive\'s desires: they decide, direct and take responsibility, and what they choose is what the bottom wants. It is not the same as topping from the bottom, where the submissive is actually steering. The distinction is who holds authority, not who benefits.',
  },
  {
    slug: 'sex-witch', name: 'Sex Witch', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'Someone who works with sexuality as a spiritual or magical practice.',
    long: 'Sex witch reads as an identity at the meeting point of witchcraft and sexuality, where sex is treated as a source of power and a ritual practice rather than only as pleasure. It draws on a real current of queer and feminist witchcraft in which reclaiming the witch is itself the point. Inferred from the term.',
  },
  {
    slug: 'shock-daddy-shock-mommy', name: 'Shock Daddy / Shock Mommy', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A caregiver-framed dominant specialising in electrical play.',
    long: 'Shock daddy and shock mommy read as caregiver-styled dominant roles built around electrical play, pairing nurturing framing with e-stim, TENS and violet wands. The safety rules do not soften with the framing: current stays below the waist, never crosses the chest, and is never used on anyone with a pacemaker or a heart condition. Inferred from the term; the rules are not.',
  },
  {
    slug: 'sissifier', name: 'Sissifier', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: false,
    desc: 'A dominant who feminises a submissive as the substance of the dynamic.',
    long: 'Sissifier reads as the dominant side of sissification: directing a submissive into feminine dress, manner and role. The practice sits on a fault line, since it can work as gender exploration or can rest on treating femininity as degrading, and which one it is depends entirely on the people in it. Some people find their gender through it; for others it is humiliation play. Inferred from the term.',
  },
  {
    slug: 'soft-bottom', name: 'Soft Bottom', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A bottom who wants gentleness and sensuality rather than intensity.',
    long: 'Soft bottom reads as a bottom whose preference is for tenderness: sensation play, closeness and care rather than heavy impact or harsh dynamics. Naming it is practically useful, since bottom on its own is often read as an appetite for intensity. Inferred from the term.',
  },
  {
    slug: 'soft-boy', name: 'Soft Boy', cat: 'expression-presentation', sourced: true,
    desc: 'A masculine presentation built on gentleness and emotional openness.',
    long: 'Soft boy describes a way of being masculine that is gentle, sensitive and emotionally available rather than stoic or dominant. It began as internet vernacular, was for a while used sceptically of men who performed sensitivity without practising it, and has settled into a broadly sincere self-description — particularly among queer and trans men for whom the available models of masculinity did not fit.',
  },
  {
    slug: 'soft-goddess', name: 'Soft Goddess', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A worshipped dominant whose register is warm rather than severe.',
    long: 'Soft goddess reads as the gentle form of the goddess or divine dominant role: still the object of devotion, but the devotion is met with warmth and praise instead of coldness. It is to goddess worship what gentle femdom is to femdom. Inferred from the term.',
  },
  {
    slug: 'soft-masochist', name: 'Soft Masochist', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A masochist whose appetite is for light sensation rather than heavy pain.',
    long: 'Soft masochist reads as someone who wants pain in a low register: stinging rather than bruising, a warm-up rather than a scene that ends in marks. Naming it matters because masochist alone is often read as a claim to endurance. Inferred from the term.',
  },
  {
    slug: 'spit-slut', name: 'Spit Slut', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: false,
    desc: 'A bottom whose kink is being spat on or fed a partner\'s saliva.',
    long: 'Spit slut reads as a bottom label for someone whose particular interest is saliva play: being spat on, or taking a partner\'s spit. It is a mild degradation practice with a straightforward hygiene note, since saliva transmits some infections. Inferred from the term.',
  },
  {
    slug: 'struggle-slut', name: 'Struggle Slut', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A bondage bottom whose pleasure is in fighting the restraint.',
    long: 'Struggle slut reads as a bondage bottom for whom the point is resistance: straining, twisting and fighting a tie rather than settling into it. It needs rope and cuffs that will hold up to being fought, since struggling tightens rope and raises circulation risk, and safety cutters within reach. Inferred from the term.',
  },
  {
    slug: 'submissive-sadist', name: 'Submissive Sadist', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: true,
    desc: 'Someone who submits and who takes pleasure in inflicting pain.',
    long: 'A submissive sadist holds two things usually assumed to belong on opposite sides: they yield control and they enjoy hurting. In practice that means inflicting pain at a dominant\'s direction or on someone their dominant provides. It exists because dominance and sadism are separate axes, and the label makes a combination visible that the standard vocabulary hides.',
  },
  {
    slug: 'submissive-top', name: 'Submissive Top', cat: 'bdsm-power-exchange', adult: true, sourced: true,
    desc: 'Someone who does the physical topping while holding the submissive role.',
    long: 'A submissive top performs the acts — striking, tying, penetrating — while the authority stays with the other person. It is the mirror of the service dominant and the reason kink separates top and bottom from dominant and submissive at all: one pair describes who does what, the other who decides.',
  },
  {
    slug: 'subslut', name: 'Subslut', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A submissive whose submission is sexual first.',
    long: 'Subslut reads as a submissive label where the submission runs through sex specifically rather than through service, protocol or domestic structure. Inferred from the composed term.',
  },
  {
    slug: 'suffer-slut', name: 'Suffer Slut', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: false,
    desc: 'A masochist whose appetite is for endurance rather than pleasant sensation.',
    long: 'Suffer slut reads as the opposite pole from the pleasure sadomasochist: the point is enduring, and the pain is meant to be hard rather than to feel good. Play at that end needs a top who can read a bottom who will not tap out, and an agreed limit set before the scene rather than during it. Inferred from the term.',
  },
  {
    slug: 'switch-daddy', name: 'Switch Daddy', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A daddy-role caregiver who also takes the submissive side.',
    long: 'Switch daddy reads as someone who holds the daddy caregiver role and also submits, either with different partners or at different times with the same one. Inferred from the composed term.',
  },
  {
    slug: 'teddy-bear', name: 'Teddy Bear', cat: 'subcultures', sourced: true,
    desc: 'A soft, cuddly and notably gentle bear within gay bear culture.',
    long: 'Teddy bear is one of gay bear culture\'s body-and-manner descriptors: hairy and heavy-set like other bears, but soft, warm and approachable rather than gruff. As with the rest of that vocabulary the categories are affectionate and self-applied, and the word is also used more generally for anyone comforting to be held by.',
  },
  {
    slug: 'themdom', name: 'Themdom', cat: 'bdsm-power-exchange', adult: true, sourced: true,
    desc: 'Domination by a nonbinary person, on the model of femdom and maledom.',
    long: 'Themdom names domination by someone who uses they/them pronouns, built on femdom and maledom by substituting the pronoun. It exists because the established pair encodes a binary that leaves nonbinary dominants unnamed, the same gap that produced mxstress. The word describes who holds the power, not the style in which it is held.',
  },
  {
    slug: 'trinket-goblin', name: 'Trinket Goblin', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A playful role for someone who hoards small gifts and shiny things.',
    long: 'Trinket goblin reads as a light, non-sexual persona for someone who collects and hoards small objects — gifts, tokens, shiny things — in the manner of a magpie or a goblin. It appears alongside pet-play and creature identities and is generally worn for fun rather than as a dynamic. Inferred from the term.',
  },
  {
    slug: 'unruly-submissive', name: 'Unruly Submissive', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A submissive who does not obey easily and makes a dominant work for it.',
    long: 'Unruly submissive reads as a submissive whose obedience is real but has to be won: they resist, test and disobey as part of how they submit. It overlaps with bratting, framed as a disposition rather than as a game. Inferred from the term.',
  },
  {
    slug: 'volt-bunny', name: 'Volt Bunny', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A bottom who seeks out electrical play, on the model of rope bunny.',
    long: 'Volt bunny reads as the electrical-play equivalent of a rope bunny: an enthusiastic bottom for e-stim, TENS and violet wands. The constraints stand regardless: current below the waist, never across the chest, never with a pacemaker or a heart condition. Inferred from the term; the constraints are not.',
  },
  {
    slug: 'volt-vixen', name: 'Volt Vixen', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A feminine variant of the electrical-play bottom or top role.',
    long: 'Volt vixen reads as a feminine-framed electrical-play identity, paired with volt bunny in the same vocabulary and usually with more of a knowing, predatory register. The safety rules for electrical play apply in either role. Inferred from the term.',
  },
  {
    slug: 'voyeur', name: 'Voyeur', cat: 'fetishes-interests', adult: true, sourced: true,
    desc: 'Someone who is aroused by watching others being sexual.',
    long: 'A voyeur is aroused by watching rather than participating. In kink and at play parties this is a consensual arrangement: the people being watched know and have agreed, which is the entire difference between voyeurism as a practice and voyeurism as an offence. Watching people who have not consented is a crime in most jurisdictions and is not what the community means by the word.',
  },
  {
    slug: 'whip-catcher', name: 'Whip Catcher', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: false,
    desc: 'A bottom who specialises in taking single-tail and whip play.',
    long: 'Whip catcher reads as a bottom who takes whip strikes as their speciality, particularly single-tails. Single-tail work is a skilled discipline: it can break skin, and it requires a top with real practice and strict avoidance of the face, neck, spine and kidneys. Inferred from the term; the anatomy is not.',
  },
  {
    slug: 'wood-nymph', name: 'Wood Nymph', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A woodland creature persona, wild and elusive.',
    long: 'Wood nymph reads as a creature persona drawn from folklore: sylvan, elusive and untamed, often paired with outdoor play. It sits in the same family as the fae and faun personas that recur in kink self-description. Inferred from the term.',
  },
  {
    slug: 'coach', name: 'Coach', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A dominant role framed as training and improvement rather than command.',
    long: 'Coach reads as a dominant identity in the register of athletic training: setting tasks, drilling, correcting and pushing someone to improve. It appears as a role-play framing and as a real ongoing structure, and it sits alongside the well-established sports and locker-room scenarios in kink. Inferred from the term.',
  },
  {
    slug: 'encourager', name: 'Encourager', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'Someone whose contribution to a dynamic is praise and motivation.',
    long: 'Encourager reads as a role built on affirmation: the person\'s job is to praise, motivate and build up a partner, which is the positive-reinforcement counterpart to a disciplinarian. It pairs naturally with praise kink. Inferred from the term.',
  },
  {
    slug: 'hyena', name: 'Hyena', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A primal or pet-play persona built on hyena traits.',
    long: 'Hyena reads as an animal persona drawn from the hyena: laughing, scavenging, pack-social and not domesticated. It carries particular resonance in queer contexts, since spotted hyena females are famously dominant and do not fit the sexual dimorphism people expect. Inferred from the term.',
  },
  {
    slug: 'ladybug', name: 'Ladybug', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A small, gentle creature persona.',
    long: 'Ladybug reads as a creature persona built on smallness, prettiness and harmlessness — an affectionate pet name as much as a role. Insect personas are a small but real strand of pet play. Inferred from the term.',
  },
  {
    slug: 'robot', name: 'Robot', cat: 'bdsm-power-exchange', adult: true, sourced: true,
    desc: 'An objectification role in which someone is a programmed machine.',
    long: 'Robot play recasts a person as a machine: obeying commands literally, moving mechanically, and being switched on, reprogrammed or shut down. It draws on the same appeal as hypnosis and mind-control play — the surrender of will rather than of body — and overlaps with the doll and android aesthetics in gear-heavy scenes. The person is a person throughout, which is what aftercare exists to re-establish.',
  },
  {
    slug: 'goose', name: 'Goose', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A bird persona built on aggression and mischief rather than sweetness.',
    long: 'Goose reads as an animal persona chosen for the bird\'s reputation: loud, territorial, unafraid and a nuisance on purpose. It sits with the bratty end of pet play rather than the devoted end. Inferred from the term.',
  },
  {
    slug: 'feral-sadist', name: 'Feral Sadist', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: false,
    desc: 'A sadist who works instinctively and physically rather than by technique.',
    long: 'Feral sadist reads as the sadist counterpart within primal play: pain delivered through biting, scratching and bodily struggle rather than through implements and technique. Primal play is fast and hard to modulate, so limits, marks and infection risk from bites need settling in advance. Inferred from the term.',
  },
  {
    slug: 'feral-masochist', name: 'Feral Masochist', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: false,
    desc: 'A masochist who wants pain given wildly rather than precisely.',
    long: 'Feral masochist reads as the receiving side of primal sadism: wanting to be bitten, scratched and overpowered rather than struck with an implement, and fighting back as part of it. Inferred from the term; bites break skin and carry a real infection risk.',
  },
  {
    slug: 'patriarch', name: 'Patriarch', cat: 'bdsm-power-exchange', sourced: true,
    desc: 'A man who heads a family or household and holds authority over it.',
    long: 'A patriarch is the male head of a family or household. In leather families, kink households and chosen families the word names a man who leads the group — standing that is ongoing and social rather than a scene role. The term carries the weight of patriarchy as a system, which is part of why it is used deliberately in communities that reorganise family structures on their own terms.',
  },
  {
    slug: 'fellatio-slave', name: 'Fellatio Slave', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A service role centred specifically on performing oral sex on a penis.',
    long: 'Fellatio slave reads as a narrower form of the oral service role, defined by the specific act rather than by oral service generally. As with all such framings, the word slave describes a negotiated arrangement between adults with limits and an exit. Inferred from the term.',
  },
  {
    slug: 'chaos-puppy', name: 'Chaos Puppy', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A pup-play persona that is disobedient and disruptive rather than eager to please.',
    long: 'Chaos puppy reads as pup play in the bratty register: the energy and enthusiasm of a pup with none of the obedience, stealing things and causing trouble instead of heeling. Inferred from the term.',
  },
  {
    slug: 'domestic-service-sub', name: 'Domestic Service Sub', cat: 'bdsm-power-exchange', sourced: true,
    desc: 'A submissive whose service is household work.',
    long: 'A domestic service submissive expresses submission through running a household: cleaning, cooking, laundry and maintenance done to a standard set by the dominant. It is one of the most common forms of service and one of the least sexual in its content, which is exactly the appeal for many people who hold the role. Because the work is real labour, sustainable arrangements set out expectations and reciprocity explicitly.',
  },
  {
    slug: 'sinner', name: 'Sinner', cat: 'bdsm-power-exchange', adult: true, sourced: false,
    desc: 'A role built on transgression and guilt in a religious frame.',
    long: 'Sinner reads as a role played against a religious backdrop, where the eroticism comes from transgression, guilt and the prospect of confession or punishment. Religious framing is common in kink and carries particular charge for queer people raised in traditions that condemned them, which is part of why it is reclaimed as play. Inferred from the term.',
  },
  {
    slug: 'pest', name: 'Pest', cat: 'bdsm-power-exchange', sourced: false,
    desc: 'A brat-adjacent role built on being deliberately annoying.',
    long: 'Pest reads as a self-applied role for someone who provokes by being a nuisance rather than by open defiance: persistent, interrupting and impossible to ignore, with the reaction as the reward. Inferred from the term.',
  },
  {
    slug: 'slut-trainer', name: 'Slut Trainer', cat: 'bdsm-power-exchange', adult: true, sensitive: true, sourced: false,
    desc: 'A dominant who trains a submissive into a sexual role over time.',
    long: 'Slut trainer reads as a dominant role framed around progressive sexual training: setting tasks, escalating limits by agreement and shaping a submissive\'s sexual behaviour over time. Anything described as training only works where the escalation is negotiated in advance rather than assumed to follow from the framing. Inferred from the term.',
  },
  {
    slug: 'sir-boy', name: 'Sir / boy', cat: 'bdsm-power-exchange', adult: true, sourced: true,
    desc: 'A leather dynamic pairing an authority figure with a devoted subordinate.',
    long: 'Sir and boy is one of the oldest dynamics in gay leather culture: Sir holds authority, mentors and trains, while boy serves and learns. Boy is a title of standing rather than a statement of age, and it is earned; the capitalisation convention, Sir capitalised and boy not, is itself part of the protocol. The relationship is traditionally about lineage and mentorship as much as about service.',
  },

  // ─────────────── acts, fetishes, slang, community & safety ─────────────────
  {
    slug: 'anal-pounding', name: 'Anal Pounding', cat: 'practices-play', adult: true, sourced: false,
    desc: 'Hard, fast anal penetration.',
    long: 'Anal pounding names anal sex at the rough end: fast, forceful and sustained. It needs the same preparation as any anal sex and rather more attention to it, since force without adequate lubricant and warm-up is how tearing happens. Inferred from the term.',
  },
  {
    slug: 'ballooning', name: 'Ballooning', cat: 'fetishes-interests', adult: true, sourced: true,
    desc: 'A fetish for balloons, whether intact, inflated or burst.',
    long: 'Ballooning, or looning, is a fetish for balloons. Practitioners generally split into those who love inflating and handling them intact and those for whom the burst is the point, and the fear-versus-anticipation tension of an over-inflated balloon does much of the work. Latex allergy is the practical caveat.',
  },
  {
    slug: 'call-and-response', name: 'Call and Response', cat: 'bdsm-power-exchange', sourced: true,
    desc: 'A ritual verbal exchange where a fixed prompt gets a fixed reply.',
    long: 'Call and response is a protocol device: the dominant says a set phrase and the submissive answers with a set reply, every time. It has deep roots in Black musical and worship traditions, and in kink it is used to mark the start of a scene, confirm a headspace or reinforce a dynamic through repetition. The value is in the fixity — the exchange is the same whatever the mood.',
  },
  {
    slug: 'cumsicle', name: 'Cumsicle', cat: 'practices-play', adult: true, sourced: false,
    desc: 'Frozen semen, used as a temperature-play novelty.',
    long: 'Cumsicle reads as a portmanteau of cum and popsicle, naming frozen semen used in play. It sits at the meeting point of semen play and temperature play. Freezing does not reliably inactivate infections, so the ordinary barrier considerations still apply. Inferred from the term.',
  },
  {
    slug: 'nipple-play-wrestling', name: 'Nipple Play Wrestling', cat: 'practices-play', adult: true, sourced: false,
    desc: 'Contest-framed play in which the target is a partner\'s nipples.',
    long: 'Nipple play wrestling reads as a contest scene in which each person tries to get at the other\'s nipples, combining wrestling with a specific sensation focus. It belongs with the wider tit-torture and nipple-play vocabulary, played as a game rather than as a straightforward top-and-bottom scene. Inferred from the term.',
  },
  {
    slug: 'whipcasso', name: 'Whipcasso', cat: 'practices-play', adult: true, sensitive: true, sourced: false,
    desc: 'A whip top who leaves deliberate patterns of marks.',
    long: 'Whipcasso puns on Picasso and reads as a term for a top whose whip work is precise enough to place marks deliberately, treating the bottom\'s skin as a surface to compose on. Single-tail accuracy at that level takes years of practice and stays clear of the face, neck, spine and kidneys. Inferred from the pun.',
  },
  {
    slug: 'fotboth', name: 'Fotboth', cat: 'practices-play', adult: true, sourced: false,
    desc: 'A term whose meaning is not attested outside community glossaries.',
    long: 'Fotboth is not documented anywhere it can be checked and has no clear derivation, though the first element may relate to feet. Rather than invent a meaning for an act term, this entry records the word and leaves its definition open until someone who uses it supplies one.',
  },
  {
    slug: 'outstroking', name: 'Outstroking', cat: 'practices-play', adult: true, sourced: false,
    desc: 'Stimulation focused on withdrawal rather than on thrusting in.',
    long: 'Outstroking reads as a technique that puts the attention on the outward stroke — slow withdrawal rather than the push — reversing the usual emphasis of penetrative sex. The reading follows from the construction of the word and is not otherwise documented.',
  },
  {
    slug: 'cratolagnia', name: 'Cratolagnia', cat: 'fetishes-interests', adult: true, sourced: false,
    desc: 'Arousal from displays of strength.',
    long: 'From the Greek kratos, strength, with the -lagnia suffix used across the philia vocabulary for arousal. It reads as arousal specifically at displays of physical power, which places it near muscle worship and near the strength element of primal play. The reading is from the roots; the term is not clinically established.',
  },
  {
    slug: 'cumflation', name: 'Cumflation', cat: 'fetishes-interests', adult: true, sourced: true,
    desc: 'A fantasy kink of a belly visibly swelling with semen.',
    long: 'Cumflation is a fantasy kink, mostly expressed in art and fiction, in which someone\'s belly visibly distends from the volume of semen inside them. It belongs to the inflation family alongside belly and body inflation, and it is understood as impossible by the people who enjoy it: the appeal is the image of being filled beyond capacity, not a belief that it happens.',
  },
  {
    slug: 'glass-licking-fetish', name: 'Glass Licking Fetish', cat: 'fetishes-interests', adult: true, sourced: false,
    desc: 'Arousal from licking glass, usually with someone watching from the other side.',
    long: 'Glass licking reads as a fetish built on the barrier: tongue against a window or screen with someone on the other side, contact and separation at once. It fits with voyeurism and exhibitionism, where the glass is exactly what makes the scene work. Inferred from the term.',
  },
  {
    slug: 'grossdom', name: 'Grossdom', cat: 'fetishes-interests', adult: true, sensitive: true, sourced: false,
    desc: 'Domination built on disgust rather than on pain or authority.',
    long: 'Grossdom reads as a dominance style whose currency is revulsion: the submissive is subjected to things they find disgusting, and the reaction is the point. It sits near mysophilia and the messier end of humiliation play, and it needs an unusually explicit limits conversation, since disgust is highly individual and hygiene risks are real. Inferred from the term.',
  },
  {
    slug: 'ludophilia', name: 'Ludophilia', cat: 'fetishes-interests', adult: true, sourced: false,
    desc: 'Arousal from games and play itself.',
    long: 'From the Latin ludus, game. It reads as arousal from the structure of games — rules, contests, stakes and forfeits — rather than from any particular act, which is why so much kink is organised as a game in the first place. The reading is from the root; the term is not clinically established.',
  },
  {
    slug: 'ownership-kink', name: 'Ownership Kink', cat: 'bdsm-power-exchange', adult: true, sourced: true,
    desc: 'Eroticising belonging to someone, or having someone belong to you.',
    long: 'Ownership kink is arousal from the fact of possession itself rather than from any act it leads to: being owned, or owning. It underlies master and slave dynamics, collaring and total power exchange, and it is often marked with a collar, a contract or a title. Ownership in this sense is a negotiated relationship between adults with limits and an exit, however absolute the language is; no jurisdiction recognises a person as property, and communities treat any claim otherwise as abuse rather than as kink.',
  },
  {
    slug: 'sports-kink', name: 'Sports Kink', cat: 'fetishes-interests', adult: true, sourced: true,
    desc: 'Eroticising athletics, sportswear, locker rooms and competition.',
    long: 'Sports kink covers arousal around athletic contexts: kit and gear, jockstraps and singlets, locker rooms, coaching dynamics, sweat and competition. It has a long history in gay male culture in particular, where the locker room is one of the oldest scenarios in the repertoire, and it overlaps heavily with gear fetishism and with muscle worship.',
  },
  {
    slug: 'body-count', name: 'Body Count', cat: 'slang-terminology', adult: true, sourced: true,
    desc: 'The number of people someone has had sex with.',
    long: 'Body count is slang for how many sexual partners a person has had. The phrase circulates mostly as a way of judging people, women especially, and has become a fixture of online discourse about sexual history. Sex-positive and queer communities generally reject it as a measure of anything, and the number carries no health information — testing does.',
  },
  {
    slug: 'bushmaxxing', name: 'Bushmaxxing', cat: 'slang-terminology', adult: true, sourced: false,
    desc: 'Deliberately growing out body or pubic hair as a look.',
    long: 'Bushmaxxing reads as growing body and pubic hair out on purpose, using the -maxxing construction from internet self-optimisation slang. It runs against a long default of removal and is often framed as reclaiming a natural look. Inferred from the construction.',
  },
  {
    slug: 'cumjob', name: 'Cumjob', cat: 'practices-play', adult: true, sourced: false,
    desc: 'Using semen as lubricant for continued stimulation after ejaculation.',
    long: 'Cumjob reads as continued manual or oral stimulation after ejaculation, using the semen itself as lubricant. Post-orgasm stimulation is intensely sensitive and shades into overstimulation play, which is its own negotiated thing. Inferred from the term.',
  },
  {
    slug: 'dickdash', name: 'Dickdash', cat: 'slang-terminology', adult: true, sensitive: true, sourced: false,
    desc: 'Slang for briefly exposing a penis, whether as a joke or as flashing.',
    long: 'Dickdash reads as slang for a quick genital exposure. The distinction that matters is consent: between people who have agreed to it, it is exhibitionism; directed at anyone who has not, it is indecent exposure and a criminal offence in most jurisdictions, and sending an unsolicited image is the same act in another medium. Inferred from the term.',
  },
  {
    slug: 'grool', name: 'Grool', cat: 'slang-terminology', adult: true, sourced: true,
    desc: 'Slang for vaginal wetness, blending girl and drool.',
    long: 'Grool is internet slang for vaginal lubrication, a portmanteau of girl and drool. It comes out of online erotica and fandom writing rather than clinical vocabulary, and it is used for the visible, copious kind. Wetness varies enormously between people and across a cycle and is not a reliable measure of arousal.',
  },
  {
    slug: 'hat-trick', name: 'Hat Trick', cat: 'slang-terminology', adult: true, sourced: true,
    desc: 'Sex with three different people in a short span; borrowed from sport.',
    long: 'A hat trick is three scores by one player in a single game, from cricket by way of hockey and football. Applied to sex it means three partners in quick succession, generally in a single night or event, and it is used with the same jokey competitiveness as the sporting original.',
  },
  {
    slug: 'helicockter', name: 'Helicockter', cat: 'slang-terminology', adult: true, sourced: true,
    desc: 'Joke slang for swinging a penis in circles.',
    long: 'Helicockter is a joke coinage for rotating the hips so the penis swings in a circle, named for the rotor it resembles. It belongs firmly to comedy rather than to technique, and appears in locker-room and party contexts rather than in sex.',
  },
  {
    slug: 'sexercise', name: 'Sexercise', cat: 'slang-terminology', sourced: true,
    desc: 'Sex framed as physical exercise, or exercise framed erotically.',
    long: 'Sexercise blends sex and exercise, covering both the observation that sex is physical activity and the framing of workouts as erotic. Sex does burn calories, though considerably fewer than the popular claims suggest, and the word is mostly used lightly. It overlaps with sports kink where the gym setting is the appeal.',
  },
  {
    slug: 'trans-new-world-order-tnwo', name: 'Trans New World Order (TNWO)', cat: 'slang-terminology', sensitive: true, sourced: true,
    desc: 'An ironic in-joke among trans people, inverting a conspiracy theory about them.',
    long: 'Trans New World Order is an in-joke: trans people adopting the language of the conspiracy theories told about them, claiming a global agenda in mock-sinister terms precisely because the accusation is absurd. The humour is defensive, of a piece with the transgender agenda joke, and it is community vocabulary used from the inside. Read straight it is exactly the rhetoric it is mocking, which is why context matters.',
  },
  {
    slug: 'wireplay', name: 'Wireplay', cat: 'practices-play', adult: true, sensitive: true, sourced: false,
    desc: 'Play using wire, generally in an electrical or binding context.',
    long: 'Wireplay reads as play using wire — as a conductor in electrical scenes, or as an unforgiving binding material. Wire has no give, cuts into skin under load and can damage nerves in minutes where rope would only mark, so it is edge play with a narrow margin. Inferred from the term; the physical constraints are not.',
  },
  {
    slug: 'mmd-r18', name: 'MMD R18', cat: 'art-literature-zines', adult: true, sourced: true,
    desc: 'Adult animation made with MikuMikuDance, a free Japanese 3D tool.',
    long: 'MikuMikuDance is free Japanese software, originally released for Vocaloid music videos, that lets people animate 3D character models without a studio pipeline. R18 is the Japanese adults-only rating, so MMD R18 denotes the explicit body of work made with it. It is a substantial amateur genre with its own model and motion-sharing culture, and it sits alongside SFM as a form of adult animation made largely by hobbyists.',
  },
  {
    slug: 'mosh', name: 'Mosh', cat: 'events-scene', sourced: true,
    desc: 'Deliberate slam dancing in a crowd at a loud show.',
    long: 'Moshing is the practice of slamming into other people in a pit at punk, hardcore and metal shows. It runs on a strong etiquette that outsiders miss: you pick people up when they fall, you do not swing at anyone outside the pit, and you get out if you are done. Queer and femme-organised pits have made a point of enforcing that etiquette rather than abandoning it. It appears in kink vocabulary as a reference point for consensual roughness in a crowd.',
  },
  {
    slug: 'boundary', name: 'Boundary', cat: 'safety-consent', sourced: true,
    desc: 'A limit someone sets on what they will do, accept or be part of.',
    long: 'A boundary is a statement about what a person will and will not accept. It differs from a rule in a dynamic: a rule tells someone else what to do, a boundary describes what you will do in response. Boundaries can be physical, sexual, emotional or about time and attention, and they can change — but only by the person whose boundary it is. In kink this is the layer underneath negotiation, and someone repeatedly testing a boundary is a warning sign rather than a compatibility problem.',
  },
  {
    slug: 'cover', name: 'Cover', cat: 'physical-digital-safety', sourced: false,
    desc: 'A prepared account of one\'s whereabouts that protects kink or queer privacy.',
    long: 'In a safety context cover reads as the story someone keeps ready for where they were and who with, protecting them from being outed as queer or kinky to family, employers or anyone who could do them harm with it. It is standard practice for people whose safety depends on separating community life from the rest, and it goes with separate names, accounts and photographs. The reading is inferred from context; note that in leather culture cover also means the peaked cap, which is a different word entirely and is covered under muir cap.',
  },
  {
    slug: 'flow-state', name: 'Flow State', cat: 'mental-health', sourced: true,
    desc: 'Complete absorption in an activity, where effort and self-awareness fall away.',
    long: 'Flow is the psychological state, named by Mihaly Csikszentmihalyi, of being fully absorbed in something difficult enough to demand everything and matched closely enough to skill to be possible: time distorts and self-consciousness disappears. It is the frame often used for what a rope top or a bottom deep in a scene is experiencing, and it is related to but distinct from subspace, which involves an endorphin response as well.',
  },
  {
    slug: 'metasexuality', name: 'Metasexuality', cat: 'sexual-orientation', sourced: false,
    desc: 'Sexuality treated as something to be examined rather than simply had.',
    long: 'Metasexuality reads as an orientation toward sex itself as a subject: the thinking, framing and analysis of desire being as compelling as the acts. The meta- prefix points that way, and it would describe a real disposition common among people who spend their time in kink theory and vocabulary. The reading is inferred from the construction and is not independently documented.',
  },
];

export default TERMS;
