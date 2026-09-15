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

/**
 * Languages whose bodies are SQL-shaped enough for paren balance to be a real
 * invariant. Anything else is skipped rather than guessed at.
 */
export declare const CHECKED_BODY_LANGS: Set<string>;

/** A body whose parentheses do not balance, or null when they do. */
export interface ParenOffence {
  kind: 'extra-close-paren' | 'unclosed-paren' | 'unterminated-dollar-quote';
  offset: number;
  depth?: number;
}

/** One unbalanced body, with a 1-based line number in the FILE. */
export interface BodyBalanceFinding {
  kind: ParenOffence['kind'];
  lang: string;
  line: number;
  depth?: number;
}

/**
 * Bodies of DO blocks and CREATE FUNCTION/PROCEDURE, read off the AST — never
 * matched out of the text, since a dollar-quoted region is only a body when the
 * parser says so.
 */
export declare function collectFunctionBodies(ast: unknown): Array<{ body: string; lang: string }>;

/** Counts parentheses in a body, skipping strings, comments and nested quotes. */
export declare function parenBalance(body: string): ParenOffence | null;

/** Unbalanced sql/plpgsql bodies in one file. */
export declare function bodyBalanceFindings(sql: string, ast: unknown): BodyBalanceFinding[];
