import { describe, it, expect } from "vitest";
import { expandWithPgSynonyms, matchesTerm, type PgSynonym } from "../src/pgSynonyms";

/**
 * The matcher used to be a bare substring test, so a term fired inside any
 * longer word.
 *
 * THE FIXTURES ARE SPLIT BY EVIDENCE, AND THE DISTINCTION IS LOAD-BEARING.
 * The `measured live` block was observed on PRODUCTION via the search
 * endpoint's own `debug.embedText`, which echoes the expanded embedding query —
 * every one of those terms is `status='active'` today, so each was a real false
 * fire served to real traffic. The `prospective` block is terms sitting in
 * `approved`: they could not fire yet, and they are here because the companion
 * migration activates them in the same PR, so the fix must land first.
 *
 * A first draft of this file called the prospective set "live". It was not —
 * all eight are `approved` — and the correction is why the live set exists:
 * querying the DB for which terms are ACTIVE is what separates a measured
 * defect from a reasoned one.
 *
 * Every "compound" case is a real German pattern in this corpus that a strict
 * word boundary would have broken. That pair is the whole argument for the
 * length threshold — neither extreme passes both halves.
 */
const pad = (q: string) => ` ${q.toLowerCase()} `;

describe("matchesTerm", () => {
	// MEASURED LIVE on prod (debug.embedText), every term status='active':
	//   "ticket office hours"     -> "ketamine"            (ket in tiCKETt)
	//   "barber shop berlin"      -> "kneipe pub"          (bar in BARber)
	//   "doing laundry today"     -> "dom / doi / dob / doc" (doi in DOIng)
	//   "nepal travel guide"      -> "nep / neh"           (nep in NEPal)
	it.each([
		["ket", "ticket office hours"],
		["bar", "barber shop berlin"],
		["doi", "doing laundry today"],
		["nep", "nepal travel guide"],
		["bi", "bistro berlin"],
		["uti", "beautiful utility room"],
		["weed", "tweed jacket"],
	])("does not fire the live term %s inside %s", (term, query) => {
		expect(matchesTerm(pad(query), term)).toBe(false);
	});

	// PROSPECTIVE — status='approved' today, activated by the companion
	// migration. Not yet served to anyone; the fix is what makes activating
	// them safe.
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

	// …and the live terms must still fire as whole words, or the fix has
	// traded a false positive for a false negative on working rows.
	it.each([
		["bar", "gay bar berlin"],
		["ket", "ket harm reduction"],
		["weed", "weed legalisation"],
		["bi", "bi visibility day"],
	])("still fires the live term %s as a whole word in %s", (term, query) => {
		expect(matchesTerm(pad(query), term)).toBe(true);
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
