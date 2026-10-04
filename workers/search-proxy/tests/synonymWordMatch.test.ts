import { describe, it, expect } from "vitest";
import { expandWithPgSynonyms, matchesTerm, type PgSynonym } from "../src/pgSynonyms";

/**
 * The matcher used to be a bare substring test, so a term fired inside any
 * longer word. Every "hazard" case below was a LIVE false fire before the fix,
 * and every "compound" case is a real German pattern in this corpus that a
 * strict word boundary would have broken. The pair is the whole argument for
 * the length threshold — neither extreme passes both halves.
 */
const pad = (q: string) => ` ${q.toLowerCase()} `;

describe("matchesTerm", () => {
	// Short terms must not match inside a longer word.
	it.each([
		["rack", "bracket racing"],
		["doc", "doctor appointment"],
		["arts", "parts for my bike"],
		["scat", "scattered showers"],
		["slam", "islam and lgbtq rights"],
		["upper", "supper club"],
		["crack", "cracker barrel"],
		["k2", "k2000 bar"],
	])("does not fire %s inside %s", (term, query) => {
		expect(matchesTerm(pad(query), term)).toBe(false);
	});

	// …but the same terms must still match as whole words.
	it.each([
		["rack", "rack bdsm meaning"],
		["slam", "slam chemsex"],
		["coke", "coke harm reduction"],
		["doc", "doc"],
		["k2", "k2 synthetic"],
	])("fires %s as a whole word in %s", (term, query) => {
		expect(matchesTerm(pad(query), term)).toBe(true);
	});

	// German compounds: a long stem may match as a word prefix.
	it.each([
		["lachgas", "lachgaskapseln kaufen"],
		["mischkonsum", "mischkonsumrisiken"],
		["kräutermischung", "kräutermischungen"],
	])("fires the compound stem %s in %s", (term, query) => {
		expect(matchesTerm(pad(query), term)).toBe(true);
	});

	it("the threshold sits in a measured gap, not on a round number", () => {
		// Longest hazard stem is `crack` (5); shortest compound stem is
		// `lachgas` (7). A 5-char term must never prefix-match; a 7-char one must.
		expect(matchesTerm(pad("cracker barrel"), "crack")).toBe(false);
		expect(matchesTerm(pad("lachgaskapseln"), "lachgas")).toBe(true);
	});

	it("an empty term never matches", () => {
		expect(matchesTerm(pad("anything"), "")).toBe(false);
	});
});

describe("expandWithPgSynonyms uses word matching", () => {
	const rows: PgSynonym[] = [
		{ terms: ["slam"], replacements: ["safer injecting"], is_one_way: true, indexes: [], locale: "*" },
		{ terms: ["lachgas"], replacements: ["nitrous oxide"], is_one_way: true, indexes: [], locale: "*" },
	];

	it("no longer appends safer injecting to a question about Islam", () => {
		expect(expandWithPgSynonyms("islam and lgbtq rights", rows)).toEqual([]);
	});

	it("still appends it to a chemsex query", () => {
		expect(expandWithPgSynonyms("slam chemsex", rows)).toContain("safer injecting");
	});

	it("still resolves a German compound", () => {
		expect(expandWithPgSynonyms("lachgaskapseln kaufen", rows)).toContain("nitrous oxide");
	});

	it("respects the locale filter", () => {
		const de: PgSynonym[] = [
			{ terms: ["pep"], replacements: ["amphetamin"], is_one_way: true, indexes: [], locale: "de" },
		];
		expect(expandWithPgSynonyms("pep", de, { locale: "en" })).toEqual([]);
		expect(expandWithPgSynonyms("pep", de, { locale: "de" })).toContain("amphetamin");
	});
});
