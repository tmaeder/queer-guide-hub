/**
 * Types for the migration SQL parse gate, so `src/lib/__tests__/
 * migrationSqlParse.test.ts` can import it without an implicit `any`.
 *
 * Declared rather than baselined: CLAUDE.md's rule is to fix a typecheck error
 * instead of recording it, and the alternative here — restating the allowlist
 * inside the test — would let the gate and its guard drift apart, which is the
 * one thing the test exists to prevent.
 */

/** Pre-existing unparseable migrations, all applied. May only ever shrink. */
export declare const KNOWN_UNPARSEABLE: Set<string>;

/** Floor below which a "clean" sweep is treated as a mis-pathed directory. */
export declare const MIN_CORPUS: number;

/** Resolves Postgres's own parser (libpg-query, pinned to 17.x). */
export declare function loadParser(): Promise<(sql: string) => Promise<unknown>>;
