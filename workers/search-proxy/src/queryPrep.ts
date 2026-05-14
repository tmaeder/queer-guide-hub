/**
 * Query preprocessing — script detection, token sanitisation, stop-word
 * detection. Used before invoking the search pipeline so we can fast-path
 * the cases that historically produced bad/slow results:
 *
 *   - Non-Latin queries that have no Latin alias in the index (bug #10)
 *     would fuzz-match random Latin documents. We now return empty with
 *     a `reason: 'unsupported_script'` flag.
 *
 *   - Punctuation/emoji-only queries (bug #16) collapse to whitespace
 *     after tokenisation and would otherwise pass through to ranking.
 *
 *   - Bare LGBTQ+ tokens (bug #9) are stop-words for the venue/event
 *     indexes, but on their own they should still produce a result —
 *     they get routed to the popular-entities path rather than the
 *     ranking pipeline.
 */

export type Script = "latin" | "han" | "cyrillic" | "arabic" | "hebrew" | "devanagari" | "thai" | "korean" | "mixed";

const SCRIPT_RANGES: Array<[RegExp, Script]> = [
	[/[A-Za-zÀ-ɏ]/, "latin"],
	[/[一-鿿㐀-䶿぀-ゟ゠-ヿ]/, "han"], // CJK + kana
	[/[Ѐ-ӿ]/, "cyrillic"],
	[/[؀-ۿݐ-ݿ]/, "arabic"],
	[/[֐-׿]/, "hebrew"],
	[/[ऀ-ॿ]/, "devanagari"],
	[/[฀-๿]/, "thai"],
	[/[가-힯]/, "korean"],
];

export function detectScript(s: string): Script {
	const found = new Set<Script>();
	for (const ch of s) {
		for (const [re, name] of SCRIPT_RANGES) {
			if (re.test(ch)) {
				found.add(name);
				break;
			}
		}
		if (found.size > 1) return "mixed";
	}
	if (found.size === 0) return "latin";
	return [...found][0];
}

/**
 * Strip punctuation/emoji/control chars and collapse whitespace. Returns the
 * residual tokens. Caller can short-circuit when this is empty (bug #16).
 */
export function tokenize(s: string): string[] {
	// Replace anything that isn't a letter, digit, hyphen, apostrophe or whitespace.
	const cleaned = s
		.replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width chars
		.replace(/[^\p{L}\p{N}\-'\s]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (!cleaned) return [];
	return cleaned.split(/\s+/);
}

const LGBTQ_TOKENS = new Set(["gay", "queer", "trans", "lgbt", "lgbtq", "lgbtq+", "lgbti"]);

/** True when the entire query is one or more LGBTQ+ stop-words. */
export function isBareLgbtqQuery(tokens: string[]): boolean {
	if (tokens.length === 0) return false;
	return tokens.every((t) => LGBTQ_TOKENS.has(t.toLowerCase()));
}
