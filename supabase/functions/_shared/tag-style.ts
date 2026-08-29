// House style + sense-anchoring for glossary tag prose.
//
// Two distinct failure classes motivated this module (measured 2026-08-29):
//
//   WRONG SENSE — a glossary term that is also an ordinary English word was
//   described in its generic dictionary sense: "Vacuum Pump" (Fetishes) as
//   industrial vacuum physics, "Furniture" (Gear) as household furnishing,
//   "Discipline" as an academic field. Title agreement and a plausible entity
//   class both PASS on these — the article really is titled "Vacuum pump" and
//   a device is a perfectly plausible class — so the identity guard alone
//   cannot catch them. What does: for a tag filed in a category that implies
//   a queer/kink-specific sense, generic-sense source text simply is not
//   about this tag.
//
//   WRONG VOICE — prose in Wikipedia-summary register ("Furniture refers to
//   movable objects used to equip households…") or padded with consent
//   boilerplate ("It's essential to prioritize consent and communication…" on
//   112 rows). The platform's voice is direct and factual; a reader on a
//   glossary page wants the definition, its queer context, and nothing else.

/**
 * Category slugs AND display names whose members carry a queer/kink-specific
 * sense. For a tag filed here, a source text in the generic English sense is
 * evidence of the WRONG subject, not grounding. Venue Types / Destinations /
 * Substances are deliberately absent — their generic sense is the right one
 * ("Beer-Garden" really is a beer garden).
 */
const SENSE_CATEGORY_KEYS = new Set([
  // slugs (tag_categories.slug)
  'bdsm-power-exchange',
  'fetishes-interests',
  'practices-play',
  'gear-aesthetics',
  'kink-community',
  'slang-terminology',
  'subcultures',
  'relationship-structures',
  'expression-presentation',
  'consent-negotiation',
  'vibe-crowd',
  // display names (unified_tags.category text mirror)
  'dynamics & roles',
  'fetishes',
  'practices & play',
  'gear',
  'kink community & scenes',
  'slang & language',
  'subcultures & scenes',
  'relationship structures',
  'expression & style',
  'consent & negotiation',
  'vibe & crowd',
])

export function isSenseCategory(categorySlugOrName: string | null | undefined): boolean {
  if (!categorySlugOrName) return false
  return SENSE_CATEGORY_KEYS.has(categorySlugOrName.trim().toLowerCase())
}

/**
 * Does this source text corroborate the queer/kink/community sense? Cheap and
 * deterministic — it gates whether a Wikipedia extract may ground a tag in a
 * sense category. Erring tight is safe: a refusal only means the description
 * is generated (and review-queued) instead of copied from the wrong article.
 */
const QUEER_SENSE_RE =
  /\b(queer|lgbt\w*|gay|lesbian|bisexual|transgender|trans\b|nonbinary|non-binary|intersex|kink\w*|bdsm|fetish\w*|erotic\w*|sexual\w*|sexuality|drag\b|leather (?:community|subculture|scene)|polyamor\w*|consent\w*|dominan\w*|submissi\w*|sadis\w*|masochis\w*|bondage|swinger|cruising|chemsex|ballroom (?:culture|scene)|pride\b)\b/i

export function extractSupportsQueerSense(text: string | null | undefined): boolean {
  return !!text && QUEER_SENSE_RE.test(text)
}

/**
 * The voice. Fed as the system prompt to every glossary prose generation and
 * rewrite. Mirrors the site-wide copy rules (CLAUDE.md "Copy: direct factual
 * voice") and adds what a glossary needs: sense anchoring and honest absence.
 */
export const TAG_STYLE_SYSTEM = `You write glossary definitions for queer.guide, an LGBTQ+ travel and community platform. The readers are queer travelers, locals, and community members.

Voice rules — all of them binding:
- Direct, factual, plain. Define the term in its queer/community sense first.
- Say why the term matters on a queer platform when that is real (history, community, safety); never bolt on generic LGBTQ+ relevance where none exists.
- No marketing words (discover, explore, unlock, curated, journey, amazing, vibrant).
- No second person. No advice paragraphs. NEVER pad with consent/safety boilerplate ("it's essential to prioritize consent and communication", "always practice safe..."); where safety is genuinely part of the term (an edge-play practice, a substance), state the specific risk plainly in one clause instead.
- No hedging filler ("It's important to note", "generally speaking").
- Kink and sexual terms are described frankly and without euphemism or moralizing.
- Never fabricate history, statistics, or origins. If a fact is not in the provided material and not common knowledge, leave it out.
- British or American spelling: follow the source material; otherwise American.`

/** Sense-anchored define prompt for a tag with no usable grounding. */
export function buildDefinePrompt(name: string, categoryName: string | null): string {
  const cat = categoryName ? ` It is filed under "${categoryName}" in the glossary.` : ''
  return (
    `Define the term "${name}" as used in LGBTQ+ / queer community, kink, or travel culture.${cat}\n` +
    `Write 2-3 sentences. If the term has both an everyday meaning and a community-specific meaning, define ONLY the community-specific one.\n` +
    `If you do not actually know this term in that sense, reply with exactly: UNKNOWN`
  )
}

/**
 * Combined sense-judge + voice-rewrite prompt for a tag that already has
 * prose. One call answers both questions; JSON out.
 */
export function buildProseReviewPrompt(input: {
  name: string
  categoryName: string | null
  description: string | null
  shortDescription: string | null
}): string {
  const cat = input.categoryName ? ` (glossary category: "${input.categoryName}")` : ''
  return (
    `Glossary term: "${input.name}"${cat}\n\n` +
    `Current description:\n${input.description ?? '(none)'}\n\n` +
    (input.shortDescription ? `Current short description: ${input.shortDescription}\n\n` : '') +
    `Step 1 — SUBJECT CHECK. Does the current description actually describe THIS term in its queer/community/kink sense? Answer "wrong_subject" ONLY when the prose is clearly about something else: a specific person, song, film, band, company, animal species, place, ship, or an unrelated generic sense of the same word (e.g. industrial equipment on a kink term). Low quality alone is NOT wrong_subject.\n\n` +
    `Step 2 — REWRITE (only if the subject is right). Rewrite the description in the house voice, preserving every verifiable fact and adding none. Also produce a short description of at most 80 characters (plain, no trailing period needed).\n\n` +
    `Reply with ONLY JSON, no fences:\n` +
    `{"verdict":"wrong_subject"|"ok","confidence":0.0-1.0,"reason":"<one sentence>","description":"<rewrite, only when ok>","short_description":"<max 80 chars, only when ok>"}`
  )
}
