// Personhood classifier — decide whether a row filed in `personalities` is a
// real individual person, or a misfiled organization / venue / team / work.
//
// Three layers, fused hybrid-by-confidence:
//   1. Heuristics (free, sync): name structural tokens + bio org-subject
//      phrasing, reusing classifyEntityType.
//   2. Wikidata P31 (authoritative, network): is the best-matching entity a
//      human (Q5) or a non-person class? An absent entity is NOT evidence of
//      non-personhood.
//   3. LLM grounded in the bio (network): is/not-a-person + suggested type.
//
// Disposition is the caller's job. This module only returns a verdict +
// confidence + the signals that produced it, so archiving is auditable.

import { classifyEntityType } from './entity-type-classifier.ts'
import { classifyWikidataPersonhood, type NonPersonType } from './wikidata-resolve.ts'
import { llmChatCompletion, isLlmConfigured } from './llm-client.ts'

export type PersonhoodVerdict = 'person' | 'non_person' | 'uncertain'

export interface PersonhoodInput {
  name: string
  bio?: string | null
  profession?: string | null
  hasDates?: boolean // birth_date or death_date present (strong person marker)
}

export interface PersonhoodResult {
  verdict: PersonhoodVerdict
  confidence: number // 0..1 in the verdict
  suggestedType: NonPersonType | 'person' | null
  signals: string[]
  wikidataQid?: string
}

// Deps are injected so the fusion logic is unit-testable without network.
export interface PersonhoodDeps {
  wikidata?: typeof classifyWikidataPersonhood
  llm?: (input: PersonhoodInput) => Promise<LlmPersonhood | null>
}

export interface LlmPersonhood {
  isPerson: boolean
  type: 'person' | NonPersonType
  confidence: number
  reason?: string
}

// --- Layer 1: heuristics ----------------------------------------------------

const NAME_ORG_TOKEN =
  /\b(water\s?polo|rugby|softball|volleyball|frontrunners|bowling|dodgeball|kickball|football\s?club|wrestling\s?club|swim\s?team|track\s?club|athletic|chorus|chorale|choir|symphony|orchestra|ensemble|quartet|sisters\s+of\s+perpetual|brotherhood|sorority|fraternity|house\s+of\s+|society\b|association\b|coalition|alliance\b|task\s?force|foundation\b|federation|collective\b|cooperative|congregation|fellowship|ministries|ministry\b|institute\b|guild\b|league\b|chamber\s+of)/i

const BIO_ORG_SUBJECT =
  /\b(is|was)\s+(a|an|the)\s+([a-z'-]+\s+){0,4}(organization|organisation|non-?profit|not-for-profit|charity\b|charitable\s+organi|foundation|ngo\b|nonprofit|association|collective|cooperative|sports\s+team|water\s+polo\s+team|rugby\s+club|softball\s+(team|league)|sports\s+club|restaurant|eatery|bistro|diner|caf[eé]\b|coffee\s?shop|gay\s+bar|nightclub|bathhouse|sauna\b|guesthouse|guest\s?house|hostel|festival\b|chorus\b|chorale\b|theatre\s+company|dance\s+company|record\s+label|magazine\b|newspaper|publication)/i

interface HeuristicSignal {
  lean: PersonhoodVerdict
  weight: number // 0..1 strength
  signals: string[]
  suggestedType: NonPersonType | 'person' | null
}

export function heuristicPersonhood(input: PersonhoodInput): HeuristicSignal {
  const signals: string[] = []
  const name = (input.name ?? '').trim()
  const bio = (input.bio ?? '').trim()

  // Strong person markers short-circuit toward person.
  if (input.hasDates) signals.push('has_birth_or_death_date')

  const nameTok = NAME_ORG_TOKEN.test(name)
  const bioOrg = BIO_ORG_SUBJECT.test(bio)
  if (nameTok) signals.push('name_token')
  if (bioOrg) signals.push('bio_org_subject')

  // Reuse the CSV-routing classifier as a corroborating signal.
  const ct = classifyEntityType({ name, bio, profession: input.profession ?? undefined })
  if (ct.entityType === 'venue') signals.push('classifier:venue')
  if (ct.entityType === 'event') signals.push('classifier:event')
  if (ct.entityType === 'personality') signals.push('classifier:person')

  // A real birth/death date is the single strongest person signal — Wikidata
  // dates are almost never attached to orgs in this dataset.
  if (input.hasDates) {
    return { lean: 'person', weight: 0.8, signals, suggestedType: 'person' }
  }

  const orgVotes = (nameTok ? 1 : 0) + (bioOrg ? 1 : 0) + (ct.entityType === 'venue' ? 1 : 0)
  if (orgVotes >= 2) {
    return { lean: 'non_person', weight: 0.7, signals, suggestedType: bioOrg || nameTok ? 'organization' : 'venue' }
  }
  if (orgVotes === 1) {
    return { lean: 'non_person', weight: 0.4, signals, suggestedType: nameTok ? 'organization' : 'venue' }
  }
  if (ct.entityType === 'personality') {
    return { lean: 'person', weight: 0.3, signals, suggestedType: 'person' }
  }
  return { lean: 'uncertain', weight: 0, signals, suggestedType: null }
}

// --- Layer 3: LLM, grounded in the bio --------------------------------------

const LLM_SYSTEM =
  'You are a precise data-quality classifier. Decide whether a record describes a single real individual human being, or instead an organization, venue/place, sports team, band/musical group, event, or creative work. Ground your answer ONLY in the provided name and description. Output STRICT JSON, no prose.'

function buildLlmPrompt(input: PersonhoodInput): string {
  const bio = (input.bio ?? '').slice(0, 1200)
  return [
    `Name: ${input.name}`,
    input.profession ? `Recorded profession: ${input.profession}` : '',
    bio ? `Description: ${bio}` : 'Description: (none)',
    '',
    'Is this a single real individual person (a human being), or a non-person',
    '(organization, venue, team, band, event, or work)?',
    'Respond as JSON: {"is_person": boolean, "type": "person"|"organization"|"venue"|"team"|"event"|"work"|"other", "confidence": 0..1, "reason": "short"}',
    'If the description is empty or you cannot tell, set is_person:true with low confidence (default to keeping ambiguous rows as people).',
  ].filter(Boolean).join('\n')
}

function parseLlmJson(content: string): LlmPersonhood | null {
  if (!content) return null
  let raw = content.trim()
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) raw = fence[1].trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    const o = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
    const isPerson = o.is_person === true || o.is_person === 'true'
    const type = String(o.type ?? (isPerson ? 'person' : 'other')) as LlmPersonhood['type']
    let confidence = typeof o.confidence === 'number' ? o.confidence : Number(o.confidence)
    if (!Number.isFinite(confidence)) confidence = 0.5
    confidence = Math.max(0, Math.min(1, confidence))
    return { isPerson, type, confidence, reason: typeof o.reason === 'string' ? o.reason : undefined }
  } catch {
    return null
  }
}

/** Default LLM probe (CF Workers AI via llm-client). Returns null if unconfigured. */
export async function llmPersonhood(input: PersonhoodInput): Promise<LlmPersonhood | null> {
  if (!isLlmConfigured()) return null
  const res = await llmChatCompletion({
    messages: [
      { role: 'system', content: LLM_SYSTEM },
      { role: 'user', content: buildLlmPrompt(input) },
    ],
    temperature: 0,
    max_tokens: 200,
    timeoutMs: 20_000,
    retries: 1,
  })
  return parseLlmJson(res.content)
}

// --- Fusion -----------------------------------------------------------------

const NONPERSON_FROM_LLM: Record<string, NonPersonType> = {
  organization: 'organization', venue: 'venue', team: 'team',
  event: 'event', work: 'work', other: 'other',
}

/**
 * Fuse the three layers into a single verdict. Priority of evidence:
 *   Wikidata P31 (authoritative when a confident match exists)
 *   > LLM grounded in a non-empty bio
 *   > heuristics.
 * Conservative bias: never returns non_person on weak evidence — the caller
 * only archives at confidence >= ~0.8, so uncertain rows are left as people.
 */
export async function classifyPersonhood(
  input: PersonhoodInput,
  deps: PersonhoodDeps = {},
): Promise<PersonhoodResult> {
  const wikidata = deps.wikidata ?? classifyWikidataPersonhood
  const llm = deps.llm ?? llmPersonhood

  const h = heuristicPersonhood(input)
  const signals = [...h.signals]
  let wikidataQid: string | undefined

  // Strong person marker (dates) — trust it, skip the network.
  if (input.hasDates) {
    return { verdict: 'person', confidence: 0.85, suggestedType: 'person', signals }
  }

  // Layer 2: Wikidata.
  let wdVote: { lean: PersonhoodVerdict; weight: number; type: NonPersonType | 'person' | null } | null = null
  try {
    const wd = await wikidata(input.name)
    if (wd.found) {
      wikidataQid = wd.qid
      signals.push(`wikidata:${wd.qid}${wd.isHuman ? ':human' : wd.nonPersonType ? `:${wd.nonPersonType}` : ''}`)
      if (wd.isHuman) {
        wdVote = { lean: 'person', weight: 0.5 + 0.4 * wd.matchConfidence, type: 'person' }
      } else if (wd.nonPersonType && wd.nonPersonType !== 'other') {
        wdVote = { lean: 'non_person', weight: 0.5 + 0.4 * wd.matchConfidence, type: wd.nonPersonType }
      } else if (wd.nonPersonType === 'other') {
        wdVote = { lean: 'non_person', weight: 0.4 * wd.matchConfidence, type: 'other' }
      }
    }
  } catch { /* network best-effort */ }

  // Layer 3: LLM grounded in bio (only meaningful with a bio).
  let llmVote: { lean: PersonhoodVerdict; weight: number; type: NonPersonType | 'person' | null } | null = null
  const hasBio = !!(input.bio && input.bio.trim().length >= 20)
  if (hasBio) {
    try {
      const r = await llm(input)
      if (r) {
        signals.push(`llm:${r.isPerson ? 'person' : r.type}:${r.confidence.toFixed(2)}`)
        // The LLM reading the actual bio is the most trusted single signal for
        // "is this a person". A high-confidence grounded org/venue verdict can
        // reach archive grade alone (0.9·conf); a medium one stays in triage.
        llmVote = r.isPerson
          ? { lean: 'person', weight: 0.6 * r.confidence, type: 'person' }
          : { lean: 'non_person', weight: 0.9 * r.confidence, type: NONPERSON_FROM_LLM[r.type] ?? 'other' }
      }
    } catch (e) {
      // Let an open circuit propagate so the caller can stop the batch; any
      // other LLM failure degrades to heuristic + Wikidata.
      if ((e as Error)?.name === 'CircuitOpenError') throw e
    }
  }

  // Aggregate weighted votes.
  let personScore = 0
  let nonPersonScore = 0
  let suggestedType: NonPersonType | 'person' | null = h.suggestedType
  const apply = (v: { lean: PersonhoodVerdict; weight: number; type: NonPersonType | 'person' | null } | null) => {
    if (!v) return
    if (v.lean === 'person') personScore += v.weight
    else if (v.lean === 'non_person') { nonPersonScore += v.weight; if (v.type) suggestedType = v.type }
  }
  // Heuristic contributes a light vote.
  apply({ lean: h.lean, weight: h.weight * 0.5, type: h.suggestedType })
  apply(wdVote)
  apply(llmVote)

  // Wikidata-human is a hard veto against archiving: a confident Q5 match means
  // it IS a person regardless of noisy name tokens.
  if (wdVote?.lean === 'person' && wdVote.weight >= 0.7) {
    return { verdict: 'person', confidence: wdVote.weight, suggestedType: 'person', signals, wikidataQid }
  }

  const margin = nonPersonScore - personScore
  if (nonPersonScore >= 0.7 && margin >= 0.3) {
    return { verdict: 'non_person', confidence: Math.min(0.99, nonPersonScore), suggestedType, signals, wikidataQid }
  }
  if (personScore >= 0.6 && personScore > nonPersonScore) {
    return { verdict: 'person', confidence: Math.min(0.99, personScore), suggestedType: 'person', signals, wikidataQid }
  }
  return { verdict: 'uncertain', confidence: Math.max(personScore, nonPersonScore), suggestedType, signals, wikidataQid }
}
