import { describe, it, expect } from "vitest";
import { cityFilterApplies, detectScript, tokenize } from "../src/queryPrep";

describe("detectScript", () => {
	it("classifies latin (incl. accents)", () => expect(detectScript("berlin café")).toBe("latin"));
	it("classifies han / cyrillic / korean", () => {
		expect(detectScript("柏林")).toBe("han");
		expect(detectScript("Берлин")).toBe("cyrillic");
		expect(detectScript("서울")).toBe("korean");
	});
	it("flags mixed scripts", () => expect(detectScript("berlin 柏林")).toBe("mixed"));
	it("defaults punctuation-only to latin", () => expect(detectScript("!!!")).toBe("latin"));
});

describe("tokenize", () => {
	it("strips punctuation/emoji and collapses whitespace", () => expect(tokenize("  gay   bar!! 🎉 ")).toEqual(["gay", "bar"]));
	it("keeps hyphens and apostrophes", () => expect(tokenize("o'neil's well-known")).toEqual(["o'neil's", "well-known"]));
	it("returns [] for emoji-only (bug #16)", () => expect(tokenize("🎉🌈")).toEqual([]));
	it("removes zero-width chars", () => expect(tokenize("a​b")).toEqual(["ab"]));
});

describe("cityFilterApplies", () => {
	it("does not filter a bare city query", () => {
		expect(cityFilterApplies(["berlin"], "berlin")).toBe(false);
		expect(cityFilterApplies(["  Berlin! "], "berlin")).toBe(false);
		expect(cityFilterApplies(["new york"], "new york")).toBe(false);
		expect(cityFilterApplies(["in berlin"], "berlin")).toBe(false);
	});
	it("filters a city plus a topic", () => {
		expect(cityFilterApplies(["bars in berlin"], "berlin")).toBe(true);
		expect(cityFilterApplies(["drag berlin"], "berlin")).toBe(true);
		expect(cityFilterApplies(["new york saunas"], "new york")).toBe(true);
		expect(cityFilterApplies(["schwule bars in der stadt berlin"], "berlin")).toBe(true);
	});
	it("needs the city typed as a whole word", () => {
		expect(cityFilterApplies(["rock hudson"], "new york")).toBe(false);
		expect(cityFilterApplies(["berliner bars"], "berlin")).toBe(false);
	});
	it("accepts the city from the translation when the original is in another script", () => {
		expect(cityFilterApplies(["柏林 酒吧", "bars in berlin"], "berlin")).toBe(true);
		expect(cityFilterApplies(["柏林", "berlin"], "berlin")).toBe(false);
	});
	it("does nothing without a city", () => {
		expect(cityFilterApplies(["bars"], null)).toBe(false);
		expect(cityFilterApplies(["bars"], "")).toBe(false);
	});
});
