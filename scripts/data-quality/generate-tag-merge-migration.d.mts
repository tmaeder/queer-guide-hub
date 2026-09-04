/**
 * Types for the tag-merge generator. See the sibling
 * generate-tag-qid-retraction-migration.d.mts for why these exist.
 */
import type { TagDecision } from './generate-tag-qid-retraction-migration.d.mts'

/** One (winner, loser) merge, expanded from a decision group. */
export interface TagMergePair {
  winner: string
  loser: string
  qid: string
  reason: string
  /** tag_categories.name to move the winner into, or null to leave its filing. */
  refile: string | null
}

export const DECISIONS: string
export const MIGRATION: string
export function pairs(decisions: TagDecision[]): TagMergePair[]
export function buildSql(decisions: TagDecision[]): string
