import { describe, it, expect } from "vitest";
import { allowedIds, extractSlugLikeRefs, validateGrounding } from "../src/grounding";
import type { Card } from "../src/types";

const cards: Card[] = [
	{ objectID: "uuid-1", type: "venue", title: "Berghain", slug: "berghain-1" },
	{ objectID: "uuid-2", type: "venue", title: "KitKatClub", slug: "kitkatclub" },
];

describe("allowedIds", () => {
	it("includes lowercased objectIDs and slugs", () => {
		const s = allowedIds(cards);
		expect(s.has("uuid-1")).toBe(true);
		expect(s.has("berghain-1")).toBe(true);
		expect(s.has("kitkatclub")).toBe(true);
	});
});

describe("extractSlugLikeRefs", () => {
	it("pulls hyphenated slug-like tokens", () => {
		expect(extractSlugLikeRefs("check out berghain-1 and the-eagle-3")).toEqual(["berghain-1", "the-eagle-3"]);
	});
	it("ignores plain words", () => {
		expect(extractSlugLikeRefs("a nice bar in berlin")).toEqual([]);
	});
});

describe("validateGrounding", () => {
	it("passes when prose only references tool-returned slugs", () => {
		const r = validateGrounding("I'd suggest berghain-1 tonight.", cards);
		expect(r.ok).toBe(true);
		expect(r.unknownRefs).toEqual([]);
	});
	it("flags a slug no tool returned", () => {
		const r = validateGrounding("Try fake-club-9 instead.", cards);
		expect(r.ok).toBe(false);
		expect(r.unknownRefs).toContain("fake-club-9");
	});
	it("is clean for prose with no slug-like refs", () => {
		expect(validateGrounding("There are a few great spots nearby.", cards).ok).toBe(true);
	});
});
