/**
 * Types for the review-backlog drain generator. The generator is plain .mjs
 * (it runs as a CLI with no build step) but the round-trip test imports it and
 * tsconfig.app.json type-checks src/, so without this every import is TS7016
 * and every callback an implicit any -- a hard CI failure.
 */

/** One backlog row whose wikidata_id is being cleared, with its evidence. */
export interface BacklogRetraction {
  slug: string
  qid: string
  /** The QID's live English Wikidata label — the evidence for the verdict. */
  wd_label: string | null
  wd_desc: string | null
  category: string
  seo_indexable: boolean
  usage_count: number
  reason: string
}

export const DECISIONS: string
export const NONACTIONS: string
export const MIGRATION: string
export function retractions(decisions: BacklogRetraction[]): BacklogRetraction[]
export function buildSql(decisions: BacklogRetraction[]): string
