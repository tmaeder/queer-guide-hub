import { describe, it, expect } from "vitest";
import { expandWithPgSynonyms } from "../src/pgSynonyms";

type Syn = Parameters<typeof expandWithPgSynonyms>[1][number];
const syn = (over: Partial<Syn>): Syn =>
	({ terms: [], replacements: [], indexes: [], locale: "*", is_one_way: false, ...over }) as Syn;

describe("expandWithPgSynonyms", () => {
	it("appends replacements when the query contains a term", () => {
		const out = expandWithPgSynonyms("gay club", [syn({ terms: ["club"], replacements: ["nightclub", "disco"] })]);
		expect(out.sort()).toEqual(["disco", "nightclub"]);
	});

	it("is bidirectional by default (query has a replacement → append terms)", () => {
		const out = expandWithPgSynonyms("disco night", [syn({ terms: ["club"], replacements: ["disco"] })]);
		expect(out).toContain("club");
	});

	it("one-way rows do not reverse", () => {
		const out = expandWithPgSynonyms("disco", [syn({ terms: ["club"], replacements: ["disco"], is_one_way: true })]);
		expect(out).toEqual([]);
	});

	it("filters by locale", () => {
		const out = expandWithPgSynonyms("club", [syn({ terms: ["club"], replacements: ["disco"], locale: "de" })], { locale: "en" });
		expect(out).toEqual([]);
	});

	it("does not echo words already present in the query", () => {
		const out = expandWithPgSynonyms("club disco", [syn({ terms: ["club"], replacements: ["disco"] })]);
		expect(out).toEqual([]);
	});

	it("returns [] for empty query or no synonyms", () => {
		expect(expandWithPgSynonyms("", [syn({ terms: ["club"], replacements: ["disco"] })])).toEqual([]);
		expect(expandWithPgSynonyms("club", [])).toEqual([]);
	});
});
