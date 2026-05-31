/**
 * Grounding guardrail (plan §6.4). The hard guarantee is structural: the cards
 * the UI renders come ONLY from tool results, never from model prose. This
 * module adds a best-effort soft check that the model's text doesn't reference
 * entity slugs/ids that no tool returned, so we can flag (and log) hallucinated
 * references for monitoring.
 */

import type { Card } from "./types";

export function allowedIds(cards: Card[]): Set<string> {
	const s = new Set<string>();
	for (const c of cards) {
		if (c.objectID) s.add(c.objectID.toLowerCase());
		if (typeof c.slug === "string" && c.slug) s.add(c.slug.toLowerCase());
	}
	return s;
}

/** Slug-like tokens (lowercase, hyphenated, len>=3) the model might cite. */
export function extractSlugLikeRefs(text: string): string[] {
	const matches = text.match(/\b[a-z0-9]+(?:-[a-z0-9]+){1,}\b/g) ?? [];
	return Array.from(new Set(matches.filter((m) => m.length >= 3)));
}

export interface GroundingReport {
	ok: boolean;
	/** Slug-like references in the prose that no tool result backs. */
	unknownRefs: string[];
}

/**
 * Soft validation: any slug-like reference in the answer should correspond to a
 * card a tool returned. Returns the unknown ones for logging. Does not mutate
 * the answer — the authoritative grounded output is the `cards` array itself.
 */
export function validateGrounding(text: string, cards: Card[]): GroundingReport {
	const allowed = allowedIds(cards);
	const refs = extractSlugLikeRefs(text);
	const unknownRefs = refs.filter((r) => !allowed.has(r));
	return { ok: unknownRefs.length === 0, unknownRefs };
}
