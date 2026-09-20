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
