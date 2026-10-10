/**
 * The match gate for glossary photography.
 *
 * Glossary photos were retired on 2026-08-28 because the previous corpus was
 * built by "taking the TOP-1 Pexels/Unsplash hit for a keyword-mapped tag name
 * -- no scoring, no content-match check". This module is the content-match
 * check that did not exist. It is deliberately pure and has no I/O, so the
 * rules can be tested against the real strings that defeated the old system.
 *
 * WHAT THIS CAN AND CANNOT DO, stated because the boundary decides which tier
 * is allowed to auto-publish:
 *
 *   It CAN refuse an image whose file name and description have nothing to do
 *   with the tag. Measured against the retired corpus, that removes the whole
 *   observed failure class: `cum` -> Sca_fell_massif2010.JPG, `harness` ->
 *   Armures/musee de l'Armee, `dildo` -> LGBT_history_museum.jpg, `hindu` ->
 *   India-locator-map-blank.svg.
 *
 *   It CANNOT tell a namesake from the real sense. `unicorn` ->
 *   "Unicorn_spider_outline.jpg" corroborates perfectly on the word "unicorn"
 *   and is still wrong, exactly as the tag's own Wikidata link once pointed at
 *   a spider. No lexical rule fixes that, which is WHY keyword-search tiers are
 *   review-gated and only Wikidata P18 -- an image curated on the tag's own
 *   entity -- may publish without a human.
 */

/** Sources that may illustrate a glossary entry, mirroring the DB vocabulary. */
export type TagImageSource = 'wikidata:p18' | 'wikimedia' | 'pexels' | 'unsplash'

export const TAG_IMAGE_SOURCES: readonly TagImageSource[] = [
  'wikidata:p18',
  'wikimedia',
  'pexels',
  'unsplash',
] as const

/**
 * Non-photographic Commons files. Narrower than queer-imagery-backfill's copy
 * on purpose: that one rejects `flag_of` and `.svg` because a milestone wants a
 * photograph, and a glossary entry in Symbols & Flags legitimately wants the
 * flag. The drawn FlagSwatch already covers those tags, so the files are still
 * rejected here -- but a future caller that wants them should widen this rather
 * than discover the rejection by surprise.
 *
 * THE MAP ARM IS A LOOKAROUND, NOT `\bmap\b|_map`, AND THAT WAS MEASURED.
 * `\b` does not fire at `_map` because `_` is a \w character, which is why the
 * `_map` alternative was there at all -- and `_map` is a plain substring, so it
 * also matched `Leather_mapmaking_tools.jpg` and refused a photograph. Over-
 * refusing is not free here: a refusal counts an attempt toward the terminal
 * `data_unavailable` stamp, so it writes the tag off rather than merely costing
 * a look. One lookaround covers both separators and neither prefix:
 * `India-locator-map-blank` and `Locator_map_blank` match, `_mapmaking` and
 * `Roadmap` do not. Caught by the mirror case in the guard test, which exists
 * precisely so the pattern cannot be widened back into a substring sweep.
 */
export const TAG_IMAGE_REJECT =
  /\.svg$|\.gif$|(?<![a-z])maps?(?![a-z])|locator|coat_of_arms|seal_of|\bcoin\b|banknote|\blogo\b/i

/** UI chrome that litters Commons categories and article media lists. */
export const TAG_IMAGE_JUNK =
  /icon|stub|button|padlock|ambox|crystal|pictogram|commons-logo|wiki(?:media|news|quote|source|books)|\.ogg|\.webm|\.oga|\.pdf|\.tiff?|question_book|edit-|disambig|magnify|loudspeaker|star[_.-]|checkmark|placeholder|no[_-]?image/i

/**
 * Words that mark a Commons file as depicting explicit sexual activity.
 *
 * Commons names such files descriptively, which is what makes a lexical test
 * workable here at all: the files the retired corpus published were
 * `Cum_shot_on_butt.jpg`, `Hairy_facesitting.jpg` and
 * `Slave_kicked_in_the_balls_during_demonstration.jpg`.
 *
 * It is a HEURISTIC and is treated as one. A false "explicit" gates a tame
 * photograph behind age affirmation, which is mildly annoying; a false "not
 * explicit" publishes hardcore to an un-affirmed reader, which is harm. The two
 * errors are not symmetric, so `classifyExplicit` leans toward explicit and
 * every explicit candidate is routed to a human regardless of tier.
 */
const EXPLICIT_LEXICON = [
  'anal', 'anus', 'bdsm', 'blowjob', 'bondage', 'bukkake', 'cbt', 'cock',
  'creampie', 'cum', 'cunnilingus', 'deepthroat', 'dildo', 'dominatrix',
  'ejaculat', 'erect', 'facesitting', 'fellatio', 'fisting', 'flogging',
  'fuck', 'genital', 'handjob', 'intercourse', 'labia', 'masturbat', 'naked',
  'nude', 'orgasm', 'orgy', 'penetrat', 'penis', 'pegging', 'rimming',
  'scrotum', 'semen', 'sex', 'spanking', 'sperm', 'strapon', 'testicle',
  'threesome', 'vagina', 'vulva',
]

/** Combining marks, as an escape rather than a literal: a literal combining
 *  character in source is invisible and does not survive every editor. */
const COMBINING = /[̀-ͯ]/g

/** Collapse to comparable letters: lowercase, strip accents and punctuation. */
export function despace(value: string): string {
  return value.normalize('NFD').replace(COMBINING, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** Every word in a string, lowercased and unaccented. No filtering. */
export function tokenize(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(COMBINING, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0)
}

/** Words carrying meaning in a tag name. */
export function significantTokens(value: string): string[] {
  const STOP = new Set([
    'the', 'a', 'an', 'of', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with',
    'play', 'tag', 'tags',
  ])
  return tokenize(value).filter((t) => t.length > 1 && !STOP.has(t))
}

/**
 * Does the candidate's own text corroborate the tag's name?
 *
 * EVERY significant token must appear as a WHOLE TOKEN of the candidate's text.
 * Whole-token, not substring, is the entire difference from the matching that
 * produced the retired corpus: as a substring `cum` matches "Cumbria",
 * "cumulus" and "Cumberland", and `cum` -> Sca_fell_massif was published.
 *
 * SET MEMBERSHIP, NOT `\b`, AND THAT IS NOT A STYLE CHOICE. A regex word
 * boundary does not fire across an underscore -- `_` is a \w character -- and
 * Commons file names are underscore-separated, so `\bpup\b` does not match
 * `Pup_hood_and_mitts.jpg`. The first draft used `\b` and silently refused
 * every correct Commons candidate; caught by the test, not by reading.
 *
 * `aliases` are the tag's APPROVED aliases only. An unapproved alias is not a
 * synonym this platform trusts for auto-tagging, so it is not one for
 * illustration either.
 */
export function corroborates(
  tagName: string,
  aliases: readonly string[],
  candidateText: string,
): boolean {
  const hay = new Set(tokenize(candidateText))
  const names = [tagName, ...aliases].filter((n) => n && n.trim().length > 0)

  return names.some((name) => {
    const tokens = significantTokens(name)
    if (tokens.length === 0) return false
    return tokens.every((t) => hay.has(t))
  })
}

/** True when the candidate's text reads as explicit sexual activity. */
export function classifyExplicit(candidateText: string): boolean {
  const hay = candidateText.toLowerCase()
  return EXPLICIT_LEXICON.some((w) => hay.includes(w))
}

/**
 * Mirrors `zz_enforce_tag_image_contract`'s licence rule so the function can
 * refuse a candidate BEFORE spending a mirror on it rather than discovering the
 * refusal as a check_violation on write. Drift-tested against the migration:
 * two copies of a rule is a liability unless something pins them together.
 */
export function sourceAllowedForTag(
  source: TagImageSource,
  tag: { is_adult?: boolean | null; is_sensitive?: boolean | null },
): boolean {
  if (source === 'pexels' || source === 'unsplash') {
    return !(tag.is_adult === true || tag.is_sensitive === true)
  }
  return true
}

export interface TagImageCandidate {
  url: string
  source: TagImageSource
  /** Commons file title, Pexels/Unsplash id — whatever identifies it upstream. */
  sourceRef: string
  /** The candidate's own words: file title plus any upstream description. */
  text: string
  license: string | null
  attribution: string | null
  width?: number
  height?: number
}

export interface TagRow {
  slug: string
  name: string
  is_adult?: boolean | null
  is_sensitive?: boolean | null
}

export type TagImageVerdict =
  | { decision: 'publish'; explicit: boolean }
  | { decision: 'review'; explicit: boolean; why: string }
  | { decision: 'refuse'; why: string }

/** Minimum usable dimensions for a figure band. */
const MIN_W = 600
const MIN_H = 400

/**
 * The whole gate, in one place, returning one of THREE verdicts.
 *
 * `review` is not a softer `refuse` and must never collapse into it: a refusal
 * counts an attempt toward the terminal `data_unavailable` sentinel and writes
 * the tag off, while a review keeps a real candidate alive for a human. The
 * same distinction `city-class-guard.ts` draws between `refused` and
 * `undetermined`, and for the same reason -- absence of evidence is not
 * evidence of absence.
 */
export function tagImageVerdict(
  tag: TagRow,
  candidate: TagImageCandidate,
  aliases: readonly string[] = [],
): TagImageVerdict {
  if (!/^https:\/\//i.test(candidate.url)) {
    return { decision: 'refuse', why: 'not_https' }
  }
  if (!candidate.license || candidate.license.trim() === '') {
    // The 1,262-of-1,590 lesson. No licence, no publication, no exceptions.
    return { decision: 'refuse', why: 'no_license' }
  }
  if (!candidate.attribution || candidate.attribution.trim() === '') {
    return { decision: 'refuse', why: 'no_attribution' }
  }
  if (!sourceAllowedForTag(candidate.source, tag)) {
    return { decision: 'refuse', why: `stock_on_adult:${candidate.source}` }
  }
  // BOTH PATTERNS TEST THE FILE TITLE ONLY, NEVER THE URL, and that is not a
  // simplification. `TAG_IMAGE_JUNK` contains `wiki(?:media|news|quote|...)` so
  // it can reject files called `Commons-logo.svg` or `Wikinews-logo.png` — and
  // every Commons image is served from `upload.wikimedia.org`, so testing the
  // URL refuses the entire source. The first draft did exactly that and
  // rejected every candidate it was given; the probe said `junk_file` for
  // `Leathertools.jpg`. The junk signal lives in the file's NAME.
  if (TAG_IMAGE_JUNK.test(candidate.sourceRef)) {
    return { decision: 'refuse', why: 'junk_file' }
  }
  if (TAG_IMAGE_REJECT.test(candidate.sourceRef)) {
    return { decision: 'refuse', why: 'not_photographic' }
  }
  if ((candidate.width ?? 0) > 0 && (candidate.width ?? 0) < MIN_W) {
    return { decision: 'refuse', why: `too_small:${candidate.width}x${candidate.height ?? 0}` }
  }
  if ((candidate.height ?? 0) > 0 && (candidate.height ?? 0) < MIN_H) {
    return { decision: 'refuse', why: `too_small:${candidate.width ?? 0}x${candidate.height}` }
  }

  const text = `${candidate.sourceRef} ${candidate.text}`
  const lexiconHit = classifyExplicit(text)

  // On a tag that carries no adult flag, an explicit candidate is refused
  // outright rather than gated: there is no gate to put it behind, and the
  // contract trigger would refuse the write anyway — refusing here keeps the
  // reason legible instead of surfacing as a check_violation.
  if (lexiconHit && !tag.is_adult) {
    return { decision: 'refuse', why: 'explicit_on_non_adult' }
  }

  // THE LEXICON PROVABLY UNDER-DETECTS, SO ON AN ADULT TAG IT DOES NOT GET THE
  // LAST WORD. Measured against the retired corpus:
  // `Slave_kicked_in_the_balls_during_demonstration.jpg` was published on an
  // active tag and contains NO clinical term, so no word list of reasonable
  // size sees it. The misses are concentrated exactly where the harm is, so on
  // an `is_adult` tag a Commons candidate is treated as explicit BY DEFAULT.
  //
  // This is a precaution, not a claim about the pixels, and it is close to free:
  // an `is_adult` tag's whole page is already behind `TagDetailWithGate`, so the
  // flag costs that reader nothing. What it buys is that the image stays out of
  // og:image, social cards and search thumbnails, and that a human sees it
  // before it publishes.
  //
  // The honest cost, stated rather than buried: tier-1 P18 auto-publish is
  // therefore reachable only on NON-adult tags — 347 of the 1,196 indexable
  // cohort, not 423. Auto-publishing a Commons photograph onto an adult kink
  // page with neither a human nor a classifier having looked at it is precisely
  // the 2026-08-28 failure, so the reduction is the point.
  const explicit =
    lexiconHit ||
    (tag.is_adult === true && candidate.source !== 'pexels' && candidate.source !== 'unsplash')

  if (explicit) {
    return {
      decision: 'review',
      explicit: true,
      why: lexiconHit ? 'explicit_lexicon' : 'adult_tag_precaution',
    }
  }

  // P18 is curated on the tag's own Wikidata entity, so the match is structural
  // rather than guessed. It is the only tier that may publish unattended.
  if (candidate.source === 'wikidata:p18') {
    return { decision: 'publish', explicit: false }
  }

  // Everything else is a keyword search. Corroboration bounds the candidate set
  // but cannot settle a namesake, so a human decides.
  if (!corroborates(tag.name, aliases, `${candidate.sourceRef} ${candidate.text}`)) {
    return { decision: 'refuse', why: 'no_corroboration' }
  }
  return { decision: 'review', explicit: false, why: `keyword_tier:${candidate.source}` }
}
