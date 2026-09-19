/**
 * Types for the migration-version allocator, so
 * `src/lib/__tests__/migrationVersionAllocator.test.ts` can import it without
 * an implicit `any` (TS7016).
 *
 * Declared rather than baselined, following scripts/check-migration-sql.d.mts:
 * CLAUDE.md's rule is to fix a typecheck error instead of recording it, and the
 * alternative here — reimplementing the allocation rules inside the test —
 * would let the allocator and its guard drift apart, which is the one thing the
 * test exists to prevent.
 */

/** Digits of Unix epoch seconds in a version. */
export declare const EPOCH_DIGITS: number;

/** The highest expressible 14-digit version. */
export declare const MAX_VERSION: string;

/**
 * The 4-digit prefix, `9999` by default, overridable via
 * `MIGRATION_VERSION_PREFIX`. Throws unless the value is exactly 4 digits.
 */
export declare function prefix(env?: Record<string, string | undefined>): string;

/**
 * The 14-digit version for an instant, ignoring what is already claimed.
 * Throws rather than truncating once the epoch outgrows EPOCH_DIGITS — a
 * silent width change would invert sort order for the whole corpus.
 */
export declare function versionForEpoch(
  epochSeconds: number,
  env?: Record<string, string | undefined>,
): string;

/** 14-digit versions parsed out of migration basenames; others are skipped. */
export declare function versionsOf(files: Iterable<string>): string[];

/** Highest of a set of versions, or null. Fixed width, so a string compare. */
export declare function maxVersion(versions: Iterable<string>): string | null;

/** Increment a 14-digit version by one, preserving width. */
export declare function bumpVersion(version: string): string;

export interface Allocation {
  /** The allocated 14-digit version. */
  version: string;
  /** `'clock-derived'` in the ordinary case; otherwise why the floor engaged. */
  reason: string;
  /** Highest already-claimed version seen, or null. */
  floor: string | null;
}

/**
 * Allocate the next version from the clock, using `claimed` only as a floor.
 *
 * Deriving from `max + 1` is the round-number heuristic wearing a script's
 * clothes — two sessions reading the same max get the same answer, which is the
 * bug this exists to remove. The floor engages ONLY when something is already
 * claimed above the clock, and says so when it does.
 */
export declare function allocate(opts?: {
  claimed?: Iterable<string>;
  now?: number;
  env?: Record<string, string | undefined>;
}): Allocation;

export interface VersionReplacement {
  content: string;
  /** Occurrences rewritten. */
  hits: number;
  /** Bare citations left alone (bound-only mode); 0 otherwise. */
  bare: number;
}

/**
 * Rewrite a version in text.
 *
 * `boundOnly` restricts the rewrite to references that NAME the migration —
 * `<version>_<slug>` or `migration:<version>` — leaving a bare version in prose
 * alone and counting it. That distinction is load-bearing outside the migration
 * file itself: CLAUDE.md alone cites 215 distinct versions, and rewriting those
 * would corrupt the record to fix a filename.
 */
export declare function replaceVersion(
  content: string,
  oldVersion: string,
  newVersion: string,
  opts?: { boundOnly?: boolean },
): VersionReplacement;
