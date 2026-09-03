// Pure logic for source-tags-extract: corpus fold, re-proposal guard, collision
// stamping and the proposed_value row shape.
//
// Separate from index.ts so it is testable — importing index.ts runs
// Deno.serve() at module load.
import { tagSlug } from './slug.ts'

export type ExtractedTag = { name: string; slug: string; seen_in: string[] }
export type TagRef = { slug: string; name: string; status: string | null }
export type AliasRef = { alias_name: string; review_status: string | null; tag_id: string }

export type Collision =
  | { kind: 'name'; tag_slug: string; tag_name: string; tag_status: string | null }
  | {
    kind: 'alias'
    tag_slug: string
    tag_name: string
    tag_status: string | null
    via_alias: string
    alias_review_status: string | null
  }

export type VocabularyIndex = {
  byName: Map<string, TagRef>
  byAlias: Map<string, AliasRef>
  byId: Map<string, TagRef>
}

/**
 * ai_suggestions statuses that make a slug already-decided.
 *
 * `rejected` is in the list because a rejected row is a TOMBSTONE: this is a
 * weekly cron over a corpus that barely changes, so without it every string a
 * human refused is re-filed the following Sunday. `superseded` and `expired`
 * are deliberately OUT — both mean the proposal lapsed without a human verdict,
 * so re-filing is the point.
 */
export const DECIDED_STATUSES: string[] = ['pending', 'approved', 'applied', 'rejected']

/** The comparison key duplicate_active_name uses: lower(btrim(name)). */
export const nameKey = (s: string) => s.trim().toLowerCase()

/**
 * Fold one row's tags[] into the accumulator, keyed by slug.
 *
 * The key is the slug, not the name: "Bühne" and "bühne" are one proposal.
 * `seen_in` accumulates every source table the string appeared in, so a
 * reviewer can tell a one-venue typo from platform-wide vocabulary.
 */
export function foldTags(acc: Map<string, ExtractedTag>, table: string, tags: unknown): void {
  if (!Array.isArray(tags)) return
  for (const tag of tags) {
    // Non-strings are dropped rather than coerced. `String(null)` is 'null',
    // which slugifies to `null` and would file a proposal for a tag literally
    // named "null" — text[] permits NULL elements, and the old String(tag)
    // coercion would have published one. Zero such rows exist today, which is
    // a measurement, not a constraint.
    if (typeof tag !== 'string') continue
    const name = tag.trim()
    if (!name) continue
    const slug = tagSlug(name)
    if (!slug) continue
    const seen = acc.get(slug)
    if (seen) {
      if (!seen.seen_in.includes(table)) seen.seen_in.push(table)
    } else {
      acc.set(slug, { name, slug, seen_in: [table] })
    }
  }
}

/**
 * The re-proposal guard.
 *
 * `knownSlugs` is every unified_tags slug in ANY status — a deprecated tag must
 * not be re-proposed, because reviving one is restore_deprecated_tag()'s job.
 * `alreadyProposed` includes REJECTED slugs: a rejected row is a tombstone, and
 * without honouring it this weekly cron re-files everything a human refused.
 */
export function selectProposals(
  extracted: Iterable<ExtractedTag>,
  knownSlugs: ReadonlySet<string>,
  alreadyProposed: ReadonlySet<string>,
): ExtractedTag[] {
  return Array.from(extracted).filter(t => !knownSlugs.has(t.slug) && !alreadyProposed.has(t.slug))
}

/**
 * Name/alias collision for a proposal the slug guard let through.
 *
 * Returns a stamp, never a verdict — see the block comment in index.ts for why
 * these are surfaced rather than filtered.
 */
export function collisionFor(name: string, idx: VocabularyIndex): Collision | null {
  const k = nameKey(name)
  const hit = idx.byName.get(k)
  if (hit) return { kind: 'name', tag_slug: hit.slug, tag_name: hit.name, tag_status: hit.status }
  const alias = idx.byAlias.get(k)
  if (!alias) return null
  const target = idx.byId.get(alias.tag_id)
  return {
    kind: 'alias',
    tag_slug: target?.slug ?? '',
    tag_name: target?.name ?? '',
    tag_status: target?.status ?? null,
    via_alias: alias.alias_name,
    alias_review_status: alias.review_status,
  }
}

/** The ai_suggestions row this node files. Nothing here touches unified_tags. */
export function buildProposalRow(t: ExtractedTag, collision: Collision | null, runId: string) {
  return {
    suggestion_type: 'tag',
    entity_type: 'tag',
    entity_id: null,
    source: 'rule',
    source_run_id: runId,
    status: 'pending',
    proposed_value: {
      name: t.name,
      slug: t.slug,
      seen_in: t.seen_in,
      ...(collision ? { collides_with: collision } : {}),
    },
  }
}
