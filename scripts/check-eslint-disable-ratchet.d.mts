/** Types for the suppression ratchet, so its vitest guard imports it without an implicit `any`. */
export type Counts = Record<string, number>;
export type Files = Record<string, Counts>;
export interface Delta {
  file: string;
  rule: string;
  was: number;
  now: number;
}
export function countSuppressions(text: string): Counts;
export function compare(base: Files, now: Files): { regressions: Delta[]; shrinks: Delta[] };
export function scan(dir?: string): Files;
