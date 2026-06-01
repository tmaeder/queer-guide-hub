import { describe, it, expect } from "vitest";
import { detectScript, tokenize, isBareLgbtqQuery } from "../src/queryPrep";

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

describe("isBareLgbtqQuery", () => {
	it("true when every token is an LGBTQ+ stop-word", () => expect(isBareLgbtqQuery(["gay", "queer"])).toBe(true));
	it("false when mixed with a real term", () => expect(isBareLgbtqQuery(["gay", "bar"])).toBe(false));
	it("false for empty", () => expect(isBareLgbtqQuery([])).toBe(false));
});
