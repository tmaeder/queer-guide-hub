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

// Words that join a city to a topic and say nothing on their own: "bars IN
// berlin", "bars À paris". A query left with only these after the city is
// removed is a bare city query.
const CITY_CONNECTORS = new Set([
	"in", "at", "near", "around", "of", "the", "city",
	"im", "der", "bei", "nahe", "stadt",
	"en", "à", "a", "de", "du", "la", "le", "el",
	"di", "nel", "nella", "em", "no", "na",
]);

/**
 * Should an LLM-extracted city become a HARD filter on this query?
 *
 * Only when the reader typed the city AND asked for something in it ("bars in
 * berlin", "drag berlin"). A query that IS the city ("berlin") must not filter:
 * the filter keeps only rows filed under that city, so every type without a
 * city (news, marketplace, people, tags) dropped out. Measured 2026-11-27: the
 * 1,823 hits for "berlin" were exactly the city-bearing types, while the index
 * held 107 news and 213 marketplace rows titled Berlin. The City card still
 * ranks first through the exact-title boost.
 *
 * `texts` are the strings the city may have been typed in (the original query
 * and its translation). The city is matched as a whole word, never a
 * substring, so "berliner" does not count as typing "berlin".
 */
export function cityFilterApplies(texts: string[], city: string | null | undefined): boolean {
	if (!city) return false;
	const cityTokens = tokenize(city.toLowerCase());
	if (cityTokens.length === 0) return false;
	for (const text of texts) {
		const tokens = tokenize(text.toLowerCase());
		const at = indexOfRun(tokens, cityTokens);
		if (at < 0) continue;
		const rest = [...tokens.slice(0, at), ...tokens.slice(at + cityTokens.length)];
		return rest.some((t) => !CITY_CONNECTORS.has(t));
	}
	return false;
}

function indexOfRun(tokens: string[], run: string[]): number {
	outer: for (let i = 0; i + run.length <= tokens.length; i++) {
		for (let j = 0; j < run.length; j++) if (tokens[i + j] !== run[j]) continue outer;
		return i;
	}
	return -1;
}
