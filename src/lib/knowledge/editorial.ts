export type KnowledgeKind = 'unified_tags' | 'personalities';
export type EditorialStatus =
  'research' | 'draft' | 'review' | 'approved' | 'published' | 'rejected' | 'superseded';
export interface EditorialSource {
  id: string;
  url: string;
  title: string;
  publisher: string;
  kind: 'primary' | 'authoritative' | 'secondary';
  supports: string;
  excerpt?: string;
  retrieved_at?: string;
  content_hash?: string;
}
export interface KnowledgeEntry {
  id: string;
  batch_id: string;
  entity_type: KnowledgeKind;
  entity_id: string;
  name: string;
  slug: string;
  pilot_group: string;
  reader_question: string;
  format: 'definition' | 'explainer' | 'guide' | 'profile';
  source_urls: string[];
  visual_ids: string[];
  portrait?: {
    width?: number;
    height?: number;
    license_url?: string;
    status: string;
    url: string;
    source_url: string;
    creator: string;
    license: string;
    attribution: string;
    alt: string;
    caption: string;
  };
  exception?: string;
}
export interface KnowledgeProposal {
  id: string;
  entry_id: string;
  base_hash: string;
  base_snapshot: Record<string, string | null>;
  patch: Record<string, string>;
  sources: EditorialSource[];
  status: EditorialStatus;
  checks: Record<string, boolean | string>;
  rubric: Record<string, number>;
  review_note?: string;
  reviewed_by?: string;
  checked_at?: string;
  published_at?: string;
  rolled_back_at?: string;
  updated_at: string;
}
export interface KnowledgeBatch {
  id: string;
  name: string;
  accepted_at?: string;
  automatic_enabled: boolean;
  paused_reason?: string;
  reader_test: { accuracy?: number; participants?: string[] };
}
export interface PublicKnowledgeEditorial {
  entity_id: string;
  proposal_id: string;
  sources: Pick<EditorialSource, 'url' | 'title' | 'publisher'>[];
  visual_ids: string[];
  portrait?: KnowledgeEntry['portrait'];
  published_at: string;
}
export const EDITORIAL_DIMENSIONS = [
  'clarity',
  'specificity',
  'usefulness',
  'nuance',
  'structure',
] as const;
export const REQUIRED_CHECKS = [
  'sources_retrieved',
  'subject_match',
  'claims_supported',
  'no_unsupported_additions',
  'valid_markup',
  'no_internal_language',
  'independent_sources',
] as const;
export function proposalProblems(proposal: KnowledgeProposal): string[] {
  const problems: string[] = [];
  for (const key of REQUIRED_CHECKS)
    if (proposal.checks[key] !== true) problems.push(key.replaceAll('_', ' '));
  for (const key of EDITORIAL_DIMENSIONS)
    if (!(proposal.rubric[key] >= 4 && proposal.rubric[key] <= 5))
      problems.push(`${key}: needs at least 4/5`);
  if (!proposal.checked_at || Date.now() - Date.parse(proposal.checked_at) > 7 * 86400000)
    problems.push('validation needs refreshing');
  return problems;
}
export function editorialPath(entry: Pick<KnowledgeEntry, 'entity_type' | 'slug'>): string {
  return `/${entry.entity_type === 'unified_tags' ? 'tags' : 'personalities'}/${encodeURIComponent(entry.slug)}`;
}
