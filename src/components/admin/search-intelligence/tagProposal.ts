// New-tag proposals from `source-tags-extract`.
//
// That node files scraped free-text strings as PROPOSALS rather than minting
// them: a `tag` suggestion with `entity_id = null`, because the tag does not
// exist yet. Every other suggestion type edits an existing row, so this shape
// needs its own read (the generic JSON dump buries the collision stamp) and its
// own apply (there is no row to update — see `createTagFromProposal`).
//
// Pure parsing lives here rather than in SuggestionsTab.tsx so the component
// file only exports components (react-refresh) and so the parser is testable
// without rendering.

export interface TagProposalCollision {
  kind: 'name' | 'alias';
  tag_slug: string;
  tag_name: string;
  tag_status: string | null;
  via_alias?: string | null;
  alias_review_status?: string | null;
}

export interface NewTagProposal {
  name: string;
  /** The producer's own slug. Advisory only — the DB derives the real one. */
  slug: string | null;
  seenIn: string[];
  collidesWith: TagProposalCollision | null;
}

function parseCollision(raw: unknown): TagProposalCollision | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (c.kind !== 'name' && c.kind !== 'alias') return null;
  return {
    kind: c.kind,
    tag_slug: typeof c.tag_slug === 'string' ? c.tag_slug : '',
    tag_name: typeof c.tag_name === 'string' ? c.tag_name : '',
    tag_status: typeof c.tag_status === 'string' ? c.tag_status : null,
    via_alias: typeof c.via_alias === 'string' ? c.via_alias : null,
    alias_review_status: typeof c.alias_review_status === 'string' ? c.alias_review_status : null,
  };
}

/**
 * Recognize a new-tag proposal. Returns null for every other suggestion —
 * including a `tag` suggestion that DOES carry an entity_id, which is the
 * pre-existing "attach this existing tag to that entity" shape the edge
 * function's `applySuggestion` already handles.
 *
 * `seen_in` is normalized to an array: the producer writes `string[]`
 * (`buildProposalRow` in source-tags-extract/extract.ts), but a hand-edited
 * proposal can arrive as a comma-joined string, and this must not throw on it.
 */
export function parseTagProposal(s: {
  suggestion_type: string;
  entity_id: string | null;
  proposed_value: unknown;
}): NewTagProposal | null {
  if (s.suggestion_type !== 'tag' || s.entity_id) return null;
  if (!s.proposed_value || typeof s.proposed_value !== 'object') return null;
  const v = s.proposed_value as Record<string, unknown>;
  if (typeof v.name !== 'string' || !v.name.trim()) return null;
  const seenIn = Array.isArray(v.seen_in)
    ? v.seen_in.filter((x): x is string => typeof x === 'string')
    : typeof v.seen_in === 'string'
      ? v.seen_in
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      : [];
  return {
    name: v.name,
    slug: typeof v.slug === 'string' && v.slug ? v.slug : null,
    seenIn,
    collidesWith: parseCollision(v.collides_with),
  };
}
