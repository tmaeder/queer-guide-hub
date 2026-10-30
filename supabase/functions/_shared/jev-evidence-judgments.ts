import { JEV_MODEL, type JevRequest, type JevResponse } from './jev-client.ts'

export const EVIDENCE_QUESTION_VERSION = 'jev-field-evidence-v1'
export interface PublicFieldCandidate {
  subject: { name: string; locality: string }
  field: string
  value: string
  source: { title: string; url: string; text: string }
  sensitive: boolean
  /** Supplied by an authorized workflow, never inferred by a model. */
  authorization: 'public_record' | 'explicit_consent' | 'missing'
}
export type FieldVerdict = 'supported' | 'contradicted' | 'uncertain' | 'missing_evidence' | 'missing_authorization'

export function fieldPrecondition(candidate: PublicFieldCandidate): FieldVerdict | null {
  if (candidate.authorization === 'missing') return 'missing_authorization'
  if (!candidate.subject.name.trim() || !candidate.field.trim() || !candidate.value.trim() || !candidate.source.text.trim()) return 'missing_evidence'
  return null
}

/** One atomic judgment per question. Code, not Jev, decides what may be applied. */
export function buildFieldEvidenceRequest(candidate: PublicFieldCandidate): JevRequest {
  for (const text of [candidate.subject.name, candidate.subject.locality, candidate.field, candidate.value, candidate.source.title, candidate.source.url, candidate.source.text]) {
    if (typeof text !== 'string' || text.length > 18000) throw new Error('Invalid public field evidence')
  }
  const source = new URL(candidate.source.url)
  if (source.protocol !== 'https:' || source.username || source.password) throw new Error('Invalid public source identity')
  return {
    model: JEV_MODEL,
    state: {
      question_version: EVIDENCE_QUESTION_VERSION,
      subject: { name: candidate.subject.name, locality: candidate.subject.locality },
      proposed_field: candidate.field,
      proposed_value: candidate.value,
      source: { title: candidate.source.title, url: candidate.source.url, text: candidate.source.text },
    },
    questions: {
      same_subject: { type: 'noul', instructions: 'Does `source.text` describe the exact subject identified by `subject`?', criteria: {
        true: 'The source identifies this exact entity or occurrence in this locality.',
        false: 'The source describes a namesake, another locality or occurrence, or does not establish the subject identity.',
      } },
      supports_value: { type: 'noul', instructions: 'Does `source.text` explicitly establish `proposed_value` for `proposed_field`?', criteria: {
        true: 'The source expressly supports the exact value with its scope and qualifications preserved.',
        false: 'The source omits the value, discusses another property, contradicts it, or requires an inference about identity, ownership, consent, law, safety or accessibility.',
      } },
      contradicts_value: { type: 'noul', instructions: 'Does `source.text` expressly state a fact incompatible with `proposed_value` for `proposed_field`?', criteria: {
        true: 'A concrete source statement directly contradicts the exact value.',
        false: 'The source supports the value or is silent about it. Missing evidence is not a contradiction.',
      } },
    },
  }
}

export function fieldEvidenceVerdict(candidate: PublicFieldCandidate, response: JevResponse): FieldVerdict {
  const prerequisite = fieldPrecondition(candidate)
  if (prerequisite) return prerequisite
  const read = (name: string) => {
    const answer = response.answers[name] as { type?: unknown; noul?: unknown } | undefined
    if (answer?.type !== 'noul' || typeof answer.noul !== 'number' || !Number.isFinite(answer.noul) || answer.noul < 0 || answer.noul > 1) throw new Error('Invalid field judgment')
    return answer.noul
  }
  const same = read('same_subject'), support = read('supports_value'), contradiction = read('contradicts_value')
  const yes = candidate.sensitive ? 0.99 : 0.97
  const no = 1 - yes
  if (same >= yes && support >= yes && contradiction <= no) return 'supported'
  if (same >= yes && contradiction >= yes && support <= no) return 'contradicted'
  return 'uncertain'
}
