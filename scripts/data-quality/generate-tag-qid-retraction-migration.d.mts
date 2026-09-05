/**
 * Types for the QID-retraction generator.
 *
 * The generator is plain .mjs because it runs as a CLI in CI with no build
 * step, but src/lib/__tests__/tagQidRetraction.test.ts imports it and
 * tsconfig.app.json type-checks src/. Without this, that import is TS7016
 * ("could not find a declaration file") and every callback below it is an
 * implicit any — 4 new ratchet groups, which is a CI failure, not a warning.
 */

/** One member row of a duplicate-wikidata_id group, as measured on prod. */
export interface TagDecisionMember {
  slug: string
  name: string
  status: string
  seo_indexable: boolean
  usage_count: number
  entity_kind: string
  category_name: string | null
  is_adult: boolean
}

/** One hand-authored disposition, keyed by the shared Wikidata id. */
export interface TagDecision {
  wikidata_id: string
  qid_label: string | null
  qid_desc: string | null
  disposition:
    | 'merge'
    | 'wrong-qid'
    | 'qid-belongs-to-neither'
    | 'generic-sense-twin'
    | 'cross-vocab'
    | 'review'
  winner: string | null
  losers: string[]
  retract: string[]
  /** Slugs deliberately left out of a partial merge. */
  excluded: string[]
  /** tag_categories.name the winner should end up in, when its filing is wrong. */
  refile: string | null
  reason: string
  members: TagDecisionMember[]
}

/** A single slug whose wikidata_id is being cleared, with its evidence. */
export interface TagRetraction {
  slug: string
  qid: string
  label: string | null
  desc: string | null
  reason: string
  disposition: string
}

export const DECISIONS: string
export const MIGRATION: string
export function retractions(decisions: TagDecision[]): TagRetraction[]
export function buildSql(decisions: TagDecision[]): string
