// Types for ./profession-keywords.js.
//
// The implementation is plain JS because it is imported by BOTH Deno edge
// functions (TypeScript) and the Node repair script
// (scripts/data-quality/verify-personality-wikidata.mjs). This declaration
// keeps the TypeScript side fully typed without forcing the Node side through a
// build step.

/** Free-text profession (any language) → English occupation keywords. */
export declare const PROFESSION_KEYWORDS: Record<string, string[]>;

/** Spelling variants of a German token: "Schriftsteller/in" → "schriftsteller". */
export declare function stripGenderSuffix(token: string): string[];

/**
 * Map a free-text profession onto English occupation keywords.
 * Falls back to `[profession]` when nothing maps — check hasProfessionMapping()
 * before treating a zero score as a conflict.
 */
export declare function keywordsFor(profession: string): string[];

/** True when `profession` maps to real keywords rather than the raw fallback. */
export declare function hasProfessionMapping(profession: string | null | undefined): boolean;

/** Fraction of `keywords` found in any of `occupations` (0..1). */
export declare function scoreOccupationMatch(occupations: string[], keywords: string[]): number;
