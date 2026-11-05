/**
 * Script detection and tokenisation for search. Punctuation-only queries
 * collapse to an empty token list and can skip backend ranking.
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
