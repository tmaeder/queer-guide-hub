import { JEV_MODEL, type JevRequest, type JevResponse } from './jev-client.ts'

export const PIPELINE_QUESTION_VERSION = 'jev-pipeline-faithfulness-v1'
// These adapters ingest public publisher/operator records. Private/community
// sources require a separate authorized projection; never serialize a whole row.
export const PUBLIC_MARKETPLACE_SOURCES = [
  'adamssceptre', 'autostraddle', 'backroomgear', 'beefcakeswimwear',
  'bigbudpress', 'charliebymz', 'effenberger', 'fetchshop', 'gfwclothing',
  'mr-riegillio', 'ohmyfantasy', 'orttu', 'peaudeloup', 'pridesocks',
  'prowlerred', 'puppyplayexpert', 'regulation', 'rubbertwunk', 'rufskin',
  'ryvkstudio', 'spectrumoutfitters', 'twink-x', 'wetforher',
] as const // Verified public Shopify/WooCommerce adapter nodes, 2026-10-29.
const PUBLIC_SOURCES = new Set<string>([
  'rss-news', 'eventfrog', 'gay-ch', 'gaybasel', 'gayout', 'gaytravel4u',
  'haz-ch', 'lgbtnetwork', 'milchjugend', 'queer-kalender', 'rheinfetisch',
  'abuniverse', 'friend-of-dorothy', ...PUBLIC_MARKETPLACE_SOURCES,
])
type Json = Record<string, unknown>
export interface PipelineEvidence {
  entity_type: string
  source_name: string
  original: { title: string; text: string }
  candidate: Record<string, string>
}
function object(value: unknown): Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
}
function text(value: unknown): string { return typeof value === 'string' ? value.trim() : '' }

/** Raw adapter text is the evidence; enriched/generated text is never evidence. */
export function projectPublicSource(row: Json): { evidence: Omit<PipelineEvidence, 'candidate'> | null; reason?: string } {
  if (!PUBLIC_SOURCES.has(String(row.source_name)) || !['news_article', 'event', 'marketplace'].includes(String(row.entity_type))) return { evidence: null, reason: 'source_not_authorized' }
  const raw = object(row.raw_data)
  const title = text(raw.title) || text(raw.name) || text(raw.summary)
  const original = text(raw.content) || text(raw.body) || text(raw.description) || text(raw.excerpt)
  // A bounded whole excerpt is preferable to silently removing qualifications.
  if (!title || original.length < 40) return { evidence: null, reason: 'missing_original_text' }
  if (title.length > 500 || original.length > 12000) return { evidence: null, reason: 'source_exceeds_bounds' }
  return { evidence: { entity_type: String(row.entity_type), source_name: String(row.source_name), original: { title, text: original } } }
}

export function projectPipelineEvidence(row: Json): { evidence: PipelineEvidence | null; reason?: string } {
  const source = projectPublicSource(row)
  if (!source.evidence) return { evidence: null, reason: source.reason }
  const normalized = object(row.normalized_data), enriched = object(row.enriched_data)
  const candidate: Record<string, string> = {}
  for (const [key, value] of Object.entries({
    title: normalized.title || normalized.name,
    description: normalized.description,
    summary: enriched.ai_summary,
  })) {
    if (value === undefined || value === null || value === '') continue
    if (typeof value !== 'string' || value.length > 4000) return { evidence: null, reason: 'candidate_exceeds_bounds' }
    if (value.trim()) candidate[key] = value.trim()
  }
  if (Object.keys(candidate).length === 0) return { evidence: null, reason: 'missing_candidate' }
  return { evidence: { ...source.evidence, candidate } }
}

export function buildPipelineRequest(evidence: PipelineEvidence): JevRequest {
  return { model: JEV_MODEL, state: { question_version: PIPELINE_QUESTION_VERSION, ...evidence }, questions: {
    same_subject: { type: 'noul', instructions: 'Do `candidate` and `original` describe the same specific subject?', criteria: {
      true: 'Both texts identify the same entity, article subject or event occurrence.',
      false: 'The candidate describes another entity, a namesake or another occurrence.',
    } },
    faithful: { type: 'noul', instructions: 'Are the factual assertions in `candidate` supported by `original`?', criteria: {
      true: 'The candidate faithfully paraphrases or translates the original, preserving its scope and qualifications.',
      false: 'The candidate adds facts absent from the original, changes the meaning or removes a qualification.',
    } },
    contradicted: { type: 'noul', instructions: 'Does `original` explicitly contradict a factual assertion in `candidate`?', criteria: {
      true: 'A concrete original statement is incompatible with a candidate assertion.',
      false: 'No original statement contradicts the candidate. An omitted fact alone is not a contradiction.',
    } },
    explicit_lgbtq_context: { type: 'noul', instructions: 'Does `original` explicitly discuss LGBTQ people, communities or topics?', criteria: {
      true: 'The text expressly discusses LGBTQ people, communities, culture, rights or related topics.',
      false: 'The text has no explicit LGBTQ context. Names, appearance, a rainbow color or an inclusive slogan alone do not establish it.',
    } },
  } }
}

/** Shadow signal only: these starting thresholds grant no publishing authority. */
export function pipelineJudgment(response: JevResponse): 'supported' | 'contradicted' | 'uncertain' {
  const read = (key: string) => {
    const a = response.answers[key] as { type?: string; noul?: unknown } | undefined
    if (a?.type !== 'noul' || typeof a.noul !== 'number' || !Number.isFinite(a.noul) || a.noul < 0 || a.noul > 1) throw new Error('Invalid pipeline judgment')
    return a.noul
  }
  const same = read('same_subject'), faithful = read('faithful'), contradiction = read('contradicted')
  read('explicit_lgbtq_context')
  if (same >= 0.7 && faithful >= 0.7 && contradiction <= 0.3) return 'supported'
  if (same >= 0.7 && faithful <= 0.3 && contradiction >= 0.7) return 'contradicted'
  return 'uncertain'
}
