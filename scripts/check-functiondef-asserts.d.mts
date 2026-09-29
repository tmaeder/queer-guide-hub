/** One unstripped assertion found in a SQL migration. */
export interface FunctiondefAssertFinding {
  /** 1-based line number of the pg_get_functiondef call. */
  line: number;
  /** Trimmed source excerpt, capped at 120 characters. */
  excerpt: string;
}

/**
 * Find assertions that inspect pg_get_functiondef() without first removing
 * SQL line comments.
 */
export declare function findUnstrippedAsserts(sql: string): FunctiondefAssertFinding[];

/** Leading 14-digit version of a migration path, or null when there is none. */
export declare function versionOf(file: string): string | null;

/**
 * Split added migration paths into those still worth checking and those already
 * applied to prod (`db push` matches on version and skips an applied one).
 *
 * `applied` is null when no token was available. That case keeps EVERY file —
 * the strict behaviour is the fallback, so a missing secret can only make the
 * guard noisier, never quieter.
 */
export declare function withoutApplied(
  files: string[],
  applied: Set<string> | null,
): { checked: string[]; exempt: string[] };
